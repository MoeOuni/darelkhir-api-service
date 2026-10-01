import { OrderRepository } from '@/repositories/OrderRepository';
import { ProductRepository } from '@/repositories/ProductRepository';
import { ClientRepository } from '@/repositories/ClientRepository';
import { TransporterRepository } from '@/repositories/TransporterRepository';
import { OrderEntity } from '@/entities/OrderEntity';
import { IdGenerator } from '@/utils/IdGenerator';
import { DataType, OrderStatus, ProductStatus, PaymentMethod } from '@libs/enums';
import { CreateOrderInput } from '@/schemas/order.schema';
import type { AuthUser } from '@libs/interfaces';
import { ValidationError, NotFoundError } from '@libs/errors';
import { getDefaultEmailBranding, sendEmail } from '@libs/email/sender';
import { renderOrderReceivedEmail } from '@libs/email';
import { getSettings } from '@libs/settings';
import { recordStockMovements } from '@libs/journal';
import { ClientPriceRepository } from '@/repositories/ClientPriceRepository';
import { StockMovementType } from '@libs/enums';

interface CreateOrderResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
}

export class CreateOrderUseCase {
  constructor(
    private repository: OrderRepository,
    private productRepository: ProductRepository,
    private clientRepository: ClientRepository,
    private transporterRepository?: TransporterRepository
  ) {}

  async execute(
    data: CreateOrderInput,
    _callerId: string,
    callerIsStaff = false,
    actor?: AuthUser
  ): Promise<CreateOrderResult> {
    const uuid = IdGenerator.generate();
    const now = new Date().toISOString();

    // ── 1. Fetch all products from DB in parallel — prices come from the DB only ──
    const productEntities = await Promise.all(
      data.items.map((item) => this.productRepository.findByUuid(item.productId))
    );

    // Validate every product exists and is active
    for (let i = 0; i < data.items.length; i++) {
      const product = productEntities[i];
      if (!product) {
        throw new NotFoundError(`Product not found: ${data.items[i].productId}`);
      }
      if (product.status !== ProductStatus.ACTIVE) {
        throw new ValidationError(`Product is no longer available: ${product.name.fr || product.name.ar}`);
      }
      if (product.stockAvailable < data.items[i].quantity) {
        throw new ValidationError(`Insufficient stock for: ${product.name.fr || product.name.ar}`);
      }
    }

    // ── 2. Build order items from trusted DB values ─────────────────────────
    // A regular is quoted less than a stranger, and the quote has to hold
    // without anyone remembering the number. Where one exists, the agreed
    // price stands in for the catalogue price.
    const agreed = await new ClientPriceRepository().priceMapFor(
      data.clientId,
      data.items.map((item) => item.productId),
    );

    const resolvedItems = data.items.map((item, i) => {
      const p = productEntities[i]!;
      const clientPrice = agreed.get(item.productId);

      return {
        productId: item.productId,
        code: p.code,
        name: p.name.fr || p.name.ar,
        imageUrl: p.imageUrl,
        purchasePrice: p.purchasePrice,
        priceHT: p.priceHT,
        priceTTC: p.priceTTC,
        taxRate: p.taxRate,
        // The agreed price sits where a discount would, so every total below
        // and every document already knows how to read it.
        discountedPrice: clientPrice ?? p.discountedPrice,
        // A percentage off the catalogue means nothing once a flat price was
        // agreed, so it is dropped rather than left to mislead.
        discountPercentage: clientPrice !== undefined ? undefined : p.discountPercentage,
        agreedPrice: clientPrice !== undefined,
        quantity: item.quantity,
      };
    });

    // ── 3. Compute totals server-side ───────────────────────────────────
    const subtotal = parseFloat(
      resolvedItems.reduce((acc, item) => {
        const effectiveHT = item.discountedPrice
          ? parseFloat((item.discountedPrice / (1 + item.taxRate / 100)).toFixed(4))
          : item.priceHT;
        return acc + effectiveHT * item.quantity;
      }, 0).toFixed(2)
    );
    const tax = parseFloat(
      resolvedItems
        .reduce((acc, item) => {
          const effectiveHT = item.discountedPrice
            ? parseFloat((item.discountedPrice / (1 + item.taxRate / 100)).toFixed(4))
            : item.priceHT;
          return acc + effectiveHT * (item.taxRate / 100) * item.quantity;
        }, 0)
        .toFixed(2)
    );
    // Stamp duty is a business setting, not a constant: it changes by law.
    const { stampTax } = await getSettings();
    const timber = stampTax;
    const transport = data.transport ?? 0;
    // Charges are deliberately absent here. The loader is settled at the yard,
    // so nothing about him belongs on the client's total.
    const total = parseFloat((subtotal + tax + timber + transport).toFixed(2));

    // ── 4. Fetch order number + client in parallel ───────────────────────────
    const [orderNumber, client] = await Promise.all([
      this.repository.incrementCounter(),
      this.clientRepository.findByUuid(data.clientId),
    ]);

    if (!client) {
      throw new NotFoundError(`Client not found: ${data.clientId}`);
    }

    let resolvedShippingAddress = data.shippingAddress;
    let resolvedShippingAddressId = data.shippingAddressId;

    if (data.shippingAddressId) {
      const matched = (client.addresses ?? []).find((a) => a.id === data.shippingAddressId);
      if (!matched) {
        throw new ValidationError('Selected address does not exist for this client');
      }
      resolvedShippingAddress = matched;
      resolvedShippingAddressId = matched.id;
    }

    const clientName = client.fullName;

    // Resolve the transporter name from the id rather than trusting the caller.
    let transporterName: string | undefined;
    if (data.transporterId) {
      const transporter = await this.transporterRepository?.findByUuid(data.transporterId);
      if (!transporter) {
        throw new NotFoundError(`Transporter not found: ${data.transporterId}`);
      }
      transporterName = transporter.name;
    }

    const entity = new OrderEntity({
      id: DataType.ORDER,
      sk: `${DataType.ORDER}#${uuid}`,
      dataType: DataType.ORDER,
      orderNumber,
      clientId: data.clientId,
      clientName,
      customerId: data.clientId,
      status: OrderStatus.PENDING,
      items: resolvedItems,
      subtotal,
      tax,
      timber,
      transport,
      charges: data.charges ?? [],
      transporterId: data.transporterId,
      transporterName,
      total,
      shippingAddressId: resolvedShippingAddressId,
      shippingAddress:
        resolvedShippingAddress ??
        { street: '', city: '', state: '', country: 'TN', postalCode: '' },
      paymentMethod: data.paymentMethod ?? PaymentMethod.CASH_ON_DELIVERY,
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
    });

    await this.repository.create(entity);

    // ── 5. Take the goods out of stock ────────────────────────────────────
    await Promise.all(
      data.items.map((item) =>
        this.productRepository.updateStock(item.productId, -item.quantity)
      )
    );

    // Write the history. Best-effort: never fail a sale over a journal row.
    await recordStockMovements(
      resolvedItems.map((item) => ({
        productId: item.productId,
        productCode: item.code,
        productName: item.name,
        type: StockMovementType.SALE,
        availableDelta: -item.quantity,
        orderId: uuid,
        orderNumber,
        reason: `Commande #${orderNumber}`,
        actor,
      }))
    );

    // Walk-in clients have no email address. Skip the notice rather than let it
    // throw into the catch below on every counter sale.
    if (client.email) {
      // Best-effort mail send: order creation must not fail if mail is down.
      try {
        const branding = await getDefaultEmailBranding();
        const emailContent = renderOrderReceivedEmail({
          locale: 'fr',
          customerName: clientName,
          branding,
          orderNumber,
          items: resolvedItems.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            priceHT: item.priceHT,
            priceTTC: item.priceTTC,
            discountedPrice: item.discountedPrice,
          })),
          notes: data.notes,
          orderUrl: branding.websiteUrl ? `${branding.websiteUrl.replace(/\/+$/, '')}/track-order/${uuid}` : undefined,
        });

        await sendEmail({ to: client.email, email: emailContent });
      } catch (err) {
        console.warn(
          JSON.stringify({
            level: 'WARN',
            message: 'Order created but confirmation email failed',
            orderNumber,
            clientId: data.clientId,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }

    // A shop customer can reach this endpoint too. Never hand them back the
    // per-item supplier cost that toPublicDTO() carries.
    const dto = callerIsStaff ? entity.toPublicDTO() : entity.toCustomerDTO();

    return {
      success: true,
      message: 'Order created successfully',
      data: { ...dto, id: uuid },
    };
  }
}
