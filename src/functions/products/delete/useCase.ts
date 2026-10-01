import { ProductRepository } from '@/repositories/ProductRepository';
import { NotFoundError } from '@libs/errors';

interface DeleteProductResult {
  success: boolean;
  message: string;
}

export class DeleteProductUseCase {
  constructor(private repository: ProductRepository) {}

  async execute(uuid: string, _userId: string): Promise<DeleteProductResult> {
    const entity = await this.repository.findByUuid(uuid);

    if (!entity) {
      throw new NotFoundError('Product not found');
    }

    await this.repository.deleteByUuid(uuid);

    return { success: true, message: 'Product deleted successfully' };
  }
}
