import { Entity } from './Entity';
import { IOrder, IOrderItem, IAddress, IOrderCharge, IOrderStop } from '@libs/interfaces';
import { DataType, OrderStatus, PaymentMethod, OrderSource, DeliveryState } from '@libs/enums';

export class OrderEntity extends Entity<IOrder> implements IOrder {
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;
  orderNumber: number;
  clientId: string;
  clientName: string;
  customerId: string;
  status: OrderStatus;
  items: IOrderItem[];
  subtotal: number;
  tax: number;
  timber: number;
  transport: number;
  charges?: IOrderCharge[];
  stops?: IOrderStop[];
  transporterId?: string;
  transporterName?: string;
  deliveryDate?: string;
  invoicePdfUrl?: string;
  invoicePdfKey?: string;
  invoiceNumber?: number;
  invoiceIssuedAt?: string;
  creditNoteNumber?: number;
  creditNoteIssuedAt?: string;
  creditNoteReason?: string;
  source?: OrderSource;
  deliveryState?: DeliveryState;
  total: number;
  shippingAddressId?: string;
  shippingAddress: IAddress;
  paymentMethod: PaymentMethod;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;

  constructor(attr: Partial<IOrder>) {
    super(attr);
    this.id = (attr.id as string) ?? DataType.ORDER;
    this.sk = attr.sk as string;
    this.dataType = DataType.ORDER;
    this.orderNumber = attr.orderNumber as number;
    this.clientId = attr.clientId as string;
    this.clientName = attr.clientName as string;
    this.customerId = attr.customerId as string;
    this.status = attr.status ?? OrderStatus.PENDING;
    this.items = attr.items ?? [];
    this.subtotal = attr.subtotal ?? 0;
    this.tax = attr.tax ?? 0;
    this.timber = attr.timber ?? 1;
    this.transport = attr.transport ?? 0;
    this.charges = attr.charges ?? [];
    this.stops = attr.stops ?? [];
    this.transporterId = attr.transporterId;
    this.transporterName = attr.transporterName;
    this.deliveryDate = attr.deliveryDate;
    this.invoicePdfUrl = attr.invoicePdfUrl;
    this.invoicePdfKey = attr.invoicePdfKey;
    this.invoiceNumber = attr.invoiceNumber;
    this.invoiceIssuedAt = attr.invoiceIssuedAt;
    this.creditNoteNumber = attr.creditNoteNumber;
    this.creditNoteIssuedAt = attr.creditNoteIssuedAt;
    this.creditNoteReason = attr.creditNoteReason;
    this.source = attr.source;
    this.deliveryState = attr.deliveryState;
    this.total = attr.total ?? 0;
    this.shippingAddressId = attr.shippingAddressId;
    this.shippingAddress = attr.shippingAddress as IAddress;
    this.paymentMethod = attr.paymentMethod ?? PaymentMethod.CASH_ON_DELIVERY;
    this.notes = attr.notes;
    this.createdAt = attr.createdAt as string;
    this.updatedAt = attr.updatedAt as string;
    this.ttl = attr.ttl;
  }

  protected getIndexMap() {
    return {
      // gsi-type-resource: query by dataType, range by customerId#status
      tk: ['customerId', 'status'],
      // gsi-parent-resource: get all orders for a customer
      fk: ['customerId'],
      // gsi-resource-created: list orders sorted by creation date
      sihk: ['createdAt'],
      // gsi-status-created: query by dataType + filter by status, sorted by createdAt
      sehk: ['status', 'createdAt'],
    };
  }

  private buildSearchKey(): string {
    return (this.clientName ?? '').toLowerCase();
  }

  valueOf(): Partial<IOrder> {
    const base = super.valueOf() as Record<string, any>;
    return { ...base, searchKey: this.buildSearchKey() } as Partial<IOrder>;
  }

  getDirty(): Partial<IOrder> {
    const base = super.getDirty() as Record<string, any>;
    if ('clientName' in base) {
      base.searchKey = this.buildSearchKey();
    }
    return base as Partial<IOrder>;
  }

  /** True once a fiscal invoice number has been taken for this order. */
  get isInvoiced(): boolean {
    return typeof this.invoiceNumber === 'number';
  }

  toPublicDTO(): Record<string, any> {
    const { tk, fk, fhk, sihk, sehk, searchKey, ...rest } = this.valueOf() as any;
    return rest;
  }

  /** Like toPublicDTO() but strips cost-sensitive fields from items (for customer-facing endpoints). */
  toCustomerDTO(): Record<string, any> {
    const base = this.toPublicDTO();
    return {
      ...base,
      items: (base.items as any[]).map(({ purchasePrice: _pp, ...item }) => item),
    };
  }
}
