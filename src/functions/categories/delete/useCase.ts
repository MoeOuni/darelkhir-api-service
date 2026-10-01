import { CategoryRepository } from '@/repositories/CategoryRepository';
import { NotFoundError } from '@libs/errors';

interface DeleteCategoryResult {
  success: boolean;
  message: string;
}

export class DeleteCategoryUseCase {
  constructor(private repository: CategoryRepository) {}

  async execute(uuid: string, _userId: string): Promise<DeleteCategoryResult> {
    const entity = await this.repository.findByUuid(uuid);

    if (!entity) {
      throw new NotFoundError('Category not found');
    }

    await this.repository.deleteByUuid(uuid);

    return { success: true, message: 'Category deleted successfully' };
  }
}
