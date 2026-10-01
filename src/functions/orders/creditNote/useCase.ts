import { OrderRepository } from '@/repositories/OrderRepository';
import { ProductRepository } from '@/repositories/ProductRepository';
import { ClientRepository } from '@/repositories/ClientRepository';
import { PaymentRepository } from '@/repositories/PaymentRepository';
import { NotFoundError, ValidationError } from '@libs/errors';
import { OrderStatus, StockMovementType, isReleasedStatus } from '@libs/enums';
import { recordStockMovements } from '@libs/journal';
import { recalculateClientBalance } from '@libs/balance';
import type { AuthUser } from '@libs/interfaces';

interface CreateCreditNoteInput {
  reason?: string;
  /** Put the goods back into stock. True for a refusal at the door. */
  restock?: boolean;
}

interface CreditNoteResult {
  success: boolean;
  message: string;
  data: Record<string, any>;
}

/**
 * Cancels an invoiced order by issuing a credit note.
 *
 * A confirmed order is never erased and its invoice never changes. The tax book
 * has to show what happened, including the mistakes. The credit note is a
 * second document, with its own gapless number, that cancels the first.
 */
export class CreateCreditNoteUseCase {
  constructor(
    private repository: OrderRepository,
    private productRepository: ProductRepository,
    private clientRepository: ClientRepository,
  ) {}

  async execute(
    uuid: string,
    input: CreateCreditNoteInput,
    actor?: AuthUser,
  ): Promise<CreditNoteResult> {
    const entity = await this.repository.findByUuid(uuid);

    if (!entity) {
      throw new NotFoundError('Order not found');
    }

    if (!entity.isInvoiced) {
      throw new ValidationError(
        'This order has no invoice. Cancel the draft instead of issuing a credit note.'
      );
    }

    if (entity.creditNoteNumber) {
      throw new ValidationError('This order already has a credit note.');
    }

    // Read before the status is overwritten below. An order cancelled first and
    // credit-noted afterwards — the paperwork catching up with a decision
    // already taken — has already had its goods put back, and doing it twice
    // would quietly invent stock the shop does not have.
    const alreadyReleased = isReleasedStatus(entity.status);

    const creditNoteNumber = await this.repository.incrementCreditNoteCounter();

    entity.set({
      creditNoteNumber,
      creditNoteIssuedAt: new Date().toISOString(),
      creditNoteReason: input.reason,
      status: OrderStatus.CANCELLED,
    });

    entity.set({ updatedAt: new Date().toISOString() });
    await this.repository.update(entity);

    // Return the goods to stock. The reservation was already cleared when the
    // order was confirmed, so only the available count moves.
    if (input.restock !== false && !alreadyReleased) {
      await Promise.all(
        entity.items.map((item) =>
          this.productRepository.updateStock(
            item.productId, item.quantity)
        )
      );

      // Then write down why they moved. Without this the count went up and
      // nothing in the stock history said what had happened: the shelf was
      // right and the book showed only the sale, so a worker reading it could
      // not tell a returned order from a miscount.
      await recordStockMovements(
        entity.items.map((item) => ({
          productId: item.productId,
          productCode: item.code,
          productName: item.name,
          type: StockMovementType.RETURN,
          availableDelta: item.quantity,
          orderId: uuid,
          orderNumber: entity.orderNumber,
          reason: `Avoir AV-${String(creditNoteNumber).padStart(3, '0')} — commande #${entity.orderNumber}`,
          actor,
        })),
      );
    }

    // The order no longer counts as money owed, so the client balance drops.
    //
    // The payments have to be read for that. Left out, the balance was worked
    // out as if the client had never paid anything: issuing one credit note
    // put his whole payment history back onto what he owed.
    await recalculateClientBalance(
      entity.clientId,
      this.repository,
      this.clientRepository,
      new PaymentRepository()
    );

    return {
      success: true,
      message: 'Credit note issued successfully',
      data: { ...entity.toPublicDTO(), id: uuid },
    };
  }
}
