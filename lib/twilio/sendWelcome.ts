import Twilio from "twilio";

const client = new Twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

export async function sendWelcomeWhatsApp(to: string) {
  return client.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER!,
    to: `whatsapp:${to}`,
    contentSid: process.env.TWILIO_WHATSAPP_TEMPLATE_SID!,
  });
}
