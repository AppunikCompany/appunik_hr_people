import nodemailer from "nodemailer";

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.zeptomail.in",
    port: parseInt(process.env.SMTP_PORT ?? "587"),
    // 465 = SSL/TLS, 587 = STARTTLS (secure:false — nodemailer upgrades automatically)
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER ?? "emailapikey",
      pass: process.env.SMTP_PASS ?? "",
    },
  });
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<void> {
  if (!process.env.SMTP_PASS) throw new Error("SMTP_PASS is not configured");

  const from = `"${process.env.FROM_NAME ?? "Appunik HR"}" <${process.env.FROM_EMAIL ?? "hr@appunik.com"}>`;
  const addresses = Array.isArray(opts.to) ? opts.to : [opts.to];
  const transport = createTransport();

  for (const to of addresses) {
    await transport.sendMail({ from, to, subject: opts.subject, html: opts.html });
  }
}

export async function verifySmtpConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.SMTP_PASS) {
    return { ok: false, error: "SMTP_PASS is not set in environment variables" };
  }
  try {
    await createTransport().verify();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}
