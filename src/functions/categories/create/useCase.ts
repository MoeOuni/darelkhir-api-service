import { CategoryRepository } from '@/repositories/CategoryRepository';
import { CategoryEntity } from '@/entities/CategoryEntity';
import { IdGenerator } from '@/utils/IdGenerator';
import { DataType, CategoryStatus } from '@libs/enums';
import { CreateCategoryInput } from '@/schemas/category.schema';

interface CreateCategoryResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
}

export class CreateCategoryUseCase {
  constructor(private repository: CategoryRepository) {}

  async execute(
    data: CreateCategoryInput,
    _userId: string
  ): Promise<CreateCategoryResult> {
    const uuid = IdGenerator.generate();
    const now = new Date().toISOString();

    const entity = new CategoryEntity({
      id: DataType.CATEGORY,
      sk: `${DataType.CATEGORY}#${uuid}`,
      dataType: DataType.CATEGORY,
      name: data.name,
      description: data.description,
      parentCategoryId: data.parentCategoryId,
      status: data.status ?? CategoryStatus.ACTIVE,
      imageUrl: data.imageUrl,
      createdAt: now,
      updatedAt: now,
    });

    await this.repository.create(entity);

    return {
      success: true,
      message: 'Category created successfully',
      data: { ...entity.toPublicDTO(), id: uuid },
    };
  }
}
