import { Subscriber } from "../models/subscribe.model.js";
import {
  advanceSubscriberAutomation,
  rescheduleSubscriberAutomation,
} from "../utils/newsletterAutomation.js";

const subscribe = async (req, res) => {
  const normalizedEmail = String(req.body?.email || "").trim().toLowerCase();

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return res.status(400).json({
      success: false,
      message: "Invalid email address",
    });
  }

  try {
    let subscriber = await Subscriber.findOne({ email: normalizedEmail });

    if (subscriber && subscriber.status === "active") {
      return res.status(409).json({
        success: false,
        message: "You are already subscribed!",
      });
    }

    if (!subscriber) {
      subscriber = await Subscriber.create({
        email: normalizedEmail,
      });
    } else {
      subscriber.status = "active";
      subscriber.subscribedAt = new Date();
      subscriber.automationStage = 0;
      subscriber.nextAutomationAt = new Date();
      subscriber.lastAutomationError = "";
      subscriber.welcomeEmailSentAt = null;
      subscriber.lastAutomationEmailSentAt = null;
      await subscriber.save({ validateBeforeSave: false });
    }

    let responseMessage =
      "Thanks for subscribing! Automated email updates are now enabled.";

    try {
      await advanceSubscriberAutomation(subscriber);
      responseMessage =
        "Thanks for subscribing! Welcome email sent and follow-up updates are scheduled.";
    } catch (emailError) {
      console.error("Newsletter welcome email failed:", emailError);
      await rescheduleSubscriberAutomation(subscriber, emailError);
      responseMessage =
        "Thanks for subscribing! Your email is saved and automated updates will retry shortly.";
    }

    return res.status(200).json({
      success: true,
      automationEnabled: true,
      message: responseMessage,
    });
  } catch (error) {
    console.error("Subscribe Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

export { subscribe };
