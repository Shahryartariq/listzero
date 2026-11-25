/** An admin role, or a list of roles with admin in it ("user,admin"), as Better Auth's admin plugin stores them. */
export const isAdminRole = (role: string | null | undefined): boolean => (role ?? "").split(",").includes("admin");

/** How the current session was started, as the server recorded it ("google", "password", …). */
export const signInMethodOf = (session: object | null | undefined): string | null =>
  (session as { signInMethod?: string | null } | null | undefined)?.signInMethod ?? null;

/**
 * Whether this session may open the admin panel, as the server decides it (server/admin.ts): an admin
 * (only ADMIN_EMAILS make one) who, when Google sign-in is on, signed in with Google.
 */
export function mayAdmin(
  data: { user: { role?: string | null }; session: object } | null | undefined,
  googleOn: boolean,
): boolean {
  if (!data) return false;
  return isAdminRole(data.user.role) && (!googleOn || signInMethodOf(data.session) === "google");
}
