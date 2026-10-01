import { UpdateBuilder } from '../src/repositories/builder/UpdateBuilder';

/**
 * What an update actually sends to DynamoDB.
 *
 * These exist because of a live failure: recording a debt carried over from
 * the notebook for a brand-new client wrote the amount, then blew up with
 * "Invalid UpdateExpression: an expression attribute value used in expression
 * is not defined; attribute value: :val3". The client had no orders and no
 * payments, so his `lastActivityAt` was undefined — and an undefined SET
 * leaves the expression pointing at a value the document client drops, which
 * fails the WHOLE update, not just that field.
 */
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

describe('UpdateBuilder', () => {
  it('writes a normal field as a SET', async () => {
    const { sent, client } = capture();

    await new UpdateBuilder(client, 'clients', { id: 'CLIENT' }).set('balance', 1320).execute();

    expect(sent[0].UpdateExpression).toContain('SET');
    expect(Object.values(sent[0].ExpressionAttributeValues)).toEqual([1320]);
  });

  it('turns an undefined field into a REMOVE rather than a broken SET', async () => {
    const { sent, client } = capture();

    await new UpdateBuilder(client, 'clients', { id: 'CLIENT' })
      .setMany({ balance: 1320, totalPaid: 0, lastActivityAt: undefined })
      .execute();

    const { UpdateExpression, ExpressionAttributeValues } = sent[0];

    // The two real values are set, and nothing in the expression refers to a
    // value that was never defined.
    expect(Object.values(ExpressionAttributeValues)).toEqual([1320, 0]);
    expect(UpdateExpression).toMatch(/^SET .* REMOVE /);

    for (const placeholder of UpdateExpression.match(/:val\d+/g) ?? []) {
      expect(ExpressionAttributeValues).toHaveProperty(placeholder);
    }
  });

  it('still updates the other fields when every value is undefined but one', async () => {
    const { sent, client } = capture();

    await new UpdateBuilder(client, 'clients', { id: 'CLIENT' })
      .setMany({ openingBalance: 1320, openingBalanceNote: undefined })
      .execute();

    expect(Object.values(sent[0].ExpressionAttributeValues)).toEqual([1320]);
  });
});
