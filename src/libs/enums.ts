export enum DataType {
  PRODUCT = 'PRODUCT',
  ORDER = 'ORDER',
  CATEGORY = 'CATEGORY',
  CLIENT = 'CLIENT',
  TRANSPORTER = 'TRANSPORTER',
  /** A fiscal invoice with a number typed by the shop, touching no stock. */
  DECLARED_INVOICE = 'DECLARED_INVOICE',
  /** A rendered file kept so it can be downloaded again. */
  STORED_DOCUMENT = 'STORED_DOCUMENT',
  SETTINGS = 'SETTINGS',
  PAYMENT = 'PAYMENT',
  STOCK_MOVEMENT = 'STOCK_MOVEMENT',
  AUDIT_LOG = 'AUDIT_LOG',
  STAFF = 'STAFF',
  ROLE = 'ROLE',
  SUPPLIER = 'SUPPLIER',
  /** A price agreed with one client, which overrides the catalogue price. */
  CLIENT_PRICE = 'CLIENT_PRICE',
  REQUEST = 'REQUEST',
}

/**
 * Who settles an extra charge on an order.
 *
 * `client` is billed on the invoice and collected with the rest. `shop` is
 * absorbed by the business: it never reaches the client's paper, but it is a
 * real cost and comes off the margin.
 */
export enum ChargePayer {
  CLIENT = 'client',
  SHOP = 'shop',
}

/** Where a customer request has got to. */
export enum RequestStatus {
  /** Waiting for the goods to arrive. */
  OPEN = 'open',
  /** The goods are in and the customer has been told. */
  NOTIFIED = 'notified',
  /** The customer bought it. */
  FULFILLED = 'fulfilled',
  /** No longer wanted, or the shop will not stock it. */
  CLOSED = 'closed',
}

/** Why stock moved. Every change to a product's stock carries one of these. */
export enum StockMovementType {
  /** Goods left the shop against an order. */
  SALE = 'sale',
  /** Goods came back from a customer. */
  RETURN = 'return',
  /** New stock arrived from a supplier. */
  PURCHASE = 'purchase',
  /** A count correction. The reason field explains it. */
  ADJUSTMENT = 'adjustment',
  /** Broken, expired or missing goods. */
  LOSS = 'loss',
  /** The opening number when a product is created. */
  INITIAL = 'initial',
}

export enum ProductStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  OUT_OF_STOCK = 'out_of_stock',
  DISCONTINUED = 'discontinued',
}

export enum OrderStatus {
  /** Nothing committed. Free to change or erase. No invoice number taken. */
  DRAFT = 'draft',
  /** Legacy name for DRAFT. Orders created before the change still hold it. */
  PENDING = 'pending',
  /** The invoice is issued and the number is spent. Lines are frozen. */
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  /** Delivered and paid in full. */
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

/** An order at one of these has no invoice and can still be changed freely. */
export const DRAFT_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.DRAFT,
  OrderStatus.PENDING,
]);

export function isDraftStatus(status: OrderStatus): boolean {
  return DRAFT_STATUSES.has(status);
}

/**
 * An order at one of these has given its goods back to the shelf.
 *
 * Shared by the two ways an order dies — the status change on a draft, and the
 * credit note on an invoiced one — so neither can put the same goods back
 * twice, and both agree on what "already cancelled" means.
 */
export const RELEASED_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
]);

export function isReleasedStatus(status: OrderStatus): boolean {
  return RELEASED_STATUSES.has(status);
}

/** Where the order came from. Counter sales behave differently to web orders. */
export enum OrderSource {
  COUNTER = 'counter',
  ONLINE = 'online',
}

/** Only meaningful when a transporter carries the goods. */
export enum DeliveryState {
  PREPARING = 'preparing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
}

/** How money actually arrived. Belongs to a payment, not to an order. */
export enum PaymentType {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  CHECK = 'check',
}

export enum CheckStatus {
  /** In hand, not yet cashed. Never counted as cash in a report. */
  HELD = 'held',
  CASHED = 'cashed',
  RETURNED = 'returned',
}

export enum CategoryStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum PaymentMethod {
  BANK_ACCOUNT = 'bank_account',
  CASH_ON_DELIVERY = 'cash_on_delivery',
}
