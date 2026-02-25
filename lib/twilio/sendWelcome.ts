import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function sendWelcomeWhatsApp(to: string) {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const templateSid = process.env.TWILIO_WHATSAPP_TEMPLATE_SID;

  if (!from || !templateSid) {
    throw new Error("WhatsApp configuration missing");
  }

  return client.messages.create({
    from,
    to: `whatsapp:${to}`,
    contentSid: templateSid,
  });
}