// Frontend RBAC helper.
// This controls visibility/navigation only. Backend authorization remains mandatory.
export const ROLE_PERMISSIONS = {
  student: new Set([
    "profile:read:self",
    "room:read:self",
    "attendance:read:self",
    "fees:read:self",
    "leave:create:self",
    "leave:read:self",
    "documents:create:self",
    "documents:read:self",
    "notifications:read:self",
    "complaints:create:self",
    "complaints:read:self",
    "maintenance:create:self",
    "maintenance:read:self",
  ]),
  admin: new Set(["admin:*"]),
  security: new Set([
    "student:search",
    "pass:read:approved",
    "gate:checkout",
    "gate:return",
    "security:history",
  ]),
};

export function can(role, permission) {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.has(`${role}:*`) || permissions.has(permission);
}
