/**
 * The browser's side of sign-in. Everything here talks to /api/auth on the same site.
 * This file, and everything that imports it, is only downloaded when accounts are on.
 */
import { passkeyClient } from "@better-auth/passkey/client";
import { adminClient, lastLoginMethodClient, twoFactorClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    twoFactorClient({
      // The password was right and the account has two-factor on: ask for the code.
      onTwoFactorRedirect() {
        window.location.assign("/two-factor");
      },
    }),
    passkeyClient(),
    adminClient(),
    lastLoginMethodClient(),
  ],
});

export type SessionUser = NonNullable<ReturnType<typeof authClient.useSession>["data"]>["user"];
