import { ClientRepository } from '@/repositories/ClientRepository';
import { OrderRepository } from '@/repositories/OrderRepository';
import { PaymentRepository } from '@/repositories/PaymentRepository';
import { NotFoundError } from '@libs/errors';
import { recalculateClientBalance } from '@libs/balance';
import { UpdateClientInput } from '@/schemas/client.schema';

interface UpdateClientResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
}

export class UpdateClientUseCase {
  constructor(
    private repository: ClientRepository,
    private orderRepository?: OrderRepository,
    private paymentRepository?: PaymentRepository,
  ) {}

  async execute(uuid: string, data: UpdateClientInput): Promise<UpdateClientResult> {
    const entity = await this.repository.findByUuid(uuid);

    if (!entity) {
      throw new NotFoundError('Client not found');
    }

    entity.set(data);
    await this.repository.update(entity);

    // The stored balance is what the money-owed page sorts and filters on, and
    // a debt carried over from the notebook is part of it. Changing that amount
    // is one of the two things that move a balance without an order or a
    // payment behind it, so the total is worked out again here rather than
    // waiting for his next purchase to correct it.
    if ('openingBalance' in data && this.orderRepository) {
      await recalculateClientBalance(
        uuid,
        this.orderRepository,
        this.repository,
        this.paymentRepository,
      );
    }

    const saved = (await this.repository.findByUuid(uuid)) ?? entity;

    return {
      success: true,
      message: 'Client updated successfully',
      data: { ...saved.toPublicDTO(), id: uuid },
    };
  }
}
