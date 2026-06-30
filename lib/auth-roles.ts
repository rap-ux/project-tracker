// Single source of truth for the super-admin allowlist. Gates sensitive
// features (DB backup, presence admin view, etc.) on a specific email rather
// than the "owner" role, since role alone isn't a strong enough boundary for
// these actions.
export const SUPER_ADMIN_EMAILS = ["rap@totallywiredelectric.com"];

export function isSuperAdmin(email: string | null | undefined): boolean {
  return !!email && SUPER_ADMIN_EMAILS.includes(email);
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}
