import { CategoryRepository } from '@/repositories/CategoryRepository';
import { NotFoundError } from '@libs/errors';

interface GetCategoryResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
}

export class GetCategoryUseCase {
  constructor(private repository: CategoryRepository) {}

  async execute(uuid: string): Promise<GetCategoryResult> {
    const entity = await this.repository.findByUuid(uuid);

    if (!entity) {
      throw new NotFoundError('Category not found');
    }

    return {
      success: true,
      message: 'Category retrieved successfully',
      data: { ...entity.toPublicDTO(), id: uuid },
    };
  }
}
