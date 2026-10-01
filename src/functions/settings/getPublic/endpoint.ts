import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { SettingsRepository } from '@/repositories/SettingsRepository';
import { SettingsEntity } from '@/entities/SettingsEntity';
import { DEFAULT_SETTINGS } from '@libs/settings';
import { DataType } from '@libs/enums';

/**
 * Contact details for the storefront. No token needed.
 *
 * Only the fields a customer is meant to see: bank details and internal
 * thresholds are not part of this response.
 */
const getPublicSettingsHandler = async (_event: ExtendedEvent, _context: Context) => {
  const entity = await new SettingsRepository().get();
  const source =
    entity ??
    new SettingsEntity({
      id: DataType.SETTINGS,
      sk: `${DataType.SETTINGS}#business`,
      dataType: DataType.SETTINGS,
      ...DEFAULT_SETTINGS,
      createdAt: '',
      updatedAt: '',
    });

  return {
    statusCode: 200,
    headers: { 'Cache-Control': 'public, max-age=300' },
    body: JSON.stringify({
      message: 'Settings retrieved successfully',
      data: source.toStorefrontDTO(),
    }),
  };
};

export const handler = middleware({
  cors: true,
})(getPublicSettingsHandler);
