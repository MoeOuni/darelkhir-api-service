import { ProductRepository } from '@/repositories/ProductRepository';
import { DEFAULT_PAGE_SIZE } from '@libs/constants';
import { ProductStatus } from '@libs/enums';
import { needsAttention } from '@libs/product-alerts';

interface ListProductsInput {
  cursor?: string;
  limit?: number;
  categoryId?: string;
  status?: ProductStatus;
  search?: string;
  sort?: 'date_asc' | 'date_desc';
  /** Staff only. Includes purchasePrice in the response when true. */
  includeCost?: boolean;
  /** Only the products whose settings are wrong. Staff only. */
  flagged?: boolean;
}

interface ListProductsResult {
  success: boolean;
  message: string;
  data: {
    items: Record<string, any>[];
    cursor?: string;
    count: number;
  };
}

export class ListProductsUseCase {
  constructor(private repository: ProductRepository) {}

  async execute(input: ListProductsInput): Promise<ListProductsResult> {
    const limit = Math.min(input.limit ?? DEFAULT_PAGE_SIZE, 100);

    const shape = (e: { toPublicDTO(): Record<string, any>; toCustomerDTO(): Record<string, any> }) => {
      const dto = input.includeCost ? e.toPublicDTO() : e.toCustomerDTO();
      return { ...dto, id: (dto.sk as string).split('#')[1] };
    };

    // Asking for what is wrong means asking about the whole catalogue: a
    // product with no purchase price hides on page five as well as on page
    // one. The alerts are read off the cost, so this is refused to a caller
    // who is not allowed to see it — the flag would give the cost away.
    if (input.flagged && input.includeCost) {
      const flagged = (await this.repository.listEveryProduct()).filter((e) => needsAttention(e));

      return {
        success: true,
        message: 'Products retrieved successfully',
        data: {
          items: flagged.map(shape),
          // One answer, whole: there is nothing to page through when the
          // point is to see everything that needs putting right.
          cursor: undefined,
          count: flagged.length,
        },
      };
    }

    const paginated = input.categoryId
      ? await this.repository.listByCategory(input.categoryId, input.cursor, limit, input.status, input.search, input.sort)
      : await this.repository.listAll(input.cursor, limit, input.status, input.search, input.sort);

    return {
      success: true,
      message: 'Products retrieved successfully',
      data: {
        items: paginated.items.map(shape),
        cursor: paginated.cursor,
        count: paginated.count,
      },
    };
  }
}
