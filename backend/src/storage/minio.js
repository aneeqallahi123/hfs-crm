import * as Minio from 'minio';

const BUCKET = process.env.MINIO_BUCKET;

// Reused across calls: MinIO sits behind a Cloudflare Tunnel, so a fresh Client
// per call would mean a new TLS handshake (and a repeated bucket-region lookup,
// which the SDK otherwise caches on the client instance) on every operation.
let client = null;

function getClient() {
  if (!process.env.MINIO_ENDPOINT) throw new Error('MinIO not configured');
  if (!client) {
    client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT,
      port: parseInt(process.env.MINIO_PORT) || 443,
      useSSL: process.env.MINIO_USE_SSL !== 'false',
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
    });
  }
  return client;
}

// Exported for routes that call putObject directly
export const minioClient = {
  putObject: (...args) => getClient().putObject(...args),
  removeObject: (...args) => getClient().removeObject(...args),
  bucketExists: (...args) => getClient().bucketExists(...args),
  makeBucket: (...args) => getClient().makeBucket(...args),
  presignedGetObject: (...args) => getClient().presignedGetObject(...args),
  statObject: (...args) => getClient().statObject(...args),
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

// `filename` makes MinIO send a Content-Disposition on the presigned response, so a
// browser sent straight to the object still saves it under its original name.
export async function getPresignedUrl(key, filename, contentType) {
  const reqParams = {};
  if (filename) {
    reqParams['response-content-disposition'] = `inline; filename="${filename.replace(/"/g, '')}"`;
  }
  if (contentType) reqParams['response-content-type'] = contentType;
  return getClient().presignedGetObject(BUCKET, key, 3600, reqParams);
}

// Returns { size, metaData, ... } for an object, or throws if it does not exist.
// Used by the inbound webhook to confirm Evolution API really wrote the media
// before a row claiming it exists is inserted.
export async function statFile(key) {
  return getClient().statObject(BUCKET, key);
}

export async function deleteFile(key) {
  await getClient().removeObject(BUCKET, key);
}

export async function streamFile(key) {
  return getClient().getObject(BUCKET, key);
}
