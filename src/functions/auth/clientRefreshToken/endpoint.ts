import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { RefreshTokenSchema } from '@/schemas/auth.schema';
import { clientRefreshTokenHandler } from './useCase';

export const handler = middleware({
  cors: true,
  validation: { body: RefreshTokenSchema },
})(clientRefreshTokenHandler);
