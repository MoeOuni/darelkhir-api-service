import { CategoryRepository } from '@/repositories/CategoryRepository';
import { NotFoundError } from '@libs/errors';
import { UpdateCategoryInput } from '@/schemas/category.schema';

interface UpdateCategoryResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
}

export class UpdateCategoryUseCase {
  constructor(private repository: CategoryRepository) {}

  async execute(
    uuid: string,
    data: UpdateCategoryInput,
    _userId: string
  ): Promise<UpdateCategoryResult> {
    const entity = await this.repository.findByUuid(uuid);

    if (!entity) {
      throw new NotFoundError('Category not found');
    }

    entity.set(data);
    await this.repository.update(entity);

    return {
      success: true,
      message: 'Category updated successfully',
      data: { ...entity.toPublicDTO(), id: uuid },
    };
  }
}
