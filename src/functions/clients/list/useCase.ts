import { ClientRepository } from '@/repositories/ClientRepository';
import { DEFAULT_PAGE_SIZE } from '@libs/constants';

interface ListClientsInput {
  cursor?: string;
  limit?: number;
  search?: string;
  sort?: 'date_asc' | 'date_desc';
}

interface ListClientsResult {
  success: boolean;
  message: string;
  data: {
    items: Record<string, any>[];
    cursor?: string;
    count: number;
  };
}

export class ListClientsUseCase {
  constructor(private repository: ClientRepository) {}

  async execute(input: ListClientsInput, canSeeDebt = true): Promise<ListClientsResult> {
    const limit = Math.min(input.limit ?? DEFAULT_PAGE_SIZE, 100);

    const paginated = await this.repository.listAll(input.cursor, limit, input.search, input.sort);

    return {
      success: true,
      message: 'Clients retrieved successfully',
      data: {
        items: paginated.items.map((e) => {
          const dto = canSeeDebt ? e.toPublicDTO() : e.toDebtFreeDTO();
          const uuid = (dto.sk as string).split('#')[1];
          return { ...dto, id: uuid };
        }),
        cursor: paginated.cursor,
        count: paginated.count,
      },
    };
  }
}
