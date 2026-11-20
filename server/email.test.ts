// @vitest-environment node
import { describe, expect, it } from "vitest";
import { deleteAccount, resetPassword, verifyEmail } from "./email";

describe("emails", () => {
  const link = "https://listzero.vercel.app/api/auth/verify-email?token=abc&callbackURL=%2Ftoday";

  it("have a plain text part with the link, and an HTML part with the link escaped", () => {
    for (const mail of [verifyEmail("Sam", link), resetPassword("Sam", link), deleteAccount("Sam", link)]) {
      expect(mail.text).toContain(link);
      expect(mail.html).toContain(link.replace(/&/g, "&amp;"));
      expect(mail.html).not.toContain("token=abc&callbackURL");
    }
  });

  it("say they work in dark mode and carry dark colours for mail apps that use them", () => {
    const { html } = verifyEmail("Sam", link);
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html).toMatch(/@media \(prefers-color-scheme: dark\)[\s\S]*\.lz-card \{ background: #1d2827/);
  });

  it("escape what a person typed", () => {
    expect(verifyEmail("<b>Sam</b>", link).html).toContain("&lt;b&gt;Sam&lt;/b&gt;");
  });
});
