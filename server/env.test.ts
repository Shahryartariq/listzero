// @vitest-environment node
import { describe, expect, it } from "vitest";
import { verifiedTls } from "./env";

describe("verifiedTls", () => {
  it("turns Neon's sslmode=require into an explicit certificate check", () => {
    expect(verifiedTls("postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require")).toBe(
      "postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full",
    );
    expect(verifiedTls("postgres://h/db?sslmode=require&channel_binding=require")).toBe(
      "postgres://h/db?sslmode=verify-full&channel_binding=require",
    );
    expect(verifiedTls("postgres://h/db?connect_timeout=5&sslmode=prefer")).toBe("postgres://h/db?connect_timeout=5&sslmode=verify-full");
  });

  it("leaves addresses without a weaker mode alone", () => {
    for (const url of ["postgres://h/db", "postgres://h/db?sslmode=verify-full", "postgres://h/db?sslmode=disable"]) {
      expect(verifiedTls(url)).toBe(url);
    }
  });
});
