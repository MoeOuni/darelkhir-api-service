import { ProductRepository } from '@/repositories/ProductRepository';
import { recordStockMovement } from '@libs/journal';
import { StockMovementType } from '@libs/enums';
import type { AuthUser } from '@libs/interfaces';
import { ProductEntity } from '@/entities/ProductEntity';
import { IdGenerator } from '@/utils/IdGenerator';
import { DataType, ProductStatus } from '@libs/enums';
import { CreateProductInput } from '@/schemas/product.schema';

interface CreateProductResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
}

export class CreateProductUseCase {
  constructor(private repository: ProductRepository) {}

  async execute(
    data: CreateProductInput,
    userId: string,
    actor?: AuthUser
  ): Promise<CreateProductResult> {
    const uuid = IdGenerator.generate();
    const now = new Date().toISOString();

    const entity = new ProductEntity({
      id: DataType.PRODUCT,
      sk: `${DataType.PRODUCT}#${uuid}`,
      dataType: DataType.PRODUCT,
      name: data.name,
      description: data.description,
      purchasePrice: data.purchasePrice,
      priceHT: data.priceHT,
      taxRate: data.taxRate ?? 19,
      priceTTC: parseFloat((data.priceHT * (1 + (data.taxRate ?? 19) / 100)).toFixed(3)),
      code: data.code,
      discountedPrice: data.discountedPrice,
      discountPercentage: data.discountPercentage,
      stockAvailable: data.stockAvailable ?? 0,
      categoryId: data.categoryId,
      status: data.status ?? ProductStatus.ACTIVE,
      imageUrl: data.imageUrl,
      createdAt: now,
      updatedAt: now,
    });

    await this.repository.create(entity);

    // Opening balance, so the history starts at the right number.
    if (entity.stockAvailable > 0) {
      await recordStockMovement({
        productId: uuid,
        productCode: entity.code,
        productName: entity.name?.fr || entity.name?.ar,
        type: StockMovementType.INITIAL,
        availableDelta: entity.stockAvailable,
        availableAfter: entity.stockAvailable,
        reason: 'Stock de départ',
        actor,
      });
    }

    return {
      success: true,
      message: 'Product created successfully',
      data: { ...entity.toPublicDTO(), id: uuid },
    };
  }
}
