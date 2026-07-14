import type { Permission } from '../types/rbac';

function permissionAliases(permission: string): string[] {
  return [
    permission,
    permission.replace(':', '.'),
    permission.replace('.', ':'),
  ];
}

export function hasPermission(
  grantedPermissions: string[] = [],
  requiredPermission?: Permission | Permission[],
): boolean {
  if (!requiredPermission) {
    return true;
  }

  const granted = new Set<string>();

  for (const permission of grantedPermissions) {
    for (const alias of permissionAliases(permission)) {
      granted.add(alias);
    }
  }

  const requiredPermissions = Array.isArray(requiredPermission)
    ? requiredPermission
    : [requiredPermission];

  return requiredPermissions.some((permission) =>
    permissionAliases(permission).some((alias) => granted.has(alias)),
  );
}
