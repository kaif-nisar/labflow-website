import nodemailer from "nodemailer";

const MAX_NEWSLETTER_STAGE = 3;
const isOfflineMode = String(process.env.OFFLINE_MODE || "").toLowerCase() === "true";

const buildTransporter = () => {
  if (isOfflineMode || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

const getSender = () => {
  return process.env.EMAIL_USER || "no-reply@labflow.in";
};

const getStageTemplate = (subscriber, stage) => {
  const email = subscriber?.email || "there";

  switch (stage) {
    case 1:
      return {
        subject: "Welcome to LabFlow updates",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;">
            <div style="padding:24px 28px;background:linear-gradient(135deg,#1a6ef5,#00d4ff);color:#fff;border-radius:18px 18px 0 0;">
              <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.8;">LabFlow Newsletter</div>
              <h1 style="margin:12px 0 8px;font-size:28px;line-height:1.2;">Welcome to smarter lab operations</h1>
              <p style="margin:0;font-size:15px;line-height:1.7;opacity:.92;">Thanks for subscribing, ${email}. Your update sequence is now active.</p>
            </div>
            <div style="padding:28px;background:#ffffff;border:1px solid #e5eefc;border-top:none;border-radius:0 0 18px 18px;">
              <p style="margin:0 0 16px;line-height:1.8;">You will now receive product updates, workflow ideas, and practical notes about report formats, dashboards, billing, and franchise operations.</p>
              <div style="padding:18px;background:#f8fbff;border:1px solid #dbeafe;border-radius:14px;margin-bottom:18px;">
                <strong style="display:block;margin-bottom:8px;">What to expect first:</strong>
                <div style="line-height:1.8;">Original report previews, billing workflow insights, and platform feature highlights from the LabFlow portal.</div>
              </div>
              <p style="margin:0;line-height:1.8;color:#475569;">This is an automated email from LabFlow. No action is needed from your side.</p>
            </div>
          </div>
        `,
      };
    case 2:
      return {
        subject: "See how LabFlow organizes bookings, cases and reports",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;">
            <div style="padding:24px 28px;background:#091a38;color:#fff;border-radius:18px 18px 0 0;">
              <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.8;">Feature Walkthrough</div>
              <h2 style="margin:12px 0 8px;font-size:26px;line-height:1.25;">From booking desk to final report, keep every stage visible</h2>
            </div>
            <div style="padding:28px;background:#ffffff;border:1px solid #e5eefc;border-top:none;border-radius:0 0 18px 18px;">
              <p style="margin:0 0 16px;line-height:1.8;">LabFlow helps teams move through patient registration, case tracking, report review, invoicing, and dashboard monitoring without switching disconnected tools.</p>
              <ul style="padding-left:18px;margin:0 0 18px;line-height:1.9;">
                <li>Original letterhead report formats with doctor sign-off areas</li>
                <li>Case filters for booking number, franchisee, barcode, and status</li>
                <li>QR-ready invoices and billing records connected to the same workflow</li>
              </ul>
              <p style="margin:0;line-height:1.8;color:#475569;">More practical product ideas will follow automatically in the next message.</p>
            </div>
          </div>
        `,
      };
    case 3:
      return {
        subject: "Ready to explore LabFlow more deeply?",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;">
            <div style="padding:24px 28px;background:#0b1220;color:#fff;border-radius:18px 18px 0 0;">
              <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.8;">Product Highlights</div>
              <h2 style="margin:12px 0 8px;font-size:26px;line-height:1.25;">Dashboards, inventory, expenses and multi-branch control in one place</h2>
            </div>
            <div style="padding:28px;background:#ffffff;border:1px solid #e5eefc;border-top:none;border-radius:0 0 18px 18px;">
              <p style="margin:0 0 16px;line-height:1.8;">This final onboarding email highlights the operational side of LabFlow: admin dashboards, expense panels, order control, and inventory tracking for labs that want visibility beyond reporting.</p>
              <div style="padding:18px;background:#f8fbff;border:1px solid #dbeafe;border-radius:14px;margin-bottom:18px;">
                <strong style="display:block;margin-bottom:8px;">Useful modules included in the portal:</strong>
                <div style="line-height:1.8;">Analytics dashboard, all cases view, new booking, invoice generation, inventory management, expense records, and multi-layer franchise access.</div>
              </div>
              <p style="margin:0;line-height:1.8;color:#475569;">You will continue receiving normal newsletters and product communications after this onboarding sequence.</p>
            </div>
          </div>
        `,
      };
    default:
      return null;
  }
};

const getNextAutomationAt = (stage) => {
  const next = new Date();

  if (stage === 1) {
    next.setDate(next.getDate() + 2);
    return next;
  }

  if (stage === 2) {
    next.setDate(next.getDate() + 5);
    return next;
  }

  return null;
};

export const sendSubscriberAutomationEmail = async (subscriber, stage) => {
  const template = getStageTemplate(subscriber, stage);

  if (!template) {
    return null;
  }

  const transporter = buildTransporter();
  if (!transporter) {
    return {
      stage,
      nextAutomationAt: getNextAutomationAt(stage),
    };
  }

  await transporter.sendMail({
    from: `"LabFlow Updates" <${getSender()}>`,
    to: subscriber.email,
    subject: template.subject,
    html: template.html,
  });

  return {
    stage,
    nextAutomationAt: getNextAutomationAt(stage),
  };
};

export const advanceSubscriberAutomation = async (subscriber) => {
  const nextStage = Number(subscriber?.automationStage || 0) + 1;

  if (!subscriber || nextStage > MAX_NEWSLETTER_STAGE) {
    return null;
  }

  const result = await sendSubscriberAutomationEmail(subscriber, nextStage);
  const now = new Date();

  subscriber.automationStage = nextStage;
  subscriber.lastAutomationEmailSentAt = now;
  subscriber.nextAutomationAt = result?.nextAutomationAt || null;
  subscriber.lastAutomationError = "";

  if (nextStage === 1) {
    subscriber.welcomeEmailSentAt = now;
  }

  await subscriber.save({ validateBeforeSave: false });

  return {
    ...result,
    sentAt: now,
  };
};

export const rescheduleSubscriberAutomation = async (subscriber, error) => {
  if (!subscriber) {
    return null;
  }

  const retryAt = new Date(Date.now() + 60 * 60 * 1000);
  subscriber.nextAutomationAt = retryAt;
  subscriber.lastAutomationError = error?.message || "Newsletter automation failed";
  await subscriber.save({ validateBeforeSave: false });
  return retryAt;
};

export { MAX_NEWSLETTER_STAGE };
