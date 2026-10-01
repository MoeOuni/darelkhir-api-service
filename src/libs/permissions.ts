/**
 * The permission catalogue.
 *
 * This list lives in code, not in the database, because every name here has to
 * match a real check on a real endpoint. A permission nobody enforces is a lie
 * told to the person ticking the box.
 *
 * Adding a name here denies it to every existing role except the owner. A
 * feature added next year never appears in an old role by surprise.
 */

export const PERMISSIONS = {
  'orders.view': 'See orders',
  'orders.create': 'Create an order',
  'orders.edit_draft': 'Change a draft order',
  'orders.confirm': 'Confirm an order and issue its invoice',
  'orders.cancel': 'Cancel an order',

  'documents.print_invoice': 'Print an invoice',
  'documents.print_proforma': 'Print a proforma',
  'documents.issue_credit_note': 'Issue a credit note',

  // Declared invoices are the shop's fiscal paperwork, kept apart from the
  // counter's own: whoever writes orders is not automatically the person who
  // decides what the government is told.
  'declared.view': 'See declared invoices',
  'declared.create': 'Raise a declared invoice',
  'declared.finalise': 'Mark a declared invoice final',
  'declared.delete': 'Delete a declared invoice',

  'payments.view': 'See payments and balances',
  'payments.create': 'Record a payment',
  'payments.reverse': 'Reverse a payment',

  'products.view': 'See products',
  'products.create': 'Add a product',
  'products.edit': 'Change a product',
  'products.delete': 'Erase a product',
  'products.view_purchase_price': 'See what the shop pays its suppliers',
  'products.adjust_stock': 'Correct a stock number',

  'clients.view': 'See clients',
  'clients.create': 'Add a client',
  'clients.edit': 'Change a client',
  'clients.delete': 'Erase a client',

  'categories.manage': 'Manage categories',
  'transporters.manage': 'Manage transporters',

  'reports.view_sales': 'See the sales reports',
  'reports.view_margin': 'See margins and supplier cost in reports',
  'journal.view_stock': 'See the stock history',
  'journal.view_audit': 'See the action journal',

  'settings.view': 'See the business settings',
  'settings.edit': 'Change the business settings',
  'staff.manage': 'Create and change staff accounts',
  'roles.manage': 'Create and change roles',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/**
 * The owner role.
 *
 * It holds every permission, including ones added later. It cannot be edited
 * and it cannot be deleted, so there is no sequence of clicks that locks the
 * owner out of their own shop.
 */
export const OWNER_ROLE_ID = 'owner';

export function isOwnerRole(roleId: string): boolean {
  return roleId === OWNER_ROLE_ID;
}

/** Keeps only names that exist in the catalogue above. */
export function sanitizePermissions(input: unknown): Permission[] {
  if (!Array.isArray(input)) return [];
  const valid = new Set<string>(ALL_PERMISSIONS);
  return Array.from(new Set(input.filter((p): p is Permission => typeof p === 'string' && valid.has(p))));
}

export function hasPermission(
  granted: readonly string[],
  required: Permission,
  roleId?: string
): boolean {
  if (roleId && isOwnerRole(roleId)) return true;
  return granted.includes(required);
}
