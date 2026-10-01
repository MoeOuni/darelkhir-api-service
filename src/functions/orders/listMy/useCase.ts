import { OrderRepository } from '@/repositories/OrderRepository';
import { DEFAULT_PAGE_SIZE } from '@libs/constants';

interface ListMyOrdersInput {
  customerId: string;
  cursor?: string;
  limit?: number;
}

interface ListMyOrdersResult {
  success: boolean;
  message: string;
  data: {
    items: Record<string, any>[];
    cursor?: string;
    count: number;
  };
}

export class ListMyOrdersUseCase {
  constructor(private repository: OrderRepository) {}

  async execute(input: ListMyOrdersInput): Promise<ListMyOrdersResult> {
    const limit = Math.min(input.limit ?? DEFAULT_PAGE_SIZE, 100);

    const paginated = await this.repository.listByCustomer(
      input.customerId,
      input.cursor,
      limit,
    );

    return {
      success: true,
      message: 'Orders retrieved successfully',
      data: {
        items: paginated.items.map((e) => {
          const dto = e.toCustomerDTO();
          const uuid = (e.sk as string).split('#')[1];
          return { ...dto, id: uuid };
        }),
        cursor: paginated.cursor,
        count: paginated.count,
      },
    };
  }
}
