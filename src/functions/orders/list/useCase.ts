import { OrderRepository } from '@/repositories/OrderRepository';
import { DEFAULT_PAGE_SIZE } from '@libs/constants';
import { OrderStatus } from '@libs/enums';

interface ListOrdersInput {
  cursor?: string;
  limit?: number;
  status?: OrderStatus;
  search?: string;
  sort?: 'date_asc' | 'date_desc';
}

interface ListOrdersResult {
  success: boolean;
  message: string;
  data: {
    items: Record<string, any>[];
    cursor?: string;
    count: number;
  };
}

export class ListOrdersUseCase {
  constructor(private repository: OrderRepository) {}

  async execute(input: ListOrdersInput): Promise<ListOrdersResult> {
    const limit = Math.min(input.limit ?? DEFAULT_PAGE_SIZE, 100);

    // List all orders (admin sees everything), sorted newest first
    const paginated = await this.repository.listAll(
      input.cursor,
      limit,
      input.status,
      input.search,
      input.sort,
    );

    return {
      success: true,
      message: 'Orders retrieved successfully',
      data: {
        items: paginated.items.map((e) => {
          const dto = e.toPublicDTO();
          const uuid = (e.sk as string).split('#')[1];
          return { ...dto, id: uuid };
        }),
        cursor: paginated.cursor,
        count: paginated.count,
      },
    };
  }
}
