import { DataType } from '@libs/enums';
import { getConfig } from '@libs/config';
import { Repository } from './Repository';
import { SettingsEntity } from '@/entities/SettingsEntity';

/** The settings record is a singleton, always at this key. */
const SETTINGS_SK = `${DataType.SETTINGS}#business`;

export class SettingsRepository extends Repository<SettingsEntity> {
  protected dataType = DataType.SETTINGS;
  protected tableName = getConfig().settingsTableName;

  protected getEntity(attr: Record<string, any>): SettingsEntity {
    return new SettingsEntity(attr);
  }

  async get(): Promise<SettingsEntity | null> {
    return this.findById(DataType.SETTINGS, SETTINGS_SK);
  }
}
