import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { UpdateSettingsSchema } from '@/schemas/settings.schema';
import { SettingsRepository } from '@/repositories/SettingsRepository';
import { SettingsEntity } from '@/entities/SettingsEntity';
import { DataType } from '@libs/enums';
import { DEFAULT_SETTINGS, invalidateSettingsCache } from '@libs/settings';

const updateSettingsHandler = async (event: ExtendedEvent, _context: Context) => {
  const repository = new SettingsRepository();
  const input = event.body as Record<string, unknown>;
  const now = new Date().toISOString();

  const existing = await repository.get();

  if (existing) {
    existing.set(input);
    await repository.update(existing);
  } else {
    // First save: seed from the defaults so no required field is left blank.
    await repository.create(
      new SettingsEntity({
        id: DataType.SETTINGS,
        sk: `${DataType.SETTINGS}#business`,
        dataType: DataType.SETTINGS,
        ...DEFAULT_SETTINGS,
        ...input,
        createdAt: now,
        updatedAt: now,
      })
    );
  }

  // Other Lambdas hold their own cache, which expires on its own. This only
  // clears the copy in this container.
  invalidateSettingsCache();

  const saved = await repository.get();

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Settings updated successfully',
      data: saved ? saved.toPublicDTO() : { ...DEFAULT_SETTINGS, ...input },
    }),
  };
};

export const handler = middleware({
  audit: { action: 'settings.update', entityType: 'settings' },
  auth: true,
  cors: true,
  validation: { body: UpdateSettingsSchema },
})(updateSettingsHandler);
