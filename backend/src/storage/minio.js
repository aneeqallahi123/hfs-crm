import * as Minio from 'minio';

const BUCKET = process.env.MINIO_BUCKET;

function getClient() {
  if (!process.env.MINIO_ENDPOINT) throw new Error('MinIO not configured');
  return new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT,
    port: parseInt(process.env.MINIO_PORT) || 443,
    useSSL: process.env.MINIO_USE_SSL !== 'false',
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
  });
}

// Exported for routes that call putObject directly
export const minioClient = {
  putObject: (...args) => getClient().putObject(...args),
  removeObject: (...args) => getClient().removeObject(...args),
  bucketExists: (...args) => getClient().bucketExists(...args),
  makeBucket: (...args) => getClient().makeBucket(...args),
  presignedGetObject: (...args) => getClient().presignedGetObject(...args),
};

export async function ensureBucket() {
  if (!process.env.MINIO_ENDPOINT) return; // skip if not configured
  const client = getClient();
  const exists = await client.bucketExists(BUCKET);
  if (!exists) await client.makeBucket(BUCKET);
}

export async function uploadFile(engagementId, originalName, buffer, mimeType) {
  const ext = originalName.split('.').pop();
  const key = `${engagementId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  await getClient().putObject(BUCKET, key, buffer, buffer.length, { 'Content-Type': mimeType });
  return key;
}

export async function getPresignedUrl(key) {
  return getClient().presignedGetObject(BUCKET, key, 3600);
}

export async function deleteFile(key) {
  await getClient().removeObject(BUCKET, key);
}
