import { ClientEntity } from '@/entities/ClientEntity';
import { DataType } from '@libs/enums';

/**
 * What a client owes is `payments.view`, not `clients.view`.
 *
 * A worker who takes orders needs the client list. That must not hand them
 * every client's debt on the way past.
 */
function makeClient() {
  return new ClientEntity({
    id: DataType.CLIENT,
    sk: `${DataType.CLIENT}#cl-1`,
    fullName: 'Slim Ben Ali',
    phone: '+21620000000',
    balance: 1450.5,
    hasPaperBalance: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
}

describe('client DTOs', () => {
  it('carries the balance for a caller allowed to see it', () => {
    expect(makeClient().toPublicDTO().balance).toBe(1450.5);
  });

  it('drops the balance for a caller who is not', () => {
    const dto = makeClient().toDebtFreeDTO();
    expect(dto.balance).toBeUndefined();
    expect(dto.hasPaperBalance).toBeUndefined();
    expect(JSON.stringify(dto)).not.toContain('1450.5');
  });

  it('still carries what an order needs', () => {
    const dto = makeClient().toDebtFreeDTO();
    expect(dto.fullName).toBe('Slim Ben Ali');
    expect(dto.phone).toBe('+21620000000');
  });
});
