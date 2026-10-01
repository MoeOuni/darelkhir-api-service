import { TransporterRepository } from '@/repositories/TransporterRepository';
import { DEFAULT_PAGE_SIZE } from '@libs/constants';

interface Result { success: boolean; message: string; data?: Record<string, any> }

export class ListTransportersUseCase {
  constructor(private repository: TransporterRepository) {}

  async execute(params: { cursor?: string; limit?: number; search?: string }): Promise<Result> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE;
    const paginated = await this.repository.listAll(params.cursor, limit, params.search);

    return {
      success: true,
      message: 'Transporters retrieved successfully',
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
