import { CreateClientSchema, UpdateClientSchema } from '../src/schemas/client.schema';
import { ClientEntity } from '../src/entities/ClientEntity';
import { OrderEntity } from '../src/entities/OrderEntity';
import { ClientRepository } from '../src/repositories/ClientRepository';
import { Repository } from '../src/repositories/Repository';
import { UpdateBuilder } from '../src/repositories/builder/UpdateBuilder';
import { DataType, OrderStatus, PaymentMethod } from '@libs/enums';

/**
 * Attaching an address must not erase the client's name.
 *
 * A client written down at the counter during the create-order flow has no
 * address yet, so the flow saves him and then patches him to attach the one
 * he just gave. That request carries the addresses and nothing else — but the
 * schema folded firstName and lastName into a `fullName` key on every parse,
 * so a request that said nothing about the name still arrived carrying
 * `fullName: undefined`.
 *
 * Downstream that reads as "clear it": `BaseEntity.set()` marks any key it is
 * handed as dirty, and `UpdateBuilder` turns an undefined into a REMOVE. The
 * name was deleted from the record, the order that followed copied the empty
 * name onto itself, and the invoice, the delivery note and the proforma all
 * printed "-" where the client belonged.
 *
 * A client picked from the list already had an address, so no patch went out
 * and his name survived. That is why this only ever happened to a client
 * created on the spot.
 */

const CLIENT_ID = '0f0d4c2e-6a1b-4f3c-9d21-7b5e8a4c1d33';

/** The record as it comes back from DynamoDB, before anything touches it. */
const stored = () =>
  new ClientEntity({
    id: DataType.CLIENT,
    sk: `${DataType.CLIENT}#${CLIENT_ID}`,
    dataType: DataType.CLIENT,
    fullName: 'Abd Elkhalk Salhi',
    phone: '+21697285520',
    addresses: [],
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
  });

/** The body the create-order flow sends to attach the delivery address. */
const attachAddress = { addresses: [{ street: 'Route de Gafsa, en face de la mosquée' }] };

function capture() {
  const sent: any[] = [];
  const client = {
    send: async (command: any) => {
      sent.push(command.input);
      return { Attributes: {} };
    },
  } as any;

  return { sent, client };
}

describe('patching a client who was just created', () => {
  it('says nothing about the name when the request said nothing about it', () => {
    const parsed = UpdateClientSchema.parse(attachAddress) as Record<string, unknown>;

    expect('fullName' in parsed).toBe(false);
  });

  it('leaves the stored name in place', () => {
    const entity = stored();
    entity.set(UpdateClientSchema.parse(attachAddress) as never);

    expect(entity.fullName).toBe('Abd Elkhalk Salhi');
    expect('fullName' in (entity.getDirty() as Record<string, unknown>)).toBe(false);
  });

  it('keeps the name in the search key, so he is still findable', () => {
    const entity = stored();
    entity.set(UpdateClientSchema.parse(attachAddress) as never);

    expect(entity.getDirty().searchKey).toContain('salhi');
  });

  it('sends no REMOVE to DynamoDB', async () => {
    const { sent, client } = capture();
    const entity = stored();
    entity.set(UpdateClientSchema.parse(attachAddress) as never);

    await new UpdateBuilder(client, 'clients', entity.getKey())
      .setMany(entity.getDirty())
      .execute();

    const { UpdateExpression, ExpressionAttributeNames } = sent[0];

    expect(UpdateExpression).not.toContain('REMOVE');
    expect(Object.values(ExpressionAttributeNames)).not.toContain('fullName');
  });
});

describe('the name itself', () => {
  it('is still taken when it is sent', () => {
    const parsed = UpdateClientSchema.parse({ fullName: '  Ste Tech de Bat  ' });

    expect(parsed.fullName).toBe('Ste Tech de Bat');
  });

  it('is still folded from the two fields the shop website posts', () => {
    const parsed = UpdateClientSchema.parse({ firstName: 'Mohamed', lastName: 'Trabelsi' });

    expect(parsed.fullName).toBe('Mohamed Trabelsi');
  });

  it('is not stored as whitespace when that is all that was sent', () => {
    const parsed = UpdateClientSchema.parse({ fullName: '   ' }) as Record<string, unknown>;

    expect('fullName' in parsed).toBe(false);
  });

  it('is still required to create a client', () => {
    expect(CreateClientSchema.safeParse({ phone: '97285520', addresses: [] }).success).toBe(false);
  });
});

/**
 * A DynamoDB that applies what it is handed, rather than only recording it.
 *
 * Asserting on the update expression proves what was sent. Applying it proves
 * what the record holds afterwards, which is what the order copies its client
 * name from and what the invoice ends up printing.
 */
function fakeTable() {
  const items = new Map<string, Record<string, any>>();
  const at = (key: Record<string, any>) => `${key.id}|${key.sk}`;

  const send = async (command: any) => {
    const input = command.input;

    if (command.constructor.name === 'PutCommand') {
      items.set(at(input.Item), { ...input.Item });
      return {};
    }

    if (command.constructor.name === 'GetCommand') {
      const item = items.get(at(input.Key));
      return { Item: item ? { ...item } : undefined };
    }

    if (command.constructor.name === 'UpdateCommand') {
      const item = { ...(items.get(at(input.Key)) ?? input.Key) };
      const names: Record<string, string> = input.ExpressionAttributeNames ?? {};
      const values: Record<string, any> = input.ExpressionAttributeValues ?? {};

      const sets = /SET (.*?)(?: REMOVE |$)/.exec(input.UpdateExpression)?.[1];
      const removes = / ?REMOVE (.*)$/.exec(input.UpdateExpression)?.[1];

      for (const clause of sets?.split(', ') ?? []) {
        const [namePlaceholder, valuePlaceholder] = clause.split(' = ');
        item[names[namePlaceholder]] = values[valuePlaceholder];
      }
      for (const namePlaceholder of removes?.split(', ') ?? []) {
        delete item[names[namePlaceholder.trim()]];
      }

      items.set(at(input.Key), item);
      return { Attributes: { ...item } };
    }

    throw new Error(`fakeTable: unhandled ${command.constructor.name}`);
  };

  return { items, client: { send } as any };
}

/**
 * The three calls the create-order flow makes for a client written down at the
 * counter, in the order it makes them. This is the sequence that used to lose
 * the name, so it is walked here whole rather than a piece at a time.
 */
describe('creating a client from inside the create-order flow', () => {
  const NAME = 'Abd Elkhalk Salhi';
  const SK = `${DataType.CLIENT}#${CLIENT_ID}`;

  let repository: ClientRepository;

  beforeEach(() => {
    (Repository as any).documentClient = fakeTable().client;
    repository = new ClientRepository();
  });

  afterEach(() => {
    (Repository as any).documentClient = undefined;
  });

  it('still knows his name by the time the invoice is printed', async () => {
    // 1. POST /clients — the counter writes him down.
    const body = CreateClientSchema.parse({ fullName: NAME, phone: '97285520' });
    await repository.create(
      new ClientEntity({
        id: DataType.CLIENT,
        sk: SK,
        dataType: DataType.CLIENT,
        ...body,
        createdAt: '2026-08-29T09:00:00.000Z',
        updatedAt: '2026-08-29T09:00:00.000Z',
      }),
    );

    // 2. PATCH /clients/{id} — he has no saved address, so the flow attaches
    //    the one he just gave. This is the call that erased the name.
    const found = (await repository.findByUuid(CLIENT_ID))!;
    found.set(UpdateClientSchema.parse(attachAddress) as never);
    await repository.update(found);

    // 3. POST /orders — the use case reads him back and copies the name.
    const reread = (await repository.findByUuid(CLIENT_ID))!;
    expect(reread.fullName).toBe(NAME);
    expect(reread.addresses).toHaveLength(1);

    const order = new OrderEntity({
      id: DataType.ORDER,
      sk: `${DataType.ORDER}#2b1f6c88-3d4a-4e7b-9c15-8a6d2f0e4b77`,
      dataType: DataType.ORDER,
      orderNumber: 88,
      clientId: CLIENT_ID,
      clientName: reread.fullName,
      customerId: CLIENT_ID,
      status: OrderStatus.PENDING,
      items: [],
      subtotal: 0,
      tax: 0,
      timber: 1,
      transport: 0,
      total: 1,
      shippingAddress: reread.addresses[0],
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
      createdAt: '2026-08-29T09:05:00.000Z',
      updatedAt: '2026-08-29T09:05:00.000Z',
    });

    // What the PDF renderer is handed. It prints `clientName || '-'`.
    expect(order.toPublicDTO().clientName).toBe(NAME);
    // And he is still findable by name, which the wipe also took away.
    expect(reread.valueOf().searchKey).toContain('salhi');
  });

  it('keeps the name through several address edits, not just the first', async () => {
    await repository.create(
      new ClientEntity({
        id: DataType.CLIENT,
        sk: SK,
        dataType: DataType.CLIENT,
        ...CreateClientSchema.parse({ fullName: NAME }),
        createdAt: '2026-08-29T09:00:00.000Z',
        updatedAt: '2026-08-29T09:00:00.000Z',
      }),
    );

    for (const street of ['Feriana', 'Route de Gafsa', 'Chantier Foussana']) {
      const found = (await repository.findByUuid(CLIENT_ID))!;
      found.set(
        UpdateClientSchema.parse({
          addresses: [...(found.addresses ?? []), { street }],
        }) as never,
      );
      await repository.update(found);
    }

    const reread = (await repository.findByUuid(CLIENT_ID))!;
    expect(reread.fullName).toBe(NAME);
    expect(reread.addresses).toHaveLength(3);
  });
});
