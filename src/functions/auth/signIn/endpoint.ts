import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { SignInSchema } from '@/schemas/auth.schema';
import { signInHandler } from './useCase';

export const handler = middleware({
  cors: true,
  validation: { body: SignInSchema },
})(signInHandler);
