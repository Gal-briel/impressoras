import type { Permission } from '../types/rbac';

export function normalizePermission(permission: string): string {
  return permission.replace(':', '.');
}

export function hasPermission(userPermissions: string[] = [], required?: Permission | Permission[]): boolean {
  if (!required) return true;
  const requiredList = Array.isArray(required) ? required : [required];
  const normalized = new Set(userPermissions.map(normalizePermission));
  return requiredList.every((permission) => normalized.has(normalizePermission(permission)));
}
