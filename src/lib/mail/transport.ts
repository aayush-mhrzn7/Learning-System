import nodemailer, { type Transporter } from "nodemailer";
import { APP_NAME } from "./config";

type Message = { to: string; subject: string; html: string; text: string };

const globalForMail = globalThis as { mailTransport?: Transporter };

function getTransport(): Transporter | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  if (!globalForMail.mailTransport) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    globalForMail.mailTransport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return globalForMail.mailTransport;
}

export async function sendMail(message: Message): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    console.warn(
      `[mail] SMTP_HOST not set, skipping email to ${message.to}: ${message.subject}`,
    );
    return false;
  }
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? `${APP_NAME} <${process.env.SMTP_USER}>`,
      ...message,
    });
    return true;
  } catch (error) {
    console.error("[mail] send failed", error);
    return false;
  }
}
