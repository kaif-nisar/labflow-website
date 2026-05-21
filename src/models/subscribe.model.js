// models/Subscriber.js
import mongoose from "mongoose";

const subscriberSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  subscribedAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ["active", "unsubscribed"],
    default: "active",
  },
  automationStage: {
    type: Number,
    default: 0,
    min: 0,
  },
  nextAutomationAt: {
    type: Date,
    default: Date.now,
  },
  welcomeEmailSentAt: {
    type: Date,
    default: null,
  },
  lastAutomationEmailSentAt: {
    type: Date,
    default: null,
  },
  lastAutomationError: {
    type: String,
    default: "",
  },
}, {
  timestamps: true,
});

subscriberSchema.index({ email: 1 }, { unique: true });

const Subscriber = mongoose.model('Subscriber', subscriberSchema);

export {Subscriber}
