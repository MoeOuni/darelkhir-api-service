import { ProductRepository } from '@/repositories/ProductRepository';
import { NotFoundError } from '@libs/errors';
import { recordStockMovement } from '@libs/journal';
import { StockMovementType } from '@libs/enums';
import type { AuthUser } from '@libs/interfaces';
import { UpdateProductInput } from '@/schemas/product.schema';

interface UpdateProductResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
}

export class UpdateProductUseCase {
  constructor(private repository: ProductRepository) {}

  async execute(
    uuid: string,
    data: UpdateProductInput,
    _userId: string,
    actor?: AuthUser
  ): Promise<UpdateProductResult> {
    const entity = await this.repository.findByUuid(uuid);

    if (!entity) {
      throw new NotFoundError('Product not found');
    }

    // Capture the stock before the change so a hand edit can be journalled.
    const stockBefore = entity.stockAvailable;

    entity.set(data);
    // Recalculate priceTTC if pricing inputs changed
    if (data.priceHT !== undefined || data.taxRate !== undefined) {
      entity.set({ priceTTC: parseFloat((entity.priceHT * (1 + entity.taxRate / 100)).toFixed(3)) });
    }

    await this.repository.update(entity);

    // A worker typing a new stock number is a count correction. Record it, or
    // the number changes with nothing explaining why.
    if (data.stockAvailable !== undefined && data.stockAvailable !== stockBefore) {
      await recordStockMovement({
        productId: uuid,
        productCode: entity.code,
        productName: entity.name?.fr || entity.name?.ar,
        type: StockMovementType.ADJUSTMENT,
        availableDelta: data.stockAvailable - stockBefore,
        availableAfter: data.stockAvailable,
        reason: 'Correction manuelle du stock',
        actor,
      });
    }

    return {
      success: true,
      message: 'Product updated successfully',
      data: { ...entity.toPublicDTO(), id: uuid },
    };
  }
}
