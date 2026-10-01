import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '@libs/config';
import { ProductRepository } from '@/repositories/ProductRepository';
import { NotFoundError } from '@libs/errors';

const s3 = new S3Client({});

interface UploadUrlResult {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

export class GetImageUploadUrlUseCase {
  constructor(private repository: ProductRepository) {}

  async execute(productId: string): Promise<UploadUrlResult> {
    const product = await this.repository.findByUuid(productId);
    if (!product) throw new NotFoundError('Product not found');

    const config = getConfig();
    const key = `uploads/${productId}/${uuidv4()}-raw`;

    const command = new PutObjectCommand({
      Bucket: config.s3BucketName,
      Key: key,
      ContentType: 'image/jpeg',
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    return { uploadUrl, key, expiresIn: 300 };
  }
}
