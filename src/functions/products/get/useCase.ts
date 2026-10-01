import { ProductRepository } from '@/repositories/ProductRepository';
import { NotFoundError } from '@libs/errors';

interface GetProductResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
}

export class GetProductUseCase {
  constructor(private repository: ProductRepository) {}

  async execute(uuid: string, includeCost = false): Promise<GetProductResult> {
    const entity = await this.repository.findByUuid(uuid);

    if (!entity) {
      throw new NotFoundError('Product not found');
    }

    const dto = includeCost ? entity.toPublicDTO() : entity.toCustomerDTO();

    return {
      success: true,
      message: 'Product retrieved successfully',
      data: { ...dto, id: uuid },
    };
  }
}
