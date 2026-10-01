import { TransporterRepository } from '@/repositories/TransporterRepository';
import { NotFoundError } from '@libs/errors';

interface Result { success: boolean; message: string }

export class DeleteTransporterUseCase {
  constructor(private repository: TransporterRepository) {}

  async execute(uuid: string, _userId: string): Promise<Result> {
    const entity = await this.repository.findByUuid(uuid);

    if (!entity) {
      throw new NotFoundError('Transporter not found');
    }

    await this.repository.deleteByUuid(uuid);

    return { success: true, message: 'Transporter deleted successfully' };
  }
}
