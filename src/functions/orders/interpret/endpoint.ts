import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { InterpretOrderSchema } from '@/schemas/order.schema';
import { InterpretOrderUseCase } from './useCase';
import { ProductRepository } from '@/repositories/ProductRepository';
import { ClientRepository } from '@/repositories/ClientRepository';
import { TransporterRepository } from '@/repositories/TransporterRepository';

const interpretOrderHandler = async (event: ExtendedEvent, _context: Context) => {
  const useCase = new InterpretOrderUseCase(
    new ProductRepository(),
    new ClientRepository(),
    new TransporterRepository()
  );

  try {
    const result = await useCase.execute(event.body);
    if (!result.success) {
      return { statusCode: 400, body: JSON.stringify({ message: result.message }) };
    }
    return { statusCode: 200, body: JSON.stringify({ message: result.message, data: result.data }) };
  } catch (err) {
    // The sentence is not lost: the screen keeps what was typed so it can be
    // sent again or finished by hand. Saying so beats a blank form.
    console.error(
      JSON.stringify({ level: 'ERROR', message: 'Darija reading failed', err: String(err) })
    );
    return {
      statusCode: 502,
      body: JSON.stringify({ message: "La lecture n'a pas abouti. Réessayez ou saisissez la commande à la main." }),
    };
  }
};

// Reading a sentence writes nothing, so there is no audit entry: the order
// that may follow is audited by createOrder, which is where something actually
// happens. `orders.create` still gates it — this is the order screen's helper,
// not a public translation service, and it costs money per call.
export const handler = middleware({
  auth: true,
  cors: true,
  requires: 'orders.create',
  validation: { body: InterpretOrderSchema },
})(interpretOrderHandler);
