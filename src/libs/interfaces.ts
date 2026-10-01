import {
  DataType,
  ChargePayer,
  ProductStatus,
  OrderStatus,
  CategoryStatus,
  PaymentMethod,
  OrderSource,
  DeliveryState,
  PaymentType,
  CheckStatus,
  StockMovementType,
  RequestStatus,
} from './enums';

export interface ISettings {
  id: string;
  sk: string;
  dataType: DataType;
  businessName: string;
  /** The shop's name in Arabic, printed on the invoice header. */
  businessNameAr?: string;
  legalName?: string;
  phone: string;
  secondaryPhone?: string;
  email: string;
  addressLine: string;
  /** The same address written in Arabic, for the right-hand header. */
  addressLineAr?: string;
  city?: string;
  postalCode?: string;
  country: string;
  taxId: string;
  /** The tax number as it is written in Arabic. */
  taxIdAr?: string;
  stampTax: number;
  defaultTaxRate: number;
  bankName?: string;
  bankAccountNumber?: string;
  openingHours?: string;
  websiteUrl?: string;
  logoUrl?: string;
  balanceWarningThreshold?: number;
  createdAt: string;
  updatedAt: string;
}

export interface IStaff {
  id: string;
  sk: string;
  dataType: DataType;
  sub: string;
  name: string;
  phone: string;
  email?: string;
  roleId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

export interface IRole {
  id: string;
  sk: string;
  dataType: DataType;
  roleId: string;
  name: string;
  description?: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

export interface ISupplier {
  id: string;
  sk: string;
  dataType: DataType;
  name: string;
  phone: string;
  secondaryPhone?: string;
  email?: string;
  address?: string;
  /** Matricule fiscal of the supplier. */
  taxId?: string;
  notes?: string;
  searchKey?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

export interface IRequest {
  id: string;
  sk: string;
  dataType: DataType;
  clientId?: string;
  clientName: string;
  clientPhone: string;
  /** Free text: a customer often asks for something not in the catalogue. */
  description: string;
  /** Set when the request matches a product already on the books. */
  productId?: string;
  quantity?: number;
  status: RequestStatus;
  notes?: string;
  notifiedAt?: string;
  recordedBy?: string;
  recordedByName?: string;
  searchKey?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

export interface IStockMovement {
  id: string;
  sk: string;
  dataType: DataType;
  productId: string;
  productCode: string;
  productName: string;
  type: StockMovementType;
  availableDelta: number;
  availableAfter?: number;
  orderId?: string;
  orderNumber?: number;
  reason?: string;
  performedBy?: string;
  performedByName?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

export interface IAuditLog {
  id: string;
  sk: string;
  dataType: DataType;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  actorId?: string;
  actorName?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  details?: Record<string, any>;
  meta?: Record<string, any>;
  searchKey?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

export interface IPayment {
  id: string;
  sk: string;
  dataType: DataType;
  clientId: string;
  /** Positive for money in, negative for a reversal. */
  amount: number;
  method: PaymentType;
  paidAt: string;
  reference?: string;
  /** Informational only. Never used to compute a per-order balance. */
  orderId?: string;
  recordedBy?: string;
  notes?: string;
  /** Check fields. A held check reduces the balance but is not cash yet. */
  checkNumber?: string;
  bankName?: string;
  dueDate?: string;
  checkStatus?: CheckStatus;
  /** Set on a reversal, pointing at the payment it cancels. */
  reversesPaymentId?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

export interface IClient {
  id: string;
  sk: string;
  dataType: DataType;
  /**
   * The client's whole name, as it is written and read.
   *
   * One field rather than two: a name here is "Abd Elkhalk Salhi" or "Ste Tech
   * de Bat et Traveaux", and deciding where the given name stops and the
   * family name starts was guesswork that split company names down the middle.
   */
  fullName: string;
  /** Absent for walk-in clients, who have no website account. */
  email?: string;
  /**
   * Absent for a client carried over from the shop's notebook, where many
   * entries are a name and an amount and nothing else.
   */
  phone?: string;
  addresses: IAddress[];
  /** Sum of the totals of every counted order. Maintained server-side. */
  totalInvoiced?: number;
  /** Sum of every payment, reversals included. */
  totalPaid?: number;
  /**
   * What this client already owed when the shop started using the system.
   *
   * Written once from the notebook: an amount, and nothing behind it — no
   * order, no articles, no invoice number. It counts in what he owes and is
   * deliberately kept out of `totalInvoiced`, so it can never be mistaken for
   * a sale in the day's figures.
   */
  openingBalance?: number;
  /** When that notebook debt was taken on, when it is known. */
  openingBalanceAt?: string;
  /** What the notebook page said, for whoever reads this later. */
  openingBalanceNote?: string;
  /** openingBalance plus totalInvoiced minus totalPaid. What he owes today. */
  balance?: number;
  lastActivityAt?: string;
  /**
   * True when the client owes money recorded on paper that is not in the
   * system yet. The screens show "read the book" instead of a false zero.
   */
  hasPaperBalance?: boolean;
  /**
   * Identity card number. Printed on the invoice, where there has always been
   * a slot for it that nothing filled.
   */
  cin?: string;
  /**
   * Matricule fiscal. Set for a client who buys as a business and needs his
   * own tax number on the paper; blank for a private buyer.
   */
  taxId?: string;
  /** Free note for staff, for example "pays at the end of each month". */
  paymentNote?: string;
  searchKey?: string;   // lowercase: "firstname lastname email phone" — for backend contains() search
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

export interface IProduct {
  /**
   * The words the shop actually uses for this article.
   *
   * Nobody at the counter asks for a "clôture grillage double torsion 20m x
   * 2m". They ask for "chabka 20" or "شبكة 20" or "DT20". Those go here, and
   * they are searched exactly like the name is — so the search box, the phone
   * and the reader that turns a spoken sentence into an order all understand
   * the same vocabulary, and adding a word is an edit rather than a deploy.
   */
  aliases?: string[];
  id: string;
  sk: string;
  dataType: DataType;
  name: { fr: string; ar: string };
  description?: { fr?: string; ar?: string };
  purchasePrice: number;
  priceHT: number;
  taxRate: number;
  priceTTC: number;
  code: string;
  discountedPrice?: number;
  discountPercentage?: number;
  stockAvailable: number;
  categoryId: string;
  status: ProductStatus;
  imageUrl?: string;
  imageUrlWebp?: string;
  /** Lowercase computed field: "name.fr name.ar code" — for case-insensitive search */
  searchKey?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

export interface IOrderItem {
  /** Product snapshot at time of purchase */
  productId: string;
  code: string;
  name: string;
  imageUrl?: string;
  /** Cost price (what the shop paid) at time of purchase */
  purchasePrice: number;
  /** Catalog selling price HT at time of purchase */
  priceHT: number;
  priceTTC: number;
  taxRate: number;
  discountedPrice?: number;
  discountPercentage?: number;
  /** True when the unit price came from a deal with this client. */
  agreedPrice?: boolean;
  quantity: number;
}

export interface ITransporter {
  id: string;
  sk: string;
  dataType: DataType;
  name: string;
  /** A driver often has no number to give. */
  phone?: string;
  secondaryPhone?: string;
  vehiclePlateNumber?: string;
  cin?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

/**
 * Where something goes, as it would be said out loud.
 *
 * One written line and nothing else is required. The shop writes these itself,
 * from what a client says at the counter — "route de Gafsa, en face de la
 * mosquée" — and asking a merchant to split that into a town, a governorate
 * and a postcode only produced invented values on the paper.
 *
 * The remaining fields stay on the type because addresses saved under the old
 * shape still carry them, and the invoice still prints whatever is there.
 */
export interface IAddress {
  id?: string;
  street: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

/**
 * Money spent on an order that is not the goods: a loader who wants 20 dinars
 * to lift the bars onto a tractor, a crane, a night porter.
 */
export interface IOrderCharge {
  label: string;
  amount: number;
  paidBy: ChargePayer;
}

/**
 * One drop on a delivery round.
 *
 * A single order can go out on one truck and come off it at several places:
 * forty of one article here, thirty there. Each stop has its own address and
 * its own share of the goods, and the shares must add up to the order exactly.
 */
export interface IOrderStop {
  /** Stable across edits, so a printed paper keeps pointing at the same drop. */
  id: string;
  /** What the driver calls it: "chantier Foussana", "dépôt". */
  label?: string;
  /**
   * Where this drop is, as it would be said to a driver.
   *
   * Only the street line is asked for. A drop is a place on a round — "chantier
   * route de Gafsa, après le pont" — not a postal address, and inheriting the
   * client's town and postcode onto every stop only printed noise nobody had
   * typed. The remaining fields stay optional so the addresses already saved
   * keep rendering.
   */
  address: Partial<IAddress> & { street: string };
  items: { productId: string; quantity: number }[];
}

/** A price agreed with one client for one product. */
export interface IClientPrice {
  id: string;
  sk: string;
  dataType: DataType;
  clientId: string;
  productId: string;
  /** Unit price the client pays, tax included — same footing as a discount. */
  price: number;
  /** Kept for the screen: the catalogue price when the deal was struck. */
  listPrice?: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IOrder {
  id: string;
  sk: string;
  dataType: DataType;
  orderNumber: number;
  clientId: string;
  clientName: string;
  customerId: string;
  status: OrderStatus;
  items: IOrderItem[];
  subtotal: number;
  tax: number;
  /** Always 1 DT — timber fee included in every order */
  timber: number;
  transport: number;
  /** Loading, craneage and the like. See `IOrderCharge`. */
  charges?: IOrderCharge[];
  /** Where the load is dropped, when it is more than one place. */
  stops?: IOrderStop[];
  transporterId?: string;
  transporterName?: string;
  deliveryDate?: string;
  /** @deprecated Public S3 URL from before invoices became private. Read-only. */
  invoicePdfUrl?: string;
  /** S3 object key of the rendered invoice. Presigned per request for download. */
  invoicePdfKey?: string;
  /** Fiscal invoice number. Taken at confirmation, never reused, no gaps. */
  invoiceNumber?: number;
  invoiceIssuedAt?: string;
  /**
   * The date to print on the paper, when it must differ from the day the
   * document was issued — an invoice written the night before, for instance.
   * Empty means "use the issue date", which is the normal case.
   */
  documentDate?: string;
  /** Credit note number, when the order has been cancelled after invoicing. */
  creditNoteNumber?: number;
  creditNoteIssuedAt?: string;
  creditNoteReason?: string;
  /** 'counter' for a walk-in sale, 'online' for a website order. */
  source?: OrderSource;
  /** Only set when a transporter carries the goods. */
  deliveryState?: DeliveryState;

  total: number;
  shippingAddressId?: string;
  shippingAddress: IAddress;
  paymentMethod: PaymentMethod;
  notes?: string;
  searchKey?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

export interface ICategory {
  id: string;
  sk: string;
  dataType: DataType;
  name: { fr: string; ar: string };
  description?: { fr?: string; ar?: string };
  parentCategoryId?: string;
  status: CategoryStatus;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  /**
   * The Cognito username.
   *
   * When a pool uses phone_number as its username attribute, Cognito assigns a
   * UUID as the real username and treats the phone as a sign-in alias. So this
   * is NOT the phone number, and it is not a display name either. Use it only
   * to look the account up.
   */
  username: string;
  groups: string[];
  authType: 'apikey' | 'cognito';
  /**
   * True when the token came from the staff pool, false for a shop customer.
   * Endpoints that both pools can reach (createOrder) use this to decide
   * whether the response may include supplier cost.
   */
  isStaff: boolean;
}

/**
 * A line on a declared invoice.
 *
 * The article is written down rather than pointed at: this document may be
 * reprinted years after a product was renamed or withdrawn, and what it says
 * must not change when the catalogue does.
 */
export interface IDeclaredLine {
  code: string;
  name: string;
  quantity: number;
  priceHT: number;
  taxRate: number;
}

/**
 * An invoice raised for the tax authority rather than for the counter.
 *
 * The same goods can leave the shop under two papers: one in the buyer's own
 * name for the road, and one in his company's for the government. So the
 * identity on this is its own — not a pointer at the client — because the
 * whole reason it exists is that the two differ.
 *
 * It moves nothing. No stock, no balance, no counter. It is a document.
 */
export interface IDeclaredInvoice {
  id: string;
  sk: string;
  dataType: DataType;
  /** Typed by the shop, unique for all time, and part of the key. */
  number: string;
  /** Draft until the shop says otherwise; nothing may change after that. */
  status: 'draft' | 'final';
  /** The date printed on it, which is not always the day it was made. */
  issuedAt: string;
  fiscalName: string;
  fiscalAddress?: string;
  /** Matricule fiscal — the number the government knows the buyer by. */
  taxId?: string;
  cin?: string;
  phone?: string;
  /**
   * How it was settled — the "mode de règlement" the paper carries.
   *
   * Required of anything raised from now on, and optional here only because
   * the invoices already in the table were written before the field existed.
   * Typing it as required would be the type claiming something about stored
   * data that is not true, and the renderer would trust it.
   */
  paymentMethod?: PaymentType;
  lines: IDeclaredLine[];
  subtotal: number;
  tax: number;
  timber: number;
  total: number;
  notes?: string;
  /** The order this was raised from, when it was raised from one. */
  sourceOrderId?: string;
  finalisedAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

/** A rendered file, kept so it can be found and downloaded again. */
export interface IStoredDocument {
  id: string;
  sk: string;
  dataType: DataType;
  /** Which declared invoice this belongs to. */
  declaredNumber: string;
  s3Key: string;
  filename: string;
  bytes: number;
  contentType: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}
