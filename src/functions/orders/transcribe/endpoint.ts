import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { TranscribeSchema } from '@/schemas/order.schema';
import { transcribe } from '@libs/speech';

const transcribeHandler = async (event: ExtendedEvent, _context: Context) => {
  try {
    const audio = Buffer.from(event.body.audio, 'base64');
    const text = await transcribe(audio, event.body.mime ?? 'audio/m4a');

    if (!text) {
      return { statusCode: 200, body: JSON.stringify({ message: 'Nothing heard', data: { text: '' } }) };
    }
    return { statusCode: 200, body: JSON.stringify({ message: 'Heard', data: { text } }) };
  } catch (err) {
    console.error(
      JSON.stringify({ level: 'ERROR', message: 'Transcription failed', err: String(err) })
    );
    return { statusCode: 502, body: JSON.stringify({ message: "L'enregistrement n'a pas pu être lu." }) };
  }
};

// Reads nothing and writes nothing: it only turns sound into words. The
// permission is here because each call costs money.
export const handler = middleware({
  auth: true,
  cors: true,
  requires: 'orders.create',
  validation: { body: TranscribeSchema },
})(transcribeHandler);
