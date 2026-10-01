import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getConfig } from '@libs/config';
import { ProductRepository } from '@/repositories/ProductRepository';
import { NotFoundError } from '@libs/errors';

const s3 = new S3Client({});

export class DeleteProductImageUseCase {
  constructor(private repository: ProductRepository) {}

  async execute(productId: string): Promise<void> {
    const product = await this.repository.findByUuid(productId);
    if (!product) throw new NotFoundError('Product not found');

    const config = getConfig();
    const deletes: Promise<any>[] = [];

    if (product.imageUrl) {
      const key = new URL(product.imageUrl).pathname.slice(1);
      deletes.push(s3.send(new DeleteObjectCommand({ Bucket: config.s3BucketName, Key: key })));
    }
    if (product.imageUrlWebp) {
      const key = new URL(product.imageUrlWebp).pathname.slice(1);
      deletes.push(s3.send(new DeleteObjectCommand({ Bucket: config.s3BucketName, Key: key })));
    }

    await Promise.all(deletes);
    await this.repository.clearImage(productId);
  }
}
