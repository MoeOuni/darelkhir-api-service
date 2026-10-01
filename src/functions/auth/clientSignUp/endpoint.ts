import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { ClientSignUpSchema } from '@/schemas/auth.schema';
import { clientSignUpHandler } from './useCase';

export const handler = middleware({
  cors: true,
  validation: { body: ClientSignUpSchema },
})(clientSignUpHandler);
