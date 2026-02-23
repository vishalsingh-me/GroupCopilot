export function isRoomAdminRole(role?: string | null): boolean {
  return role === "owner" || role === "admin";
}
