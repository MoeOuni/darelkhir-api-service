import { OrderRepository } from '@/repositories/OrderRepository';
import { NotFoundError } from '@libs/errors';

interface GetOrderResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
}

export class GetOrderUseCase {
  constructor(private repository: OrderRepository) {}

  async execute(uuid: string, _requesterId: string, includeCost = false): Promise<GetOrderResult> {
    const entity = await this.repository.findByUuid(uuid);

    if (!entity) {
      throw new NotFoundError('Order not found');
    }

    // This endpoint is reachable without a token (order tracking), so the
    // per-item purchasePrice has to be stripped for anyone who is not staff.
    const dto = includeCost ? entity.toPublicDTO() : entity.toCustomerDTO();

    return {
      success: true,
      message: 'Order retrieved successfully',
      data: { ...dto, id: uuid },
    };
  }
}
