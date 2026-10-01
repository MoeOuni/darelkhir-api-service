import { DataType } from '@libs/enums';
import { getConfig } from '@libs/config';
import { GSI_RESOURCE_CREATED } from '@libs/constants';
import { Repository } from './Repository';
import { ClientEntity } from '@/entities/ClientEntity';
import { PaginatedResult } from './builder/types';
import { normaliseForSearch } from '@libs/search-key';

export class ClientRepository extends Repository<ClientEntity> {
  protected dataType = DataType.CLIENT;
  protected tableName = getConfig().clientsTableName;

  protected getEntity(attr: Record<string, any>): ClientEntity {
    return new ClientEntity(attr);
  }

  async findBySub(sub: string): Promise<ClientEntity | null> {
    return this.findById(DataType.CLIENT, `${DataType.CLIENT}#${sub}`);
  }

  async findByUuid(uuid: string): Promise<ClientEntity | null> {
    return this.findBySub(uuid);
  }

  async deleteBySub(sub: string): Promise<void> {
    return this.delete(DataType.CLIENT, `${DataType.CLIENT}#${sub}`);
  }

  async deleteByUuid(uuid: string): Promise<void> {
    return this.deleteBySub(uuid);
  }

  /**
   * Finds clients by anything written about them.
   *
   * Every word typed has to appear somewhere in the record, in any order:
   * "salhi abd" finds "Abd Elkhalk Salhi", and so does "abd salhi" — a single
   * `contains` over the whole phrase found neither, because those letters are
   * never next to each other.
   *
   * The whole partition is read and filtered here rather than in DynamoDB. A
   * filter there applies AFTER the page is read, so asking for twenty rows and
   * filtering them returned nothing at all when the match sat at row fifty —
   * the shop has a few hundred clients, and reading them costs less than the
   * bug did.
   */
  private async search(
    search: string,
    limit: number,
    asc: boolean
  ): Promise<PaginatedResult<ClientEntity>> {
    const terms = normaliseForSearch(search).split(' ').filter(Boolean);

    const all: Record<string, any>[] = [];
    let cursor: string | undefined;

    do {
      const q = this.builder().query().query('id', '=', DataType.CLIENT).setLimit(200);
      if (!asc) q.orderReverse();
      const page = await q.setCursor(cursor).execute();
      all.push(...page.items);
      cursor = page.cursor;
    } while (cursor);

    const matches = all.filter((item) => {
      const haystack = normaliseForSearch(String(item.searchKey ?? ''));
      return terms.every((term) => haystack.includes(term));
    });

    return {
      items: matches.slice(0, limit).map((i) => this.getEntity(i)),
      cursor: undefined,
      count: matches.length,
    };
  }

  async listAll(
    cursor?: string,
    limit = 20,
    search?: string,
    sort?: 'date_asc' | 'date_desc'
  ): Promise<PaginatedResult<ClientEntity>> {
    const asc = sort === 'date_asc';

    if (search) return this.search(search, limit, asc);

    // No filters: use gsi-resource-created for true chronological order (HASH=id, RANGE=sihk=createdAt)
    const q = this.builder().query().setIndex(GSI_RESOURCE_CREATED)
      .query('id', '=', DataType.CLIENT)
      .setCursor(cursor).setLimit(limit);
    if (!asc) q.orderReverse();
    const result = await q.execute();
    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }
}
