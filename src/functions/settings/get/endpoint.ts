import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { SettingsRepository } from '@/repositories/SettingsRepository';
import { DEFAULT_SETTINGS } from '@libs/settings';

/**
 * Staff read of the whole settings record.
 *
 * Returns the defaults when nothing is saved yet, so the settings form always
 * opens with the values the system is actually using.
 */
const getSettingsHandler = async (_event: ExtendedEvent, _context: Context) => {
  const entity = await new SettingsRepository().get();
  const data = entity ? { ...DEFAULT_SETTINGS, ...entity.toPublicDTO() } : { ...DEFAULT_SETTINGS };

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Settings retrieved successfully', data }),
  };
};

export const handler = middleware({
  auth: true,
  cors: true,
})(getSettingsHandler);
