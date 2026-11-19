/** Words for what can go wrong with sign-in, and the checks the forms run before asking the server. */

type AuthError = { code?: string; message?: string; status?: number } | null | undefined;

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password do not match.",
  INVALID_USERNAME_OR_PASSWORD: "That username and password do not match.",
  EMAIL_NOT_VERIFIED: "Confirm your email first. We have sent you a new link.",
  USER_ALREADY_EXISTS: "There is already an account with this email. Try signing in.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "There is already an account with this email. Try signing in.",
  USERNAME_IS_ALREADY_TAKEN: "That username is taken. Try another.",
  USERNAME_IS_ALREADY_TAKEN_PLEASE_TRY_ANOTHER: "That username is taken. Try another.",
  INVALID_USERNAME: "Use 3 to 30 letters, numbers, dots, dashes or underscores.",
  USERNAME_TOO_SHORT: "Use at least 3 characters for the username.",
  USERNAME_TOO_LONG: "Use at most 30 characters for the username.",
  PASSWORD_COMPROMISED: "This password has appeared in a data breach. Please choose a different one.",
  PASSWORD_TOO_SHORT: "Use at least 8 characters for the password.",
  PASSWORD_TOO_LONG: "Use at most 128 characters for the password.",
  INVALID_PASSWORD: "That password is not right.",
  BANNED_USER: "This account has been suspended.",
  INVALID_CODE: "That code is not right. Check your authenticator app and try again.",
  INVALID_BACKUP_CODE: "That backup code is not valid, or was already used.",
  INVALID_TWO_FACTOR_COOKIE: "That sign-in ran out of time. Please sign in again.",
  ACCOUNT_TEMPORARILY_LOCKED: "Too many wrong codes. Wait a few minutes, then try again.",
  TOO_MANY_ATTEMPTS: "Too many tries. Please try again later.",
  INVALID_TOKEN: "This link is not valid any more. Ask for a new one.",
  SESSION_EXPIRED: "For safety, please sign in again to do this.",
  FAILED_TO_UNLINK_LAST_ACCOUNT: "You cannot remove your only way of signing in.",
  CHALLENGE_NOT_FOUND: "The passkey sign-in ran out of time. Please try again.",
  ACCOUNTS_OFF: "Accounts are not available on this copy of Listzero.",
};

/** Turns an error from the server into something a person can act on. */
export function authMessage(error: AuthError, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;
  if (error.status === 429) return "Too many tries. Wait a minute, then try again.";
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code] ?? fallback;
  return error.message || fallback;
}

/** Google sign-in problems arrive as `?error=<code>` on /sign-in. */
const OAUTH: Record<string, string> = {
  account_not_linked:
    "There is already an account with this email. Sign in with your password, then connect Google under Account.",
  email_not_found: "Google did not share an email address for that account.",
  email_not_verified: "That Google account's email is not verified with Google yet.",
  email_does_not_match: "That Google account uses a different email address than yours.",
  account_already_linked_to_different_user: "That Google account is already connected to someone else.",
  BANNED_USER: "This account has been suspended.",
  banned: "This account has been suspended.",
  signup_disabled: "New accounts are closed right now.",
};

export function oauthMessage(code: string | null): string {
  if (!code) return "";
  return OAUTH[code] ?? "Signing in with Google did not work. Please try again.";
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
const USERNAME = /^[a-z0-9](?:[a-z0-9._-]{1,28})[a-z0-9]$/i;

export const checkEmail = (value: string): string =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? "" : "Enter an email address, like you@example.com.";

export const checkUsername = (value: string): string =>
  USERNAME.test(value.trim()) ? "" : "Use 3 to 30 letters, numbers, dots, dashes or underscores.";

export function checkPassword(value: string): string {
  if (value.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (value.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  return "";
}

/** A rough strength score (0 to 4) for the meter. The server enforces the real rules. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  let score = 0;
  if (password.length >= PASSWORD_MIN) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  if (password.length >= 16) score++;
  return Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
}

/** Only ever send people to a page of this site after signing in. */
export function safeNext(value: string | null, fallback = "/today"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.startsWith("/api/")) return fallback;
  return value;
}
