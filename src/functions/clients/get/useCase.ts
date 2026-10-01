import { ClientRepository } from '@/repositories/ClientRepository';
import { NotFoundError } from '@libs/errors';

interface GetClientResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
}

export class GetClientUseCase {
  constructor(private repository: ClientRepository) {}

  async execute(uuid: string): Promise<GetClientResult> {
    const entity = await this.repository.findByUuid(uuid);

    if (!entity) {
      throw new NotFoundError('Client not found');
    }

    return {
      success: true,
      message: 'Client retrieved successfully',
      data: {
        ...entity.toPublicDTO(),
        id: (entity.toPublicDTO().sk as string).split('#')[1],
      },
    };
  }
}
