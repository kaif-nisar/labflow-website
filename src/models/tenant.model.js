// tenant.model.js
import mongoose, { Schema } from "mongoose";

const tenantSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    logo: {
      type: String,
      default: ""
    },
    logopublicid: {
      type: String,
      default: ""
    },
    modelType: {
      type: String,
      enum: ["4layer", "3layer", "2layer", "1layer"],
      required: true,
    },
    // Reference to tests purchased from SuperAdmin
    purchasedTests: [
      {
        testId: { type: mongoose.Schema.Types.ObjectId, ref: "testSchema" },
        purchaseDate: { type: Date, default: Date.now },
        price: Number,
      },
    ],
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    adminDetails: {
      email: String,
      username: String,
      userId: { type: Schema.Types.ObjectId, ref: "User" },
    },
    subscriptionPlan: {
      planType: {
        type: String,
        enum: ["monthly", "quaterly", "yearly"],
        default: "monthly",
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
        required: true,
      },
      price: {
        type: Number,
        required: true,
      },
      paymentStatus: {
        type: String,
        enum: ["pending", "paid", "overdue"],
        default: "pending",
      },
      gracePeriod: {
        days: { type: Number, default: 0 },
        months: { type: Number, default: 0 },
        hours: { type: Number, default: 0 },
        isEnabled: { type: Boolean, default: false },
        graceUntil: { type: Date, default: null },
        note: { type: String, default: "" },
      },
      isActive: { type: Boolean, default: true },
    },
    // Optional per-tenant catalog used by recharge flow for upgrade plan choices.
    planCatalog: {
      monthly: {
        price: { type: Number, default: 0 },
      },
      quaterly: {
        price: { type: Number, default: 0 },
      },
      yearly: {
        price: { type: Number, default: 0 },
      },
      currency: {
        type: String,
        default: "INR",
      },
    },
    analytics: {
      totalUsers: { type: Number, default: 0 },
      totalTests: { type: Number, default: 0 },
      totalBookings: { type: Number, default: 0 },
      monthlyRevenue: { type: Number, default: 0 },
    },
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);


// Check if subscription is expired
tenantSchema.methods.isSubscriptionExpired = function () {
  const effectiveEnd =
    this.subscriptionPlan?.gracePeriod?.graceUntil ||
    this.subscriptionPlan?.endDate;
  if (!effectiveEnd) return false;
  return new Date() > new Date(effectiveEnd);
};

// Check if subscription is about to expire (within 5 days)
tenantSchema.methods.isSubscriptionExpiringSoon = function () {
  const fiveDaysFromNow = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const effectiveEnd =
    this.subscriptionPlan?.gracePeriod?.graceUntil ||
    this.subscriptionPlan?.endDate;
  if (!effectiveEnd) return false;
  return new Date(effectiveEnd) <= fiveDaysFromNow;
};

// tenant.model.js
tenantSchema.statics.deactivateExpiredSubscriptions = async function () {
  try {
    const result = await this.updateMany(
      {
        $expr: {
          $lt: [
            { $ifNull: ["$subscriptionPlan.gracePeriod.graceUntil", "$subscriptionPlan.endDate"] },
            new Date(),
          ],
        },
        "subscriptionPlan.isActive": true,
      },
      {
        $set: {
          "subscriptionPlan.isActive": false,
          status: "inactive",
        },
      }
    );

    console.log(`🔒 ${result.modifiedCount} tenants deactivated due to subscription expiry.`);
    return result.modifiedCount;
  } catch (error) {
    console.error("❌ Error deactivating expired tenants:", error);
    return 0;
  }
};


// Static method to get users with expiring subscriptions
tenantSchema.statics.getExpiringSubscriptions = async function (days = 5) {
  const expiryDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  return this.find({
    $expr: {
      $and: [
        {
          $lte: [
            { $ifNull: ["$subscriptionPlan.gracePeriod.graceUntil", "$subscriptionPlan.endDate"] },
            expiryDate,
          ],
        },
        {
          $gte: [
            { $ifNull: ["$subscriptionPlan.gracePeriod.graceUntil", "$subscriptionPlan.endDate"] },
            new Date(),
          ],
        },
      ],
    },
    "subscriptionPlan.isActive": true,
  });
};

export const Tenant = mongoose.model("Tenant", tenantSchema);
