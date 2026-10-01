import { OrderRepository } from '@/repositories/OrderRepository';
import { ProductRepository } from '@/repositories/ProductRepository';
import { TransporterRepository } from '@/repositories/TransporterRepository';
import { ClientRepository } from '@/repositories/ClientRepository';
import { NotFoundError, ValidationError } from '@libs/errors';
import {
  OrderStatus,
  isDraftStatus,
  isReleasedStatus,
  DeliveryState,
  StockMovementType,
  ProductStatus,
} from '@libs/enums';
import { recordStockMovements } from '@libs/journal';
import { computeStockDeltas } from '@libs/order-items';
import { findStopProblems } from '@libs/order-stops';
import { ClientPriceRepository } from '@/repositories/ClientPriceRepository';
import { PaymentRepository } from '@/repositories/PaymentRepository';
import { PaymentEntity } from '@/entities/PaymentEntity';
import { recalculateClientBalance } from '@libs/balance';
import { IdGenerator } from '@/utils/IdGenerator';
import { DataType, PaymentType, CheckStatus } from '@libs/enums';
import type { AuthUser } from '@libs/interfaces';
import { UpdateOrderInput } from '@/schemas/order.schema';
import { getDefaultEmailBranding, sendEmail } from '@libs/email/sender';
import { renderOrderConfirmationEmail, renderOrderStatusEmail } from '@libs/email';

interface UpdateOrderResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
}

// Statuses that commit reserved stock (goods are on their way / delivered)
const FULFILLMENT_STATUSES = new Set([
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
]);

export class UpdateOrderUseCase {
  constructor(
    private repository: OrderRepository,
    private productRepository: ProductRepository,
    private transporterRepository: TransporterRepository,
    private clientRepository: ClientRepository
  ) {}

  async execute(
    uuid: string,
    data: UpdateOrderInput,
    requesterId: string,
    actor?: AuthUser
  ): Promise<UpdateOrderResult> {
    const entity = await this.repository.findByUuid(uuid);

    if (!entity) {
      throw new NotFoundError('Order not found');
    }

    // `payment` and `items` travel on this request but are not plain fields:
    // one writes a payment record, the other rebuilds the lines and the stock.
    const { payment: confirmPayment, items: newItems, stops: newStops, ...orderFields } = data;
    const updateData: Omit<UpdateOrderInput, 'payment' | 'items' | 'stops'> = { ...orderFields };
    if (data.deliveryDate) {
      const parsed = data.deliveryDate.length === 10
        ? new Date(`${data.deliveryDate}T00:00:00.000Z`)
        : new Date(data.deliveryDate);

      if (Number.isNaN(parsed.getTime())) {
        throw new ValidationError('Invalid delivery date');
      }

      updateData.deliveryDate = parsed.toISOString();
    }

    const previousStatus = entity.status;
    const wasInvoiced = entity.isInvoiced;

    // ── The freeze rule ───────────────────────────────────────────────────
    // Once an invoice number is spent, the paper in the client's hand has to
    // keep matching the record. Anything that moves money is refused; a change
    // goes through a credit note instead.
    //
    // What counts is what actually moved, not what the request happened to
    // carry. The dashboard posts the whole form on every save, so a rule that
    // fired on the mere presence of `transport` refused every later edit —
    // the delivery round and the loading charges included — and the save came
    // back as an error the worker never asked for.
    if (wasInvoiced) {
      const changed = (field: 'transport', value: unknown) =>
        value !== undefined && value !== (entity as never as Record<string, unknown>)[field];

      // Only what changes an amount. The driver and the delivery address are
      // printed on the paper but appear in no figure on it: a lorry breaks
      // down and another one goes out, a client says "leave it at the depot
      // instead" — neither is a reason to cancel an invoice and issue a credit
      // note. The transport fee is a row in the totals and the articles are
      // the whole substance, so those two still cannot move.
      const movesMoney = changed('transport', data.transport) || newItems !== undefined;

      if (movesMoney) {
        throw new ValidationError(
          'This order is already invoiced. Issue a credit note to change it.'
        );
      }
    }

    entity.set(updateData);

    // ── Change what was ordered ───────────────────────────────────────────
    // A client changes their mind at the counter: ten of one thing becomes
    // three of another. Cancelling and re-typing the order would burn an order
    // number and lose the history, so the lines are rewritten in place.
    if (newItems) {
      if (isReleasedStatus(entity.status)) {
        throw new ValidationError('A cancelled order cannot be changed.');
      }

      const products = await Promise.all(
        newItems.map((item) => this.productRepository.findByUuid(item.productId))
      );

      for (let i = 0; i < newItems.length; i++) {
        const product = products[i];
        if (!product) {
          throw new NotFoundError(`Product not found: ${newItems[i].productId}`);
        }
        if (product.status !== ProductStatus.ACTIVE) {
          throw new ValidationError(
            `Product is no longer available: ${product.name.fr || product.name.ar}`
          );
        }
      }

      // Kept for the journal: a line that is removed no longer appears on the
      // order, but its name still belongs in the stock history.
      const previousItems = entity.items;

      // Only the difference moves. Asking for three more of something the
      // order already holds must not take ten off the shelf again.
      const deltas = computeStockDeltas(previousItems, newItems);

      // `products` is index-aligned with `newItems`, so the id comes from the
      // request, not from the entity's partition key.
      const productByRequestId = new Map(
        newItems.map((item, i) => [item.productId, products[i]!]),
      );

      for (const { productId, delta } of deltas) {
        if (delta <= 0) continue;
        const product = productByRequestId.get(productId);
        if (!product || product.stockAvailable < delta) {
          const label = product ? product.name.fr || product.name.ar : productId;
          throw new ValidationError(`Insufficient stock for: ${label}`);
        }
      }

      // Prices are re-read from the catalogue, exactly as when the order was
      // created. Nothing is invoiced yet, so the current price is the price —
      // and this client's agreed prices still win over the catalogue.
      const agreed = await new ClientPriceRepository().priceMapFor(
        entity.clientId,
        newItems.map((item) => item.productId),
      );

      const resolvedItems = newItems.map((item, i) => {
        const p = products[i]!;
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
          discountedPrice: clientPrice ?? p.discountedPrice,
          discountPercentage: clientPrice !== undefined ? undefined : p.discountPercentage,
          agreedPrice: clientPrice !== undefined,
          quantity: item.quantity,
        };
      });

      const effectiveHT = (item: (typeof resolvedItems)[number]) =>
        item.discountedPrice
          ? parseFloat((item.discountedPrice / (1 + item.taxRate / 100)).toFixed(4))
          : item.priceHT;

      const subtotal = parseFloat(
        resolvedItems.reduce((acc, i) => acc + effectiveHT(i) * i.quantity, 0).toFixed(2)
      );
      const tax = parseFloat(
        resolvedItems
          .reduce((acc, i) => acc + effectiveHT(i) * (i.taxRate / 100) * i.quantity, 0)
          .toFixed(2)
      );
      const transport = entity.transport ?? 0;

      entity.set({
        items: resolvedItems,
        subtotal,
        tax,
        total: parseFloat((subtotal + tax + entity.timber + transport).toFixed(2)),
      });

      // Move the stock, then write why it moved.
      await Promise.all(
        deltas.map(({ productId, delta }) =>
          this.productRepository.updateStock(productId, -delta)
        )
      );

      const labelById = new Map<string, { code: string; name: string }>();
      for (const item of [...previousItems, ...resolvedItems]) {
        labelById.set(item.productId, { code: item.code, name: item.name });
      }

      await recordStockMovements(
        deltas.map(({ productId, delta }) => ({
          productId,
          productCode: labelById.get(productId)?.code ?? '',
          productName: labelById.get(productId)?.name ?? '',
          type: delta > 0 ? StockMovementType.SALE : StockMovementType.RETURN,
          availableDelta: -delta,
          orderId: uuid,
          orderNumber: entity.orderNumber,
          reason: `Commande #${entity.orderNumber} modifiée`,
          actor,
        }))
      );
    }

    // ── The delivery round ────────────────────────────────────────────────
    // The lorry leaves with the whole order and must come back empty, so the
    // stops have to account for every article on it. Checked after the lines
    // are settled above, in case both changed on the same request.
    if (newStops !== undefined) {
      if (newStops.length === 0) {
        entity.set({ stops: [] });
      } else {
        const problems = findStopProblems(entity.items, newStops as never);

        if (problems.length > 0) {
          const said = problems
            .map((problem) => {
              const name =
                entity.items.find((i) => i.productId === problem.productId)?.name ??
                problem.productId;

              if (problem.kind === 'unknown_product') return `${name} is not on this order`;
              if (problem.kind === 'short') {
                return `${name}: ${problem.assigned} of ${problem.ordered} assigned`;
              }
              return `${name}: ${problem.assigned} assigned but only ${problem.ordered} sold`;
            })
            .join('; ');

          throw new ValidationError(`The stops do not match the order — ${said}`);
        }

        entity.set({ stops: newStops as never });
      }
    }

    // ── Issue the invoice ─────────────────────────────────────────────────
    // The number is taken here and nowhere else. A draft that dies, and a
    // customer pressing checkout, never consume one.
    if (
      data.status === OrderStatus.CONFIRMED &&
      isDraftStatus(previousStatus) &&
      !wasInvoiced
    ) {
      const invoiceNumber = await this.repository.incrementInvoiceCounter();
      entity.set({
        invoiceNumber,
        invoiceIssuedAt: new Date().toISOString(),
      });
    }

    // Delivery state only means something when a transporter carries the goods.
    if (data.status === OrderStatus.DELIVERED) {
      entity.set({ deliveryState: DeliveryState.DELIVERED });
    }

    // Transport changing moves the total, with or without a change to the
    // lines. Charges never do — they are not on the invoice.
    if (data.transport !== undefined || data.transporterId !== undefined) {
      if (data.transporterId) {
        const transporter = await this.transporterRepository.findByUuid(data.transporterId);
        if (transporter) {
          entity.set({ transporterName: transporter.name });
        }
      }
      const transport = entity.transport ?? 0;
      entity.set({
        total: parseFloat((entity.subtotal + entity.tax + entity.timber + transport).toFixed(2)),
      });
    }

    // Stamp the change. Without this an order's `updatedAt` stayed at its
    // creation time forever, which made it useless for telling whether a
    // rendered document is still current.
    entity.set({ updatedAt: new Date().toISOString() });
    await this.repository.update(entity);

    // ── Money taken at the counter ────────────────────────────────────────
    // Written after the order, so the invoice number is already safe. An
    // amount of 0 means the client paid nothing today and the whole total
    // goes to their balance — no payment record for that.
    let paymentWarning: string | undefined;
    if (confirmPayment && confirmPayment.amount > 0) {
      try {
        const now = new Date().toISOString();
        const paymentUuid = IdGenerator.generate();
        const paymentRepository = new PaymentRepository();

        await paymentRepository.create(
          new PaymentEntity({
            id: DataType.PAYMENT,
            sk: `${DataType.PAYMENT}#${paymentUuid}`,
            dataType: DataType.PAYMENT,
            clientId: entity.clientId,
            amount: confirmPayment.amount,
            method: confirmPayment.method,
            paidAt: now,
            reference: confirmPayment.reference,
            // Informational only. The balance is per client, never per order.
            orderId: uuid,
            checkNumber: confirmPayment.checkNumber,
            bankName: confirmPayment.bankName,
            dueDate: confirmPayment.dueDate,
            checkStatus:
              confirmPayment.method === PaymentType.CHECK ? CheckStatus.HELD : undefined,
            recordedBy: actor?.sub,
            notes: `Encaissé à la confirmation de la commande #${entity.orderNumber}`,
            createdAt: now,
            updatedAt: now,
          })
        );

        // The balance is recomputed once at the end of the update, which
        // takes this payment in with everything else.
      } catch (err) {
        // The order is confirmed and the invoice is issued — that must stand.
        // Say plainly that the money was not recorded so a worker can add it
        // by hand, rather than failing the whole request.
        paymentWarning =
          'Order confirmed, but the payment was not recorded. Add it from the client page.';
        console.warn(
          JSON.stringify({
            level: 'WARN',
            message: 'Confirmation payment failed',
            orderId: uuid,
            error: err instanceof Error ? err.message : String(err),
          })
        );
      }
    }

    // Handle stock transitions only when status actually changes
    if (data.status && data.status !== previousStatus) {
      // 'pending' and 'draft' both mean "not committed yet". Orders created
      // before the rename still carry 'pending'.
      const wasPending = isDraftStatus(previousStatus);

      if (wasPending && FULFILLMENT_STATUSES.has(data.status)) {
        // Nothing to do. The goods left stock when the order was created, and
        // there is no reservation to clear any more.
      } else if (isReleasedStatus(data.status) && !isReleasedStatus(previousStatus)) {
        // Order cancelled or refunded — the goods go back on the shelf.
        await Promise.all(
          entity.items.map((item) =>
            this.productRepository.updateStock(item.productId, item.quantity)
          )
        );
        await recordStockMovements(
          entity.items.map((item) => ({
            productId: item.productId,
            productCode: item.code,
            productName: item.name,
            type: StockMovementType.RETURN,
            availableDelta: item.quantity,
            orderId: uuid,
            orderNumber: entity.orderNumber,
            reason: `${data.status === OrderStatus.CANCELLED ? 'Annulée' : 'Remboursée'} — commande #${entity.orderNumber}`,
            actor,
          }))
        );
      }

      // Send full priced confirmation only when order gets admin-confirmed.
      if (data.status === OrderStatus.CONFIRMED) {
        try {
          const client = await this.clientRepository.findByUuid(entity.clientId);
          if (client?.email) {
            const branding = await getDefaultEmailBranding();
            const emailContent = renderOrderConfirmationEmail({
              locale: 'fr',
              customerName: entity.clientName,
              branding,
              orderNumber: entity.orderNumber,
              subtotal: entity.subtotal,
              tax: entity.tax,
              timber: entity.timber,
              transport: entity.transport,
              total: entity.total,
              shippingAddress: entity.shippingAddress,
              items: entity.items.map((item) => ({
                name: item.name,
                quantity: item.quantity,
                priceHT: item.priceHT,
                priceTTC: item.priceTTC,
                discountedPrice: item.discountedPrice,
                discountPercentage: item.discountPercentage,
                taxRate: item.taxRate,
              })),
              notes: entity.notes,
              orderUrl: branding.websiteUrl ? `${branding.websiteUrl.replace(/\/+$/, '')}/track-order/${uuid}` : undefined,
            });

            await sendEmail({ to: client.email, email: emailContent });
          }
        } catch (err) {
          console.warn(
            JSON.stringify({
              level: 'WARN',
              message: 'Order confirmed but confirmation email failed',
              orderId: uuid,
              orderNumber: entity.orderNumber,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      }

      if (data.status === OrderStatus.SHIPPED) {
        try {
          const client = await this.clientRepository.findByUuid(entity.clientId);
          if (client?.email) {
            const branding = await getDefaultEmailBranding();
            const trackingUrl = branding.websiteUrl
              ? `${branding.websiteUrl.replace(/\/+$/, '')}/track-order/${uuid}`
              : undefined;

            const emailContent = renderOrderStatusEmail({
              locale: 'fr',
              customerName: entity.clientName,
              branding,
              orderNumber: entity.orderNumber,
              status: OrderStatus.SHIPPED,
              summary: entity.transporterName
                ? `Votre commande est en route avec ${entity.transporterName}.`
                : 'Votre commande est en route.',
              trackingUrl,
            });

            await sendEmail({ to: client.email, email: emailContent });
          }
        } catch (err) {
          console.warn(
            JSON.stringify({
              level: 'WARN',
              message: 'Order shipped but status email failed',
              orderId: uuid,
              orderNumber: entity.orderNumber,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      }
    }

    // ── The client's balance ──────────────────────────────────────────────
    // Recomputed on every update, not only when money changed hands at the
    // counter. Confirming an order is what turns it into a debt, and a
    // confirmation without a payment used to leave the stored balance
    // untouched: the client's own statement was right, because it works the
    // figures out fresh, while the list and the day's figures kept showing a
    // number from before the order existed. Cancelling, or editing the lines,
    // moves it the same way.
    //
    // It is derived from the orders and the payments, so recomputing it is
    // idempotent and safe to do on every pass.
    try {
      await recalculateClientBalance(
        entity.clientId,
        this.repository,
        this.clientRepository,
        new PaymentRepository()
      );
    } catch (err) {
      // The order is saved and the invoice is issued — that must stand. The
      // balance is derived, so the next thing that touches this client puts it
      // right; failing the whole request here would be worse.
      console.warn(
        JSON.stringify({
          level: 'WARN',
          message: 'Order updated but the client balance was not recomputed',
          orderId: uuid,
          clientId: entity.clientId,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }

    return {
      success: true,
      message: paymentWarning ?? 'Order updated successfully',
      data: { ...entity.toPublicDTO(), id: uuid },
    };
  }
}
