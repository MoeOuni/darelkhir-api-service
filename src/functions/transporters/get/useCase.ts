import { TransporterRepository } from '@/repositories/TransporterRepository';
import { NotFoundError } from '@libs/errors';

interface Result { success: boolean; message: string; data?: Record<string, any> }

export class GetTransporterUseCase {
  constructor(private repository: TransporterRepository) {}

  async execute(uuid: string): Promise<Result> {
    const entity = await this.repository.findByUuid(uuid);

    if (!entity) {
      throw new NotFoundError('Transporter not found');
    }

    return {
      success: true,
      message: 'Transporter retrieved successfully',
      data: { ...entity.toPublicDTO(), id: uuid },
    };
  }
}
