import { CategoryRepository } from '@/repositories/CategoryRepository';
import { DEFAULT_PAGE_SIZE } from '@libs/constants';

interface ListCategoriesInput {
  cursor?: string;
  limit?: number;
  parentId?: string;
}

interface ListCategoriesResult {
  success: boolean;
  message: string;
  data: {
    items: Record<string, any>[];
    cursor?: string;
    count: number;
  };
}

export class ListCategoriesUseCase {
  constructor(private repository: CategoryRepository) {}

  async execute(input: ListCategoriesInput): Promise<ListCategoriesResult> {
    const limit = Math.min(input.limit ?? DEFAULT_PAGE_SIZE, 100);

    const paginated = input.parentId
      ? await this.repository.listByParent(input.parentId, input.cursor, limit)
      : await this.repository.listAll(input.cursor, limit);

    return {
      success: true,
      message: 'Categories retrieved successfully',
      data: {
        items: paginated.items.map((e) => {
          const dto = e.toPublicDTO();
          const uuid = (dto.sk as string).split('#')[1];
          return { ...dto, id: uuid };
        }),
        cursor: paginated.cursor,
        count: paginated.count,
      },
    };
  }
}
