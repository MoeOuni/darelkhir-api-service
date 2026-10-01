import { DataType } from '@libs/enums';
import { getConfig } from '@libs/config';
import { Repository } from './Repository';
import { TransporterEntity } from '@/entities/TransporterEntity';
import { PaginatedResult } from './builder/types';
import { normaliseForSearch } from '@libs/search-key';

export class TransporterRepository extends Repository<TransporterEntity> {
  protected dataType = DataType.TRANSPORTER;
  protected tableName = getConfig().transportersTableName;

  protected getEntity(attr: Record<string, any>): TransporterEntity {
    return new TransporterEntity(attr);
  }

  async findByUuid(uuid: string): Promise<TransporterEntity | null> {
    return this.findById(DataType.TRANSPORTER, `${DataType.TRANSPORTER}#${uuid}`);
  }

  async deleteByUuid(uuid: string): Promise<void> {
    return this.delete(DataType.TRANSPORTER, `${DataType.TRANSPORTER}#${uuid}`);
  }

  async listAll(
    cursor?: string,
    limit = 20,
    search?: string
  ): Promise<PaginatedResult<TransporterEntity>> {
    if (search) return this.search(search, limit);

    const result = await this.builder()
      .query()
      .query('id', '=', DataType.TRANSPORTER)
      .setCursor(cursor)
      .setLimit(limit)
      .execute();

    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }

  /**
   * Finds a driver by name, number, plate or card.
   *
   * Searched here rather than in the screen that shows them: the list arrives
   * one page at a time, so a driver added this morning sat outside the page
   * the phone was holding and could not be found at all.
   *
   * Every word typed has to appear somewhere, in any order — "250 khmiri"
   * finds Abdellah Khmiri in lorry 250 TN 8979.
   */
  private async search(
    search: string,
    limit: number
  ): Promise<PaginatedResult<TransporterEntity>> {
    const terms = normaliseForSearch(search).split(' ').filter(Boolean);

    const all: Record<string, any>[] = [];
    let cursor: string | undefined;

    do {
      const page = await this.builder()
        .query()
        .query('id', '=', DataType.TRANSPORTER)
        .setLimit(200)
        .setCursor(cursor)
        .execute();
      all.push(...page.items);
      cursor = page.cursor;
    } while (cursor);

    const matches = all.filter((item) => {
      const digits = String(item.phone ?? '').replace(/\D/g, '');
      const haystack = normaliseForSearch(
        [item.name, item.phone, digits.replace(/^216/, ''), item.secondaryPhone,
         item.vehiclePlateNumber, item.cin, item.taxId]
          .filter(Boolean)
          .join(' '),
      );
      return terms.every((term) => haystack.includes(term));
    });

    return {
      items: matches.slice(0, limit).map((i) => this.getEntity(i)),
      cursor: undefined,
      count: matches.length,
    };
  }
}
