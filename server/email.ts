/**
 * Email: what Listzero sends (verify your address, reset your password, confirm deleting your
 * account) and how it is delivered. In production that is an SMTP account, by default Gmail with
 * an app password. Anywhere else, mail is kept in memory and printed, so every flow can be tried
 * without sending anything.
 */
import nodemailer from "nodemailer";
import type { ServerConfig } from "./env";

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type Mailer = (mail: Mail) => Promise<void>;

export function smtpMailer(smtp: NonNullable<ServerConfig["smtp"]>, from: string): Mailer {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.password },
  });
  return async (mail) => {
    try {
      await transport.sendMail({ from, ...mail });
    } catch (error) {
      // Never log the message itself: it carries a sign-in link.
      console.error(`[email] could not send "${mail.subject}":`, error instanceof Error ? error.message : error);
      throw new Error("Could not send email. Please try again.", { cause: error });
    }
  };
}

/** Keeps mail in memory (newest last) and optionally prints it. For local runs and tests only. */
export function outboxMailer(outbox: Mail[], print: boolean): Mailer {
  return async (mail) => {
    outbox.push(mail);
    if (outbox.length > 500) outbox.shift();
    if (print) console.info(`\n[email] To: ${mail.to}\n[email] Subject: ${mail.subject}\n${mail.text}\n`);
  };
}

/** Production with no SMTP account: nothing can be sent, and the log says why. */
export const noMailer: Mailer = async (mail) => {
  console.error(`[email] SMTP_USER and SMTP_PASSWORD are not set; "${mail.subject}" was not sent.`);
};

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

interface Parts {
  heading: string;
  body: string;
  action: string;
  url: string;
  footer: string;
}

function layout({ heading, body, action, url, footer }: Parts): Pick<Mail, "html" | "text"> {
  const link = escape(url);
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#f1f2ec;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c2a29">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fbfbf7;border-radius:20px;padding:32px">
        <tr><td style="font-size:15px;font-weight:700;color:#1c2a29"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#f2cf4a;margin-right:8px"></span>Listzero</td></tr>
        <tr><td style="padding-top:18px;font-size:22px;font-weight:700;line-height:1.3">${escape(heading)}</td></tr>
        <tr><td style="padding-top:12px;font-size:16px;line-height:1.6;color:#33403f">${escape(body)}</td></tr>
        <tr><td style="padding-top:24px">
          <a href="${link}" style="display:inline-block;background:#1c2a29;color:#f1f2ec;text-decoration:none;padding:13px 22px;border-radius:999px;font-size:16px;font-weight:600">${escape(action)}</a>
        </td></tr>
        <tr><td style="padding-top:24px;font-size:13px;line-height:1.6;color:#586463">
          Or paste this link into your browser:<br><a href="${link}" style="color:#33403f;word-break:break-all">${link}</a>
        </td></tr>
        <tr><td style="padding-top:24px;font-size:13px;line-height:1.6;color:#586463">${escape(footer)}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = `${heading}\n\n${body}\n\n${action}: ${url}\n\n${footer}`;
  return { html, text };
}

export const verifyEmail = (name: string, url: string) => ({
  subject: "Confirm your email for Listzero",
  ...layout({
    heading: `Welcome${name ? `, ${name}` : ""}`,
    body: "Confirm this email address to finish making your Listzero account. The link works for 1 hour.",
    action: "Confirm email",
    url,
    footer: "If you did not make a Listzero account, ignore this email and nothing will happen.",
  }),
});

export const resetPassword = (name: string, url: string) => ({
  subject: "Reset your Listzero password",
  ...layout({
    heading: "Choose a new password",
    body: `Hi${name ? ` ${name}` : ""}, someone asked to reset the password for this Listzero account. The link works for 1 hour and only once.`,
    action: "Choose a new password",
    url,
    footer: "If that was not you, ignore this email. Your password stays the same.",
  }),
});

export const deleteAccount = (name: string, url: string) => ({
  subject: "Confirm deleting your Listzero account",
  ...layout({
    heading: "Delete your account?",
    body: `Hi${name ? ` ${name}` : ""}, this deletes your Listzero account and the tasks stored with it. Tasks already on your devices stay there. It cannot be undone.`,
    action: "Delete my account",
    url,
    footer: "If you did not ask for this, ignore this email and change your password.",
  }),
});
