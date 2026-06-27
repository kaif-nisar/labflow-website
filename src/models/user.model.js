import mongoose, { Schema } from "mongoose";
import { Tenant } from "./tenant.model.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

const activeSessionSchema = new Schema(
  {
    session_token: {
      type: String,
      required: true,
      index: true,
    },
    device_fingerprint: {
      type: String,
      default: "",
      trim: true,
    },
    last_activity_at: {
      type: Date,
      default: Date.now,
    },
    ip_address: {
      type: String,
      default: "",
      trim: true,
    },
    user_agent: {
      type: String,
      default: "",
      trim: true,
    },
    location: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      city: { type: String, default: "", trim: true },
      state: { type: String, default: "", trim: true },
      country: { type: String, default: "", trim: true },
      label: { type: String, default: "", trim: true },
      source: { type: String, default: "", trim: true },
    },
    expires_at: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    profileimage: {
      type: String,
      default: ""
    },
    nabllogo: {
      type: String,
      default: ""
    },
    profileimagepublicid: {
      type: String,
      default: ""
    },
    nabllogopublicid: {
      type: String,
      default: ""
    },
    resetPasswordToken: {
      type: String,
    },
    resetPasswordExpires: {
      type: Date,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      enum: [
        "admin",
        "superFranchisee",
        "franchisee",
        "subFranchisee",
        "staff",
      ],
    },
    password: {
      type: String,
      required: [true, "password is required"],
      trim: true,
    },
    refreshToken: {
      type: String,
    },
    is_device_restriction_enabled: {
      type: Boolean,
      default: true,
    },
    max_allowed_devices: {
      type: Number,
      default: 1,
      min: 1,
      max: 4,
    },
    active_sessions: {
      type: [activeSessionSchema],
      default: [],
    },
    upiScreenshots: [
      {
        url: {
          type: String,
          default: "",
        },
        publicId: {
          type: String,
          default: "",
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
        remarks: {
          type: String,
          default: "",
        },
        verifiedAt: {
          type: Date,
        },
        verifiedBy: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],

    // Booking wallet - separate from commission wallet
    bookingWallet: {
      type: Number,
      default: 0,
    },

    // Commission wallet - for referral earnings
    commissionWallet: {
      type: Number,
      default: 0,
    },
    // Overdraft / negative balance permission
    // If `overdraftAllowed` is true the bookingWallet may go negative up to `overdraftLimit`
    overdraftAllowed: {
      type: Boolean,
      default: false,
    },
    overdraftLimit: {
      type: Number,
      default: 0,
    },

    // Admin permission for superFranchisee to manage overdraft limits for their franchisees
    canManageOverdraft: {
      type: Boolean,
      default: false,
    },

    // Subscription Management
    subscription: {
      // duration of subscription
      plan: {
        type: String,
        enum: ["basic", "monthly", "quaterly", "yearly"],
        default: "basic",
      },
      // model layer (1layer..4layer)
      planLayer: {
        type: String,
        enum: ["1layer", "2layer", "3layer", "4layer"],
        default: "1layer",
      },
      amount: {
        type: Number,
        default: 700,
      },
      durationDays: {
        type: Number,
        default: 30,
      },
      startDate: {
        type: Date,
        default: Date.now,
      },
      endDate: {
        type: Date,
        default: function () {
          return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
        },
      },
      isActive: {
        type: Boolean,
        default: true,
      },
      autoRenew: {
        type: Boolean,
        default: false,
      },
      gracePeriod: {
        days: { type: Number, default: 0 },
        months: { type: Number, default: 0 },
        hours: { type: Number, default: 0 },
        isEnabled: { type: Boolean, default: false },
        graceUntil: { type: Date, default: null },
        note: { type: String, default: "" },
      },
      renewalHistory: [
        {
          renewedAt: Date,
          amount: Number,
          paymentMethod: String,
          transactionId: String,
          referralCommissionPaid: Number,
          referredBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
          },
          role: {
            type: String,
            enum: ["admin", "superFranchisee", "franchisee", "subFranchisee", "staff"],
          },
          // keep duration and layer separate for clarity
          planDuration: {
            type: String,
            enum: ["basic", "monthly", "quaterly", "yearly"],
          },
          planLayer: {
            type: String,
            enum: ["1layer", "2layer", "3layer", "4layer"],
          },
        },
      ],
    },

    // Referral System
    referral: {
      referredBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
      referralCode: {
        type: String,
        unique: true,
        sparse: true,
        index: true,
      },
      referredUsers: [
        {
          userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
          },
          joinedAt: {
            type: Date,
            default: Date.now,
          },
          totalCommissionEarned: {
            type: Number,
            default: 0,
          },
        },
      ],
      totalReferrals: {
        type: Number,
        default: 0,
      },
      totalCommissionEarned: {
        type: Number,
        default: 0,
      },
    },

    createdAt: { type: Date, default: Date.now },
    phoneNo: Number,
    state: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    district: {
      type: String,
      trim: true,
    },
    postOffice: {
      type: String,
    },
    pinCode: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // Booking Ledger
    bookingLedger: [
      {
        transactionId: String,
        type: { type: String, enum: ["credit", "debit"] },
        amount: Number,
        description: String,
        balanceAfterTransaction: Number,
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // Commission Ledger
    commissionLedger: [
      {
        transactionId: String,
        type: { type: String, enum: ["credit", "debit", "withdrawal"] },
        amount: Number,
        description: String,
        referredUserId: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        balanceAfterTransaction: Number,
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // Withdrawal Requests
    withdrawalRequests: [
      {
        requestId: {
          type: String,
          unique: true,
          sparse: true, // ✅ This allows multiple null/undefined values while keeping actual values unique
        },
        amount: Number,
        status: {
          type: String,
          enum: ["pending", "approved", "rejected", "processed"],
          default: "pending",
        },
        requestedAt: {
          type: Date,
          default: Date.now,
        },
        processedAt: Date,
        processedBy: {
          type: Schema.Types.ObjectId,
          ref: "SuperAdmin",
        },
        bankDetails: {
          accountNumber: String,
          ifscCode: String,
          accountHolderName: String,
          bankName: String,
        },
        rejectionReason: String,
      },
    ],
// if user model create path parentUser  is required at validate
    parentUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        // Only require parentUser if the role is NOT admin or superAdmin
        // Previously this only excluded "superAdmin" which caused a validation
        // error when creating an 'admin' user during tenant signup.
        return !["admin", "superAdmin"].includes(this.role);
      },
      index: true,
    },

    pdfFormat: {
      type: String,
      default: "reportFormat1",
    },
    showtestdatabase: {
      type: Boolean,
      default: true,
    },
    showprintsetting: {
      type: Boolean,
      default: false,
    },
    showRandomBtn: {
      type: Boolean,
      default: false,
    },
    permissions: {
      canManageBookings: { type: Boolean, default: true },
      canManageTest: { type: Boolean, default: false },
      canManagePayments: { type: Boolean, default: false },
      canViewReports: { type: Boolean, default: false },
      canManageUsers: { type: Boolean, default: false },
    },
    lastLogin: {
      type: Date,
    },
    parentRole: {
      type: String,
      enum: [
        "superAdmin",
        "admin",
        "franchisee",
        "superFranchisee",
        "subFranchisee",
        "staff",
      ],
      default: "staff",
    },
    activities: [
      {
        activityType: {
          type: String,
          enum: [
            "login",
            "booking",
            "payment",
            "user_management",
            "test_create",
            "subscription_renewal",
            "subscription_expiry", // ✅ Add this line
            "logout",
            "referral_commission",
            "withdrawal_request",
            'booking_created',
            'booking_updated',
            'booking_deleted',
            'booking_cancellation',
            'expiry_warning_sent',
            "other",
          ],
        },
        details: {
          type: Schema.Types.Mixed,
        },
        reference: {
          model: String,
          id: Schema.Types.ObjectId,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
userSchema.index({ "subscription.endDate": 1 });
userSchema.index({ "subscription.isActive": 1 });

// Pre-save middleware for password hashing
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

// Generate unique referral code
userSchema.pre("save", function () {
  if (!this.referral.referralCode && this.isNew) {
    this.referral.referralCode =
      this.username.toUpperCase() +
      Math.random().toString(36).substr(2, 6).toUpperCase();
  }
});

// FIXED: Pre-save middleware to handle parentUser for existing users
userSchema.pre("save", function () {
  // If this is an existing user being updated and parentUser is not set
  if (!this.isNew && !this.parentUser) {
    const rolesWithoutParent = ['admin', 'superAdmin'];
    if (!rolesWithoutParent.includes(this.role)) {
      // Set parentUser to null instead of leaving it undefined
      this.parentUser = null;
    }
  }
});

// Methods
userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      tenantId: this.tenantId,
      role: this.role,
    },
    process.env.SUPER_ADMIN_ACCESS_TOKEN_SECRET,
    {
      jwtid: randomUUID(),
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    }
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.SUPER_ADMIN_REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

// Check if subscription is expired
userSchema.methods.isSubscriptionExpired = function () {
  const effectiveEnd =
    this.subscription?.gracePeriod?.graceUntil ||
    this.subscription?.endDate;
  if (!effectiveEnd) return false;
  return new Date() > new Date(effectiveEnd);
};

// Check if subscription is about to expire (within 5 days)
userSchema.methods.isSubscriptionExpiringSoon = function () {
  const fiveDaysFromNow = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const effectiveEnd =
    this.subscription?.gracePeriod?.graceUntil ||
    this.subscription?.endDate;
  if (!effectiveEnd) return false;
  return new Date(effectiveEnd) <= fiveDaysFromNow;
};

// FIXED: Deactivate expired subscription - use updateOne to avoid validation
userSchema.methods.deactivateExpiredSubscription = async function () {
  if (this.isSubscriptionExpired()) {
    // Use updateOne to avoid triggering validation
    await this.constructor.updateOne(
      { _id: this._id },
      {
        'subscription.isActive': false,
        'isActive': false,
        $push: {
          activities: {
            activityType: "subscription_expiry",
            details: {
              expiredAt: new Date(),
              plan: this.subscription.plan,
            },
            timestamp: new Date()
          }
        }
      }
    );
    return { success: true };
  }
  return { success: false };
};

// FIXED: Safer renewal method
userSchema.methods.renewSubscription = async function (paymentDetails) {
  try {
    const { amount = 0, paymentMethod = 'manual', transactionId, durationMonths, planType } = paymentDetails || {};

    // Determine duration in months
    let months = 0;
    if (typeof durationMonths === 'number' && durationMonths > 0) {
      months = Math.floor(durationMonths);
    } else if (planType) {
      const pt = String(planType).toLowerCase();
      if (pt === 'quaterly' || pt === 'quarterly') months = 3;
      else if (pt === 'yearly' || pt === 'annual') months = 12;
      else months = 1;
    } else {
      // Fallback: infer months from amount vs price (if price provided in schema)
      const pricePerMonth = (this.subscription && this.subscription.amount) ? Number(this.subscription.amount) : 2000;
      months = Math.max(1, Math.round(Number(amount || pricePerMonth) / pricePerMonth));
    }

    const now = new Date();
    const addedMs = months * 30 * 24 * 60 * 60 * 1000;

    // Compute new user subscription end by extending if active
    const userCurrentEnd = this.subscription?.endDate ? new Date(this.subscription.endDate) : null;
    let newUserEnd;
    let userStartToSet;
    if (userCurrentEnd && this.subscription?.isActive && userCurrentEnd.getTime() > now.getTime()) {
      newUserEnd = new Date(userCurrentEnd.getTime() + addedMs);
      userStartToSet = this.subscription.startDate || now;
    } else {
      newUserEnd = new Date(now.getTime() + addedMs);
      userStartToSet = now;
    }

    // Commission handling
    const commissionRate = 0.2;
    const commissionAmount = Number(amount || 0) * commissionRate;
    let referralCommissionPaid = 0;

    // Determine planDuration from months for renewal history
    let planDuration = 'monthly';
    if (months >= 12) planDuration = 'yearly';
    else if (months >= 3) planDuration = 'quaterly';
    else planDuration = 'monthly';

    // Prepare renewal entry
    const renewalEntry = {
      renewedAt: now,
      amount: Number(amount || 0),
      paymentMethod,
      transactionId: transactionId || `MANUAL_${Date.now()}`,
      referralCommissionPaid: 0,
      role: this.role,
      plan: this.subscription?.plan,
      planDuration: planDuration,  // ✅ Added: subscription duration
      planLayer: this.subscription?.planLayer,  // ✅ Added: product layer
    };

    // If referred, compute and credit referrer
    if (this.referral && this.referral.referredBy) {
      const referrer = await this.constructor.findById(this.referral.referredBy);
      if (referrer) {
        referralCommissionPaid = Number(commissionAmount) || 0;
        // Update referrer with commission
        const prevReferrerBalance = Number(referrer.commissionWallet || 0);
        const newReferrerBalance = prevReferrerBalance + referralCommissionPaid;

        await this.constructor.updateOne(
          { _id: referrer._id },
          {
            $inc: { commissionWallet: referralCommissionPaid, 'referral.totalCommissionEarned': referralCommissionPaid },
            $push: {
              commissionLedger: {
                transactionId: `COMM_${transactionId || Date.now()}`,
                type: 'credit',
                amount: referralCommissionPaid,
                description: `Referral commission from ${this.fullName}'s subscription renewal`,
                referredUserId: this._id,
                balanceAfterTransaction: newReferrerBalance,
                createdAt: new Date(),
              },
              activities: {
                activityType: 'referral_commission',
                details: { amount: referralCommissionPaid, fromUser: this.fullName, transactionId: transactionId },
                timestamp: new Date(),
              }
            }
          }
        );

        renewalEntry.referralCommissionPaid = referralCommissionPaid;
        renewalEntry.referredBy = this.referral.referredBy;
      }
    }

    // Build user update object
    const updateObj = {
      $set: {
        'subscription.startDate': userStartToSet,
        'subscription.endDate': newUserEnd,
        'subscription.durationDays': months * 30,
        'subscription.isActive': true,
        'subscription.gracePeriod.days': 0,
        'subscription.gracePeriod.months': 0,
        'subscription.gracePeriod.hours': 0,
        'subscription.gracePeriod.isEnabled': false,
        'subscription.gracePeriod.graceUntil': null,
        'subscription.gracePeriod.note': '',
        isActive: true,
      },
      $push: {
        'subscription.renewalHistory': renewalEntry,
        activities: {
          activityType: 'subscription_renewal',
          details: {
            amount: Number(amount || 0),
            plan: this.subscription?.plan,
            paymentMethod,
            transactionId: renewalEntry.transactionId || renewalEntry.transactionId,
            durationMonths: months,
          },
          timestamp: now,
        }
      }
    };

    // Update the user record
    await this.constructor.updateOne({ _id: this._id }, updateObj);

    // Update Tenant subscription plan if exists (extend if active)
    const tenant = await Tenant.findOne({ 'adminDetails.userId': this._id });
    if (tenant) {
      const tenantCurrentEnd = tenant.subscriptionPlan?.endDate ? new Date(tenant.subscriptionPlan.endDate) : null;
      let newTenantEnd;
      let tenantStartToSet;
      if (tenantCurrentEnd && tenant.subscriptionPlan?.isActive && tenantCurrentEnd.getTime() > now.getTime()) {
        newTenantEnd = new Date(tenantCurrentEnd.getTime() + addedMs);
        tenantStartToSet = tenant.subscriptionPlan.startDate || now;
      } else {
        newTenantEnd = new Date(now.getTime() + addedMs);
        tenantStartToSet = now;
      }

      await Tenant.updateOne(
        { _id: tenant._id },
        {
          $set: {
            'subscriptionPlan.isActive': true,
            'subscriptionPlan.paymentStatus': 'paid',
            'subscriptionPlan.startDate': tenantStartToSet,
            'subscriptionPlan.endDate': newTenantEnd,
            'subscriptionPlan.durationDays': months * 30,
            'subscriptionPlan.gracePeriod.days': 0,
            'subscriptionPlan.gracePeriod.months': 0,
            'subscriptionPlan.gracePeriod.hours': 0,
            'subscriptionPlan.gracePeriod.isEnabled': false,
            'subscriptionPlan.gracePeriod.graceUntil': null,
            'subscriptionPlan.gracePeriod.note': '',
            'subscriptionPlan.price': this.subscription?.amount || tenant.subscriptionPlan?.price || tenant.subscriptionPlan?.price,
            'subscriptionPlan.planDuration': planDuration,  // ✅ Update duration on renewal
            'subscriptionPlan.planLayer': this.subscription?.planLayer || tenant.subscriptionPlan?.planLayer,  // ✅ Preserve layer
          }
        }
      );
    }

    return { success: true };
  } catch (error) {
    console.error('Error in renewSubscription:', error);
    throw error;
  }
};

// Request withdrawal
userSchema.methods.requestWithdrawal = async function (amount, bankDetails) {
  if (amount > this.commissionWallet) {
    throw new Error("Insufficient commission balance");
  }

  const requestId = `WD_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 6)
    .toUpperCase()}`;

  // Use updateOne to avoid validation issues
  await this.constructor.updateOne(
    { _id: this._id },
    {
      $push: {
        withdrawalRequests: {
          requestId: requestId,
          amount: amount,
          bankDetails: bankDetails,
          requestedAt: new Date(),
        },
        activities: {
          activityType: "withdrawal_request",
          details: {
            amount: amount,
            requestId: requestId,
            bankDetails: bankDetails,
          },
          timestamp: new Date()
        }
      }
    }
  );

  return { success: true, requestId };
};

// Use commission for renewal
userSchema.methods.renewWithCommission = async function (totalAmount) {
  const commissionToUse = Math.min(this.commissionWallet, totalAmount);
  const remainingAmount = totalAmount - commissionToUse;

  if (commissionToUse > 0) {
    // Use updateOne to avoid validation
    await this.constructor.updateOne(
      { _id: this._id },
      {
        $inc: { commissionWallet: -commissionToUse },
        $push: {
          commissionLedger: {
            transactionId: `RENEWAL_${Date.now()}`,
            type: "debit",
            amount: commissionToUse,
            description: "Used commission for subscription renewal",
            balanceAfterTransaction: this.commissionWallet - commissionToUse,
          }
        }
      }
    );
  }

  return {
    commissionUsed: commissionToUse,
    remainingAmount: remainingAmount,
  };
};

// FIXED: Safer log activity method
userSchema.methods.logActivity = async function (activityType, details, reference = null) {
  try {
    const activity = {
      activityType,
      details,
      timestamp: new Date(),
    };

    if (reference) {
      activity.reference = reference;
    }

    // Use updateOne to avoid validation issues
    await this.constructor.updateOne(
      { _id: this._id },
      { $push: { activities: activity } }
    );

    return { success: true };
  } catch (error) {
    console.error('Error logging activity:', error);
    return { success: false, error: error.message };
  }
};

// FIXED: Static method to safely deactivate expired subscriptions
userSchema.statics.deactivateExpiredSubscriptions = async function () {
  try {
    const result = await this.updateMany(
      {
        $expr: {
          $lt: [
            { $ifNull: ["$subscription.gracePeriod.graceUntil", "$subscription.endDate"] },
            new Date(),
          ],
        },
        "subscription.isActive": true,
      },
      {
        "subscription.isActive": false,
        "isActive": false,
        $push: {
          activities: {
            activityType: "subscription_expiry",
            details: {
              expiredAt: new Date(),
              autoDeactivated: true,
            },
            timestamp: new Date()
          }
        }
      }
    );

    return result.modifiedCount;
  } catch (error) {
    console.error('Error in deactivateExpiredSubscriptions:', error);
    return 0;
  }
};

// Static method to get users with expiring subscriptions
userSchema.statics.getExpiringSubscriptions = async function (days = 5) {
  const expiryDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  return this.find({
    $expr: {
      $and: [
        {
          $lte: [
            { $ifNull: ["$subscription.gracePeriod.graceUntil", "$subscription.endDate"] },
            expiryDate,
          ],
        },
        {
          $gte: [
            { $ifNull: ["$subscription.gracePeriod.graceUntil", "$subscription.endDate"] },
            new Date(),
          ],
        },
      ],
    },
    "subscription.isActive": true,
  });
};

export const User = mongoose.model("User", userSchema);
