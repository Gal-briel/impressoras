export const roles = ['Owner', 'Admin', 'Technician', 'ReadOnly', 'Auditor'] as const;
export type RoleName = (typeof roles)[number];

export const permissions = [
  'agents.read',
  'agents.write',
  'commands.execute',
  'commands.approve',
  'users.manage',
  'audit.read',
  'printers.read',
  'settings.read',
] as const;

export type Permission = (typeof permissions)[number] | string;
