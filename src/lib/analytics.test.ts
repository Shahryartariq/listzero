import { describe, expect, it } from "vitest";
import { SITE_HOST, analyticsAllowed, browserObjects, screenPath, screenTitle } from "./analytics";

describe("what analytics is allowed to see", () => {
  it("reports fixed screen addresses and drops everything personal", () => {
    expect(screenPath("/today")).toBe("/today");
    expect(screenPath("/")).toBe("/today");
    expect(screenPath("/about/")).toBe("/about");
    // A list's id and name never leave the browser.
    expect(screenPath("/list/k3J9s-private-id")).toBe("/list");
    // Unknown addresses could hold anything someone typed.
    expect(screenPath("/my-secret-plan")).toBe("/not-found");
    expect(screenPath("/list/a/b")).toBe("/not-found");
    expect(screenPath("/constructor")).toBe("/not-found");
  });

  it("uses fixed titles, never a list name", () => {
    expect(screenTitle("/list")).toBe("List | Listzero");
    expect(screenTitle("/today")).toBe("Today | Listzero");
    expect(screenTitle("/anything")).toBe("Page not found | Listzero");
  });

  it("runs only on the public site, with the setting on and no objection from the browser", () => {
    expect(analyticsAllowed(true, SITE_HOST, {})).toBe(true);
    expect(analyticsAllowed(false, SITE_HOST, {})).toBe(false);
    expect(analyticsAllowed(true, "localhost", {})).toBe(false);
    expect(analyticsAllowed(true, "listzero-git-audit-someone.vercel.app", {})).toBe(false);
    expect(analyticsAllowed(true, SITE_HOST, { doNotTrack: "1" })).toBe(false);
    expect(analyticsAllowed(true, SITE_HOST, { globalPrivacyControl: true })).toBe(false);
  });

  it("reads Do Not Track and Global Privacy Control", () => {
    expect(browserObjects({ doNotTrack: "1" })).toBe(true);
    expect(browserObjects({ globalPrivacyControl: true })).toBe(true);
    expect(browserObjects({ doNotTrack: "0" })).toBe(false);
    expect(browserObjects({ doNotTrack: null })).toBe(false);
  });
});
