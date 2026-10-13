import nodemailer from 'nodemailer';

let transporter;

function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP is not configured');
  }
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  const fromName = process.env.SMTP_FROM_NAME || 'Gamer Review';
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
  return getTransporter().sendMail({ from: `"${fromName}" <${fromEmail}>`, to, subject, html, text });
}

export function resetMailerForTests() {
  transporter = undefined;
}
