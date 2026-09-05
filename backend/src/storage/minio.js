import * as Minio from 'minio';

export const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const BUCKET = process.env.MINIO_BUCKET;

export async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) await minioClient.makeBucket(BUCKET);
}

export async function uploadFile(engagementId, originalName, buffer, mimeType) {
  const ext = originalName.split('.').pop();
  const key = `${engagementId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  await minioClient.putObject(BUCKET, key, buffer, buffer.length, { 'Content-Type': mimeType });
  return key;
}

export async function getPresignedUrl(key) {
  return minioClient.presignedGetObject(BUCKET, key, 3600);
}

export async function deleteFile(key) {
  await minioClient.removeObject(BUCKET, key);
}
