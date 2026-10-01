import { TransporterRepository } from '@/repositories/TransporterRepository';
import { TransporterEntity } from '@/entities/TransporterEntity';
import { IdGenerator } from '@/utils/IdGenerator';
import { DataType } from '@libs/enums';
import { CreateTransporterInput } from '@/schemas/transporter.schema';

interface Result { success: boolean; message: string; data?: Record<string, any> }

export class CreateTransporterUseCase {
  constructor(private repository: TransporterRepository) {}

  async execute(data: CreateTransporterInput, _userId: string): Promise<Result> {
    const uuid = IdGenerator.generate();
    const now = new Date().toISOString();

    const entity = new TransporterEntity({
      id: DataType.TRANSPORTER,
      sk: `${DataType.TRANSPORTER}#${uuid}`,
      dataType: DataType.TRANSPORTER,
      name: data.name,
      phone: data.phone,
      secondaryPhone: data.secondaryPhone,
      vehiclePlateNumber: data.vehiclePlateNumber,
      cin: data.cin,
      createdAt: now,
      updatedAt: now,
    });

    await this.repository.create(entity);

    return {
      success: true,
      message: 'Transporter created successfully',
      data: { ...entity.toPublicDTO(), id: uuid },
    };
  }
}
