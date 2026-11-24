export const ROLE_TEMPLATES = [
  { name: 'Owner', sortOrder: 1, canView: true, canCreate: true, canManage: true },
  { name: 'Manager', sortOrder: 2, canView: true, canCreate: true, canManage: false },
  { name: 'Staff', sortOrder: 3, canView: true, canCreate: false, canManage: false },
] as const;

export const ROLE_TEMPLATE_NAMES = ROLE_TEMPLATES.map((template) => template.name);

export type RoleTemplateName = (typeof ROLE_TEMPLATES)[number]['name'];
