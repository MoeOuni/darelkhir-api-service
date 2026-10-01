/**
 * Turns a raw request into something a merchant can read.
 *
 * The audit trail used to store the method, the path and the raw body. That is
 * a developer's log. What a shop owner needs is "Amine created order 003 for
 * Slim Ben Ali", with the detail underneath when they want it.
 *
 * The sentence itself is built in the dashboard, from `action` plus this
 * `meta`, so it can be read in French or Arabic. Here we only pull out the
 * facts worth keeping.
 */

export type AuditMeta = Record<string, string | number | boolean | undefined>;

function num(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * Pulls the readable facts out of a response, falling back to the request.
 *
 * The response is preferred: it holds the saved record, including values the
 * server filled in such as the order number and the invoice number.
 */
export function describeAudit(
  action: string,
  responseData: Record<string, any> | undefined,
  requestBody: Record<string, any> | undefined,
  /**
   * The ids out of the address, for example the product on
   * `/clients/{id}/prices/{productId}`.
   *
   * Some routes carry a fact in the path and nowhere else, and an entry that
   * names nothing at all is a row nobody can act on.
   */
  pathParameters?: Record<string, string> | null
): { meta: AuditMeta; searchKey: string } {
  const d = responseData ?? {};
  const b = requestBody ?? {};
  const p = pathParameters ?? {};
  const meta: AuditMeta = {};

  const group = action.split('.')[0];

  if (group === 'order') {
    meta.orderNumber = num(d.orderNumber);
    meta.invoiceNumber = num(d.invoiceNumber);
    meta.clientName = str(d.clientName);
    meta.total = num(d.total);
    meta.itemCount = Array.isArray(d.items) ? d.items.length : undefined;
    meta.status = str(d.status) ?? str(b.status);
    // The line items, so the entry can answer "what was in it".
    if (Array.isArray(d.items)) {
      meta.items = d.items
        .slice(0, 20)
        .map((i: any) => `${i.quantity}× ${i.name}`)
        .join(', ');
    }
  }

  if (group === 'payment') {
    meta.amount = num(d.amount) ?? num(b.amount);
    meta.method = str(d.method) ?? str(b.method);
    meta.clientName = str(d.clientName);
    meta.reference = str(d.reference) ?? str(b.reference);
    meta.reason = str(b.reason);
  }

  if (group === 'product') {
    meta.productName =
      str(d.name?.fr) ?? str(d.name?.ar) ?? str(b.name?.fr) ?? str(b.name?.ar);
    meta.productCode = str(d.code) ?? str(b.code);
    meta.stockAvailable = num(d.stockAvailable);
    meta.priceHT = num(d.priceHT);
  }

  if (group === 'client') {
    meta.clientName = str(d.fullName) ?? str(b.fullName);
    meta.phone = str(d.phone) ?? str(b.phone);
  }

  if (group === 'category' || group === 'transporter') {
    meta.name = str(d.name?.fr) ?? str(d.name) ?? str(b.name?.fr) ?? str(b.name);
  }

  // A price agreed with one client for one article. Its own branch because it
  // is the only `client.` action that is about a product.
  if (action === 'client.price') {
    meta.clientName = str(d.clientName) ?? str(b.clientName);
    meta.productName = str(d.productName) ?? str(b.productName);
    meta.productCode = str(d.productCode) ?? str(b.productCode);
    meta.price = num(d.price) ?? num(b.price);
    // What the catalogue asked before the deal was struck. Without it the
    // agreed figure means nothing: 95 is generous or miserly depending.
    meta.listPrice = num(d.listPrice) ?? num(b.listPrice);
    meta.note = str(d.note) ?? str(b.note);
    meta.cleared = d.cleared === true ? true : undefined;
    // The client is already the entry's reference; the article is not, and
    // the name lookup can come back empty for a product deleted since.
    meta.productId = str(d.productId) ?? str(p.productId);
  }

  if (group === 'supplier') {
    meta.name = str(d.name) ?? str(b.name);
    meta.phone = str(d.phone) ?? str(b.phone);
  }

  if (group === 'request') {
    meta.name = str(d.title) ?? str(b.title) ?? str(d.name) ?? str(b.name);
    meta.status = str(d.status) ?? str(b.status);
  }

  if (group === 'staff' || group === 'role') {
    meta.name = str(d.name) ?? str(b.name);
    meta.roleId = str(d.roleId) ?? str(b.roleId);
    meta.phone = str(d.phone) ?? str(b.phone);
  }

  // Drop the keys we could not fill, so the stored record stays small.
  for (const key of Object.keys(meta)) {
    if (meta[key] === undefined) delete meta[key];
  }

  // A last resort, so no entry is entirely anonymous. An action whose response
  // told us nothing still touched something, and the address says what: a row
  // reading only "Amine changed something" is the one nobody can act on.
  if (Object.keys(meta).length === 0) {
    for (const [key, value] of Object.entries(p)) {
      if (str(value)) meta[key] = value;
    }
  }

  // One lowercase haystack, so the list can be searched on any of it.
  const searchKey = [action, ...Object.values(meta).map(String)]
    .join(' ')
    .toLowerCase();

  return { meta, searchKey };
}
