// controllers/subscriptionController.js
import { User } from "../models/user.model.js";
import { SuperAdmin } from "../models/superAdmin.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import { Tenant } from "../models/tenant.model.js";
import { Payment } from "../models/payment.model.js";
const GST_RATE = 0.18;
let razorpay = null;
let razorpayMode = "unknown";
let razorpayConfigKey = "";
const isOfflineMode = String(process.env.OFFLINE_MODE || "").toLowerCase() === "true";

function createMockRazorpayClient() {
  return {
    orders: {
      create: async (options) => ({
        id: `order_mock_${Date.now()}`,
        status: "created",
        ...options,
      }),
      fetch: async (orderId) => ({
        id: orderId,
        status: "created",
        notes: {},
      }),
    },
    payments: {
      fetch: async (paymentId) => ({
        id: paymentId,
        status: "captured",
        amount: 0,
      }),
    },
    subscriptions: {
      create: async (options) => {
        console.log("Mock subscription created with options:", options);
        return {
          id: "sub_mock_123456",
          status: "created",
          ...options,
        };
      },
    },
  };
}

function getRazorpayGateway() {
  if (isOfflineMode) {
    if (!razorpay || razorpayMode !== "offline-mock") {
      console.warn("Offline mode is enabled, using mock Razorpay gateway.");
      razorpay = createMockRazorpayClient();
      razorpayConfigKey = "";
    }

    razorpayMode = "offline-mock";
    return { razorpay, gatewayMode: "offline-mock" };
  }

  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  const hasKeys = Boolean(keyId && keySecret);
  const allowMockGateway = process.env.NODE_ENV !== "production";

  if (hasKeys) {
    const nextConfigKey = `${keyId}:${keySecret}`;
    if (!razorpay || razorpayMode !== "live" || razorpayConfigKey !== nextConfigKey) {
      razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
      razorpayConfigKey = nextConfigKey;
    }
    razorpayMode = "live";
    return { razorpay, gatewayMode: "live" };
  }

  if (allowMockGateway) {
    if (!razorpay || razorpayMode !== "mock") {
      console.warn("⚠️ Razorpay keys not found, using mock Razorpay object");
      razorpay = createMockRazorpayClient();
      razorpayConfigKey = "";
    }
    razorpayMode = "mock";
    return { razorpay, gatewayMode: "mock" };
  }

  if (razorpayMode !== "disabled") {
    console.error("❌ Razorpay keys are missing in production. Payment gateway disabled.");
  }
  razorpay = null;
  razorpayMode = "disabled";
  razorpayConfigKey = "";
  return { razorpay: null, gatewayMode: "disabled" };
}

function buildRazorpayReceipt(prefix, userId) {
  const safePrefix = String(prefix || "rcpt").slice(0, 8);
  const userPart = String(userId || "").slice(-8);
  const timePart = Date.now().toString(36);
  return `${safePrefix}_${userPart}_${timePart}`.slice(0, 40);
}

function addGst(baseAmount) {
  const base = Number(baseAmount || 0);
  const gstAmount = Math.round(base * GST_RATE);
  const totalAmount = Math.round(base + gstAmount);
  return { baseAmount: Math.round(base), gstRate: 18, gstAmount, totalAmount };
}

// Create subscription payment order
export const createSubscriptionOrder = async (req, res) => {
  try {
    const { planType: requestedPlanType, currency = "INR" } = req.body;
    const userId = req.user._id;
    const { razorpay: razorpayGateway, gatewayMode } = getRazorpayGateway();

    const user = await User.findById(userId).select("fullName email phoneNo tenantId subscription");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const tenant = await Tenant.findById(user.tenantId).select("subscriptionPlan planCatalog");
    if (!tenant) {
      return res.status(404).json({ message: "Tenant not found" });
    }

    const planConfig = getRechargePlansFromTenant(tenant, user);
    const selectedPlan = getNormalizedPlanType(requestedPlanType) || planConfig.defaultSelectedPlan;
    const selectedPlanDetails = planConfig.availablePlans.find((plan) => plan.planType === selectedPlan);

    if (!selectedPlanDetails) {
      return res.status(400).json({ message: "Selected plan is not available for this tenant" });
    }

    // Business rule: minimum recharge must be yearly (or longer).
    if (!["yearly", "twoyear", "fouryear"].includes(selectedPlanDetails.planType)) {
      return res.status(400).json({
        message: "Minimum recharge plan is yearly",
        minimumRechargePlan: "yearly",
        selectedPlan: selectedPlanDetails.planType,
      });
    }

    if (!razorpayGateway?.orders?.create) {
      return res.status(503).json({
        message: "Payment gateway is not configured on server",
        code: "RAZORPAY_NOT_CONFIGURED",
      });
    }

    const orderAmountInPaise = Math.round(Number(selectedPlanDetails.amount || 0) * 100);
    if (!orderAmountInPaise || orderAmountInPaise <= 0) {
      return res.status(400).json({ message: "Invalid plan amount configured for selected plan" });
    }

	    // Create Razorpay order
	    const order = await razorpayGateway.orders.create({
	      amount: orderAmountInPaise,
	      currency: currency,
	      receipt: buildRazorpayReceipt("sub", userId),
	      notes: {
	        userId: userId.toString(),
	        tenantId: String(user.tenantId),
        type: "subscription_renewal",
        planType: selectedPlanDetails.planType,
        durationMonths: String(selectedPlanDetails.durationMonths || 12),
      }
    });

    await Payment.create({
      razorpay_order_id: order.id,
      amount: Number(selectedPlanDetails.amount),
      currency,
      status: "created",
      for: "subscription",
      refId: user.tenantId,
      meta: {
        userId: String(userId),
        planType: selectedPlanDetails.planType,
        durationMonths: Number(selectedPlanDetails.durationMonths || 12),
        gstRate: Number(selectedPlanDetails.gstRate || 18),
        gstAmount: Number(selectedPlanDetails.gstAmount || 0),
        baseAmount: Number(selectedPlanDetails.baseAmount || selectedPlanDetails.amount || 0),
        isUpgrade: selectedPlanDetails.planType !== planConfig.currentPlan,
      },
    });

    res.status(200).json({
      success: true,
      order: order,
      selectedPlan: selectedPlanDetails,
      minimumRechargePlan: "yearly",
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
      gatewayMode,
      user: {
        name: user.fullName,
        email: user.email,
        phone: user.phoneNo
      }
    });
  } catch (error) {
    console.error("Error creating subscription order:", error);
    res.status(500).json({ message: "Error creating payment order", error: error.message });
  }
};

// Verify subscription payment
export const verifySubscriptionPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const userId = req.user._id;
    const { razorpay: razorpayGateway } = getRazorpayGateway();
    if (!process.env.RAZORPAY_KEY_SECRET || !razorpayGateway?.payments?.fetch || !razorpayGateway?.orders?.fetch) {
      return res.status(503).json({
        message: "Payment verification is not configured on server",
        code: "RAZORPAY_NOT_CONFIGURED",
      });
    }

    const paymentRecord = await Payment.findOne({ razorpay_order_id });
    if (!paymentRecord) {
      return res.status(404).json({ message: "Payment order not found" });
    }

    // Idempotency: if already marked as paid, return success without duplicate renewal.
    if (paymentRecord.status === "paid") {
      const existingUser = await User.findById(userId).select("subscription");
      return res.status(200).json({
        success: true,
        message: "Payment already verified",
        subscription: existingUser?.subscription,
      });
    }

    // Verify signature
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature !== expectedSign) {
      return res.status(400).json({ message: "Invalid payment signature" });
    }

    // Get payment details from gateway as second-level verification.
    const payment = await razorpayGateway.payments.fetch(razorpay_payment_id);
    const order = await razorpayGateway.orders.fetch(razorpay_order_id);
    const gatewayStatus = String(payment?.status || "").toLowerCase();
    if (!["captured", "authorized"].includes(gatewayStatus)) {
      await Payment.updateOne(
        { _id: paymentRecord._id },
        {
          $set: {
            status: "failed",
            razorpay_payment_id,
            razorpay_signature,
          },
        }
      );
      return res.status(400).json({ message: `Invalid payment status: ${gatewayStatus || "unknown"}` });
    }

    const paidAmount = Number(payment?.amount || 0) / 100;
    if (Math.round(paidAmount * 100) !== Math.round(Number(paymentRecord.amount || 0) * 100)) {
      await Payment.updateOne(
        { _id: paymentRecord._id },
        {
          $set: {
            status: "failed",
            razorpay_payment_id,
            razorpay_signature,
          },
        }
      );
      return res.status(400).json({ message: "Paid amount does not match order amount" });
    }

    // Find user and renew subscription
    const user = await User.findById(userId).select("tenantId subscription");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (order?.notes?.userId && String(order.notes.userId) !== String(userId)) {
      return res.status(403).json({ message: "Order does not belong to this user" });
    }

    const planType = getNormalizedPlanType(paymentRecord?.meta?.planType || order?.notes?.planType || "yearly");
    const durationMonths =
      Number(paymentRecord?.meta?.durationMonths || order?.notes?.durationMonths || 12) || 12;

    // Editor/TS may not infer mongoose instance methods on the returned Document type.
    // Cast to any for the method call to avoid type-checker warnings while keeping runtime behavior.
    /** @type {any} */
    const userAny = user;

    // Renew subscription
    await userAny.renewSubscription({
      amount: Number(paymentRecord.amount),
      paymentMethod: "razorpay",
      transactionId: razorpay_payment_id,
      planType,
      durationMonths,
    });

    await Payment.updateOne(
      { _id: paymentRecord._id },
      {
        $set: {
          status: "paid",
          razorpay_payment_id,
          razorpay_signature,
        },
      }
    );

    res.status(200).json({
      success: true,
      message: "Subscription renewed successfully",
      subscription: user.subscription
    });
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ message: "Error verifying payment", error: error.message });
  }
};

export const getRechargeOptions = async (req, res) => {
  try {
    const userId = req.user._id;
    const { gatewayMode } = getRazorpayGateway();
    const user = await User.findById(userId).select("tenantId subscription");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const tenant = await Tenant.findById(user.tenantId).select("subscriptionPlan planCatalog name code");
    if (!tenant) {
      return res.status(404).json({ message: "Tenant not found" });
    }

    const planConfig = getRechargePlansFromTenant(tenant, user);
    return res.status(200).json({
      success: true,
      tenant: {
        id: tenant._id,
        name: tenant.name,
        code: tenant.code,
      },
      currentPlan: planConfig.currentPlan,
      defaultSelectedPlan: planConfig.defaultSelectedPlan,
      minimumRechargePlan: "yearly",
      availablePlans: planConfig.availablePlans,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
      gatewayMode,
      canUpgrade: true,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching recharge options:", error);
    return res.status(500).json({ message: "Error fetching recharge options", error: error.message });
  }
};

export const handleRazorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return res.status(500).json({ message: "Webhook secret not configured" });
    }

    const signature = req.headers["x-razorpay-signature"];
    if (!signature) {
      return res.status(400).json({ message: "Missing webhook signature" });
    }

    const rawBody = req.body;
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (signature !== expectedSignature) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const event = JSON.parse(rawBody.toString());
    if (event?.event !== "payment.captured") {
      return res.status(200).json({ success: true, message: "Event ignored" });
    }

    const payloadPayment = event?.payload?.payment?.entity;
    const orderId = payloadPayment?.order_id;
    const paymentId = payloadPayment?.id;
    if (!orderId || !paymentId) {
      return res.status(400).json({ message: "Invalid payment payload" });
    }

    const existing = await Payment.findOne({ razorpay_order_id: orderId });
    if (!existing) {
      return res.status(200).json({ success: true, message: "No matching order found" });
    }

    if (existing.status === "paid") {
      return res.status(200).json({ success: true, message: "Already processed" });
    }

    await Payment.updateOne(
      { _id: existing._id },
      {
        $set: {
          status: "paid",
          razorpay_payment_id: paymentId,
          meta: {
            ...(existing.meta || {}),
            webhookCapturedAt: new Date(),
          },
        },
      }
    );

    return res.status(200).json({ success: true, message: "Webhook processed" });
  } catch (error) {
    console.error("Error processing Razorpay webhook:", error);
    return res.status(500).json({ message: "Webhook processing failed" });
  }
};

function getNormalizedPlanType(value) {
  const normalized = String(value || "").toLowerCase().trim();
  if (normalized === "annual") return "yearly";
  if (normalized === "quarterly") return "quaterly";
  if (["2year", "2years", "two-year", "two year"].includes(normalized)) return "twoyear";
  if (["4year", "4years", "four-year", "four year"].includes(normalized)) return "fouryear";
  if (["monthly", "quaterly", "yearly", "twoyear", "fouryear"].includes(normalized)) return normalized;
  return "";
}

function getRechargePlansFromTenant(tenant, user) {
  const rawCurrentPlan = getNormalizedPlanType(
    tenant?.subscriptionPlan?.planType || user?.subscription?.plan || "monthly"
  ) || "yearly";

  const catalog = tenant?.planCatalog || {};
  const yearlyFromCatalog = Number(catalog?.yearly?.price);
  const twoyearFromCatalog = Number(catalog?.twoyear?.price);
  const fouryearFromCatalog = Number(catalog?.fouryear?.price);

  const currentPrice = Number(tenant?.subscriptionPlan?.price || user?.subscription?.amount || 0);
  const inferredYearly =
    rawCurrentPlan === "fouryear"
      ? currentPrice / 4
      : rawCurrentPlan === "twoyear"
        ? currentPrice / 2
        : rawCurrentPlan === "yearly"
          ? currentPrice
          : currentPrice * 12;
  const yearlyBase = Number.isFinite(inferredYearly) && inferredYearly > 0 ? inferredYearly : 24000;

  const priceMap = {
    yearly: yearlyFromCatalog > 0 ? yearlyFromCatalog : yearlyBase,
    twoyear: twoyearFromCatalog > 0 ? twoyearFromCatalog : yearlyBase * 2,
    fouryear: fouryearFromCatalog > 0 ? fouryearFromCatalog : yearlyBase * 4,
  };

  const currentPlan = ["yearly", "twoyear", "fouryear"].includes(rawCurrentPlan)
    ? rawCurrentPlan
    : "yearly";

  const yearlyGst = addGst(priceMap.yearly);
  const twoyearGst = addGst(priceMap.twoyear);
  const fouryearGst = addGst(priceMap.fouryear);

  return {
    currentPlan,
    // Default preselects current plan in UI; backend still enforces yearly minimum during order creation.
    defaultSelectedPlan: currentPlan,
    availablePlans: [
      { planType: "yearly", amount: yearlyGst.totalAmount, durationMonths: 12, selectable: true, ...yearlyGst },
      { planType: "twoyear", amount: twoyearGst.totalAmount, durationMonths: 24, selectable: true, ...twoyearGst },
      { planType: "fouryear", amount: fouryearGst.totalAmount, durationMonths: 48, selectable: true, ...fouryearGst },
    ],
  };
}

// Renew subscription with commission
export const renewWithCommission = async (req, res) => {
  try {
    const { totalAmount, useCommission = true } = req.body;
    const userId = req.user._id;
    const { razorpay: razorpayGateway } = getRazorpayGateway();

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let commissionUsed = 0;
    let remainingAmount = totalAmount;

    if (useCommission && user.commissionWallet > 0) {
      const result = await user.renewWithCommission(totalAmount);
      commissionUsed = result.commissionUsed;
      remainingAmount = result.remainingAmount;
    }

	    if (remainingAmount > 0) {
      if (!razorpayGateway?.orders?.create) {
        return res.status(503).json({
          message: "Payment gateway is not configured on server",
          code: "RAZORPAY_NOT_CONFIGURED",
        });
      }
	      // Create Razorpay order for remaining amount
	      const order = await razorpayGateway.orders.create({
	        amount: remainingAmount * 100,
	        currency: "INR",
	        receipt: buildRazorpayReceipt("psub", userId),
	        notes: {
	          userId: userId.toString(),
	          type: "partial_subscription_renewal",
          commissionUsed: commissionUsed
        }
      });

      res.status(200).json({
        success: true,
        order: order,
        commissionUsed: commissionUsed,
        remainingAmount: remainingAmount,
        message: `₹${commissionUsed} commission applied. Pay remaining ₹${remainingAmount}`
      });
    } else {
      // Full amount covered by commission
      // Cast to any so the editor/TS server recognizes the instance method
      /** @type {any} */
      const userAny = user;

      await userAny.renewSubscription({
        amount: totalAmount,
        paymentMethod: "commission",
        transactionId: `COMM_${Date.now()}`
      });

      res.status(200).json({
        success: true,
        message: "Subscription renewed successfully using commission",
        commissionUsed: commissionUsed,
        subscription: user.subscription
      });
    }
  } catch (error) {
    console.error("Error renewing with commission:", error);
    res.status(500).json({ message: "Error processing renewal", error: error.message });
  }
};

// Get subscription status
export const getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('subscription commissionWallet bookingWallet');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      subscription: user.subscription,
      commissionWallet: user.commissionWallet,
      bookingWallet: user.bookingWallet,
      isExpired: user.isSubscriptionExpired(),
      isExpiringSoon: user.isSubscriptionExpiringSoon()
    });
  } catch (error) {
    console.error("Error fetching subscription status:", error);
    res.status(500).json({ message: "Error fetching subscription status", error: error.message });
  }
};

// Request withdrawal
export const requestWithdrawal = async (req, res) => {
  try {
    const { amount, bankDetails } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (amount > user.commissionWallet) {
      return res.status(400).json({ message: "Insufficient commission balance" });
    }

    if (amount < 100) {
      return res.status(400).json({ message: "Minimum withdrawal amount is ₹100" });
    }

    await user.requestWithdrawal(amount, bankDetails);

    res.status(200).json({
      success: true,
      message: "Withdrawal request submitted successfully",
      commissionWallet: user.commissionWallet
    });
  } catch (error) {
    console.error("Error requesting withdrawal:", error);
    res.status(500).json({ message: "Error requesting withdrawal", error: error.message });
  }
};

// Get withdrawal history
export const getWithdrawalHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('withdrawalRequests commissionWallet');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      withdrawalRequests: user.withdrawalRequests,
      commissionWallet: user.commissionWallet
    });
  } catch (error) {
    console.error("Error fetching withdrawal history:", error);
    res.status(500).json({ message: "Error fetching withdrawal history", error: error.message });
  }
};

// Get referral dashboard
export const getReferralDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId)
      .select('referral commissionWallet')
      .populate('referral.referredUsers.userId', 'fullName email createdAt subscription');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      referralCode: user.referral.referralCode,
      totalReferrals: user.referral.totalReferrals,
      totalCommissionEarned: user.referral.totalCommissionEarned,
      commissionWallet: user.commissionWallet,
      referredUsers: user.referral.referredUsers
    });
  } catch (error) {
    console.error("Error fetching referral dashboard:", error);
    res.status(500).json({ message: "Error fetching referral dashboard", error: error.message });
  }
};

// Register with referral code
export const registerWithReferral = async (req, res) => {
  try {
    const { referralCode, ...userData } = req.body;

    let referrer = null;
    if (referralCode) {
      referrer = await User.findOne({ 'referral.referralCode': referralCode });
      if (!referrer) {
        return res.status(400).json({ message: "Invalid referral code" });
      }
    }

    // Create new user
    const newUser = new User({
      ...userData,
      'referral.referredBy': referrer ? referrer._id : null
    });

    await newUser.save();

    // If referred, update referrer's data
    if (referrer) {
      referrer.referral.referredUsers.push({
        userId: newUser._id,
        joinedAt: new Date()
      });
      referrer.referral.totalReferrals += 1;
      
      await referrer.logActivity("new_referral", {
        referredUser: newUser.fullName,
        referredUserEmail: newUser.email
      });
      
      await referrer.save();
    }

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: {
        _id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        fullName: newUser.fullName,
        referralCode: newUser.referral.referralCode
      }
    });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ message: "Error registering user", error: error.message });
  }
};

// Super Admin: Process withdrawal request
export const processWithdrawalRequest = async (req, res) => {
  try {
    const { userId, requestId, action, rejectionReason } = req.body;
    const superAdminId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const withdrawalRequest = user.withdrawalRequests.find(req => req.requestId === requestId);
    if (!withdrawalRequest) {
      return res.status(404).json({ message: "Withdrawal request not found" });
    }

    if (withdrawalRequest.status !== "pending") {
      return res.status(400).json({ message: "Request already processed" });
    }

    if (action === "approve") {
      withdrawalRequest.status = "approved";
      withdrawalRequest.processedAt = new Date();
      withdrawalRequest.processedBy = superAdminId;
      
      // Deduct from commission wallet
      user.commissionWallet -= withdrawalRequest.amount;
      
      // Add to commission ledger
      user.commissionLedger.push({
        transactionId: `WD_${requestId}`,
        type: "withdrawal",
        amount: withdrawalRequest.amount,
        description: `Withdrawal processed - ${requestId}`,
        balanceAfterTransaction: user.commissionWallet
      });
      
      await user.logActivity("withdrawal_processed", {
        requestId: requestId,
        amount: withdrawalRequest.amount,
        processedBy: superAdminId
      });
      
    } else if (action === "reject") {
      withdrawalRequest.status = "rejected";
      withdrawalRequest.processedAt = new Date();
      withdrawalRequest.processedBy = superAdminId;
      withdrawalRequest.rejectionReason = rejectionReason;
      
      await user.logActivity("withdrawal_rejected", {
        requestId: requestId,
        amount: withdrawalRequest.amount,
        reason: rejectionReason,
        processedBy: superAdminId
      });
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: `Withdrawal request ${action}ed successfully`,
      withdrawalRequest: withdrawalRequest
    });
  } catch (error) {
    console.error("Error processing withdrawal request:", error);
    res.status(500).json({ message: "Error processing withdrawal request", error: error.message });
  }
};

// Super Admin: Get all withdrawal requests
export const getAllWithdrawalRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    const matchCondition = {};
    if (status) {
      matchCondition["withdrawalRequests.status"] = status;
    }

    const users = await User.aggregate([
      { $unwind: "$withdrawalRequests" },
      { $match: matchCondition },
      {
        $lookup: {
          from: "users",
          localField: "withdrawalRequests.processedBy",
          foreignField: "_id",
          as: "processedBy"
        }
      },
      {
        $project: {
          _id: 1,
          fullName: 1,
          email: 1,
          phoneNo: 1,
          withdrawalRequest: "$withdrawalRequests",
          processedBy: { $arrayElemAt: ["$processedBy.fullName", 0] }
        }
      },
      { $sort: { "withdrawalRequest.requestedAt": -1 } },
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) }
    ]);

    res.status(200).json({
      success: true,
      withdrawalRequests: users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(users.length / limit),
        hasNext: page * limit < users.length,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error("Error fetching withdrawal requests:", error);
    res.status(500).json({ message: "Error fetching withdrawal requests", error: error.message });
  }
};

// Get remaining days stats dashboard
export const getRefferalDashboardStats = asyncHandler(async (req, res) => {
  // Assume req.user._id is set by auth middleware
  const userId = req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  // Get user with referral and subscription info
  const user = await User.findById(userId).lean();

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  // Calculate days remaining in subscription
  let daysRemaining = 0;
  if (user.subscription && user.subscription.endDate) {
    const now = new Date();
    const end = new Date(user.subscription.endDate);
    daysRemaining = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  }

  // Total referrals (direct)
  const totalReferrals = user.referral?.totalReferrals || 0;

  // Total earnings (commission wallet + totalCommissionEarned)
  const totalEarnings = user.referral?.totalCommissionEarned || 0;

  // Wallet balance (commission wallet)
  const walletBalance = user.commissionWallet || 0;
  // Prepare response
  res.json({
    success: true,
    daysRemaining,
    totalReferrals,
    totalEarnings,
    walletBalance,
    subscriptionStatus: user.subscription?.isActive ? "active" : "inactive",
    referralCode: user.referral?.referralCode || "",
    plan: user.subscription?.plan || "basic"
  });
});

// @desc    Get referral stats
// @route   GET /api/v1/user/referrals/stats
// @access  Private
export const getReferralStats = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const totalReferrals = user.referral.totalReferrals || 0;
  const successfulConversions = user.referral.referredUsers?.filter(
    (r) => r.totalCommissionEarned > 0
  ).length || 0;

  const totalEarned = user.referral.totalCommissionEarned || 0;

  const pendingApprovals = user.referral.referredUsers?.filter(
    (r) => r.totalCommissionEarned === 0
  ).length || 0;

  res.json({
    totalReferrals,
    successfulConversions,
    totalEarned,
    pendingApprovals,
  });
});

// @desc    Get referral history
// @route   GET /api/v1/user/referrals/history
// @access  Private
export const getReferralHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId).populate("referral.referredUsers.userId");

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const history = (user.referral.referredUsers || []).map((ref) => {
    const referredUser = ref.userId;

    return {
      date: ref.joinedAt?.toISOString().split("T")[0] || "N/A",
      email: referredUser?.email || "N/A",
      status: ref.totalCommissionEarned > 0 ? "Converted" : "Pending",
      earnings: ref.totalCommissionEarned || 0,
    };
  });

  res.json(history);
});


export const getSubscriptionAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const fiveDaysLater = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));

    // Active subscriptions
    const activeSubscriptions = await User.countDocuments({
      "subscription.isActive": true
    });

    // Expiring within 5 days
    const expiringSoon = await User.countDocuments({
      "subscription.endDate": { $lte: fiveDaysLater },
      "subscription.isActive": true
    });

    // Cancelled today (expired today)
    const cancelledToday = await User.countDocuments({
      "subscription.endDate": {
        $gte: startOfDay,
        $lt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)
      },
      "subscription.isActive": false
    });

    // New this month
    const newThisMonth = await User.countDocuments({
      "subscription.startDate": { $gte: startOfMonth }
    });

    // Plan-wise active users and revenue
    const aggregation = await User.aggregate([
      {
        $match: {
          "subscription.isActive": true
        }
      },
      {
        $group: {
          _id: "$subscription.plan",
          activeUsers: { $sum: 1 },
          totalRevenue: { $sum: "$subscription.amount" }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        activeSubscriptions,
        expiringSoon,
        cancelledToday,
        newThisMonth,
        planStats: aggregation // [{ _id: 'basic', activeUsers: 5, totalRevenue: 1000 }]
      }
    });
  } catch (err) {
    console.error("Subscription analytics error:", err);
    res.status(500).json({ success: false, message: "Analytics failed" });
  }
};

/**
 * Check tenant subscription status
 * Called by frontend to determine if subscription modal should be shown
 * 
 * Request: expects tenantId in request (from user object or JWT context)
 * Response: { isActive: boolean, subscription: {...}, status: string, message: string }
 */
export const checkTenantSubscription = async (req, res) => {
  try {
    // Get tenantId from authenticated user
    const user = req.user;
    
    if (!user || !user.tenantId) {
      return res.status(400).json({
        success: false,
        message: "User or tenant information not found",
        isActive: false
      });
    }

    const tenantId = user.tenantId._id || user.tenantId;

    // Fetch tenant subscription data
    const tenant = await Tenant.findById(tenantId).select(
      "subscriptionPlan status name code"
    );

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
        isActive: false
      });
    }

    // Check if subscription is active
    const subscription = tenant.subscriptionPlan;
    const isActive = subscription?.isActive === true;
    const endDate = subscription?.endDate ? new Date(subscription.endDate) : null;
    const graceUntil = subscription?.gracePeriod?.graceUntil
      ? new Date(subscription.gracePeriod.graceUntil)
      : null;
    const effectiveEndDate = graceUntil || endDate;
    const now = new Date();
    const isExpired = effectiveEndDate && effectiveEndDate < now;
    const inGracePeriod =
      Boolean(endDate && graceUntil) &&
      now > endDate &&
      now <= graceUntil;

    // Determine status
    let statusMessage = "active";
    if (!isActive) {
      statusMessage = "inactive";
    } else if (inGracePeriod) {
      statusMessage = "grace";
    } else if (isExpired) {
      statusMessage = "expired";
    }

    return res.status(200).json({
      success: true,
      isActive: isActive && !isExpired,
      subscription: {
        planDuration: subscription?.planDuration,
        planLayer: subscription?.planLayer,
        planType: subscription?.planType,
        durationDays: subscription?.durationDays,
        startDate: subscription?.startDate,
        endDate: subscription?.endDate,
        effectiveEndDate: effectiveEndDate,
        gracePeriod: subscription?.gracePeriod || null,
        price: subscription?.price,
        paymentStatus: subscription?.paymentStatus
      },
      status: statusMessage,
      tenantName: tenant.name,
      tenantCode: tenant.code,
      tenantStatus: tenant.status,
      message: inGracePeriod
        ? "Subscription is in grace period"
        : (isActive && !isExpired ? "Subscription is active" : "Subscription is not active")
    });
  } catch (error) {
    console.error("Error checking tenant subscription:", error);
    return res.status(500).json({
      success: false,
      message: "Error checking subscription status",
      isActive: false,
      error: error.message
    });
  }
};

/**
 * Get full tenant details (for admin dashboard)
 */
export const getTenantDetails = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.tenantId) {
      return res.status(400).json({
        success: false,
        message: "User or tenant information not found"
      });
    }

    const tenantId = user.tenantId._id || user.tenantId;
    const tenant = await Tenant.findById(tenantId);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: tenant
    });
  } catch (error) {
    console.error("Error fetching tenant details:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching tenant details",
      error: error.message
    });
  }
};

// const storage = multer.memoryStorage();
// const upload = multer({
//   storage: storage,
//   limits: {
//     fileSize: 5 * 1024 * 1024 // 5MB limit
//   },
//   fileFilter: (req, file, cb) => {
//     const allowedTypes = /jpeg|jpg|png|gif|webp/;
//     const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
//     const mimetype = allowedTypes.test(file.mimetype);

//     if (mimetype && extname) {
//       return cb(null, true);
//     } else {
//       cb(new Error('Only image files are allowed!'));
//     }
//   }
// }).single('screenshot');
