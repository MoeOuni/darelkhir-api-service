import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { SpeakSchema } from '@/schemas/order.schema';
import { speak } from '@libs/speech';

const speakHandler = async (event: ExtendedEvent, _context: Context) => {
  try {
    const spoken = await speak(event.body.text, event.body.voice);
    return { statusCode: 200, body: JSON.stringify({ message: 'Spoken', data: spoken }) };
  } catch (err) {
    // Losing the voice is not losing the answer: the reply is already on the
    // screen, so this fails quietly enough for the shop to carry on reading it.
    console.error(
      JSON.stringify({ level: 'ERROR', message: 'Speech failed', err: String(err) })
    );
    return { statusCode: 502, body: JSON.stringify({ message: 'Speech unavailable' }) };
  }
};

// Reads nothing and writes nothing — it only turns a sentence into sound. The
// permission is here because each call costs money, not because it touches data.
export const handler = middleware({
  auth: true,
  cors: true,
  requires: 'orders.create',
  validation: { body: SpeakSchema },
})(speakHandler);
