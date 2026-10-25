import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import type { Config } from './config';
export class MediaStore {
  client: S3Client;
  constructor(private config: Config) {
    this.client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY,
        secretAccessKey: config.S3_SECRET_KEY,
      },
    });
  }
  async ensureBucket() {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.config.S3_BUCKET }),
      );
    } catch (error: any) {
      if (error?.$metadata?.httpStatusCode !== 404) throw error;
      await this.client.send(
        new CreateBucketCommand({ Bucket: this.config.S3_BUCKET }),
      );
    }
  }
  async put(key: string, bytes: Uint8Array, mimeType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: mimeType,
      }),
    );
    return {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      byteLength: bytes.byteLength,
    };
  }
  async get(key: string) {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }),
    );
    if (!response.Body) throw new Error('Media body is unavailable');
    return new Uint8Array(await response.Body.transformToByteArray());
  }
  async head(key: string) {
    return this.client.send(
      new HeadObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }),
    );
  }
  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }),
    );
  }
  async access(key: string) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }),
      { expiresIn: 300 },
    );
  }
}
