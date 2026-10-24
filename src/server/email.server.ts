import nodemailer from "nodemailer";

export function assertEmailConfigured() {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASSWORD ||
    !process.env.SMTP_FROM
  ) {
    throw new Error(
      "Password reset emails are temporarily unavailable. Please try again later.",
    );
  }
}

export async function sendPasswordResetEmail(email: string, link: string) {
  assertEmailConfigured();
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Reset your 1MERCADO password",
    text: `A password reset was requested for your 1MERCADO account.\n\nSet a new password here:\n${link}\n\nThis link expires in 24 hours and can be used once. If you did not request this, you can ignore this email.`,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
