import { TransporterRepository } from '@/repositories/TransporterRepository';
import { NotFoundError } from '@libs/errors';
import { UpdateTransporterInput } from '@/schemas/transporter.schema';

interface Result { success: boolean; message: string; data?: Record<string, any> }

export class UpdateTransporterUseCase {
  constructor(private repository: TransporterRepository) {}

  async execute(uuid: string, data: UpdateTransporterInput, _userId: string): Promise<Result> {
    const entity = await this.repository.findByUuid(uuid);

    if (!entity) {
      throw new NotFoundError('Transporter not found');
    }

    entity.set(data);
    await this.repository.update(entity);

    return {
      success: true,
      message: 'Transporter updated successfully',
      data: { ...entity.toPublicDTO(), id: uuid },
    };
  }
}
