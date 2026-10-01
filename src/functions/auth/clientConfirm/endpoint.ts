import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { ClientConfirmSchema } from '@/schemas/auth.schema';
import { clientConfirmHandler } from './useCase';

export const handler = middleware({
  cors: true,
  validation: { body: ClientConfirmSchema },
})(clientConfirmHandler);
