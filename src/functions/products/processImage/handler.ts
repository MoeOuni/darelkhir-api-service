import { S3Event } from 'aws-lambda';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '@libs/config';
import { ProductRepository } from '@/repositories/ProductRepository';

const s3 = new S3Client({});

export const handler = async (event: S3Event): Promise<void> => {
  const config = getConfig();
  const repository = new ProductRepository();

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const rawKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    // Key format: uploads/{productId}/{uuid}-raw
    const parts = rawKey.split('/');
    if (parts.length !== 3 || parts[0] !== 'uploads') {
      console.warn('Unexpected key format, skipping:', rawKey);
      continue;
    }
    const productId = parts[1];

    try {
      // 1. Download original
      const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: rawKey }));
      const buffer = Buffer.from(await Body!.transformToByteArray());

      // 2. Resize to max 1080x1080 (single pass, preserve aspect ratio, never upscale)
      const resized = await sharp(buffer)
        .resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })
        .toBuffer();

      // 3. Generate output keys
      const imageUuid = uuidv4();
      const jpgKey = `images/${imageUuid}.jpg`;
      const webpKey = `images/${imageUuid}.webp`;

      // 4. Upload JPEG + WebP in parallel
      await Promise.all([
        sharp(resized)
          .jpeg({ quality: 85, progressive: true })
          .toBuffer()
          .then((buf) =>
            s3.send(new PutObjectCommand({ Bucket: bucket, Key: jpgKey, Body: buf, ContentType: 'image/jpeg' }))
          ),
        sharp(resized)
          .webp({ quality: 80 })
          .toBuffer()
          .then((buf) =>
            s3.send(new PutObjectCommand({ Bucket: bucket, Key: webpKey, Body: buf, ContentType: 'image/webp' }))
          ),
      ]);

      // 5. Delete the temp raw file
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: rawKey }));

      // 6. Update the product record
      const baseUrl = `https://${config.s3BucketName}.s3.${config.region}.amazonaws.com`;
      await repository.updateImageUrls(productId, `${baseUrl}/${jpgKey}`, `${baseUrl}/${webpKey}`);

      console.log('Processed image for product', productId, '->', jpgKey);
    } catch (err) {
      console.error('Error processing image for product', productId, JSON.stringify(err, Object.getOwnPropertyNames(err as any)));
      throw err;
    }
  }
};
