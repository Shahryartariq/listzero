/** An admin role, or a list of roles with admin in it ("user,admin"), as Better Auth's admin plugin stores them. */
export const isAdminRole = (role: string | null | undefined): boolean => (role ?? "").split(",").includes("admin");
