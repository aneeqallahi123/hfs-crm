// minio v8 is required, not merely preferred: v7 signs object paths containing "@" in a way
// this MinIO rejects, and Evolution API writes every inbound WhatsApp file under a key holding
// the group JID (…/120363…@g.us/…). On v7 those objects list fine and serve fine via presigned
// URL, but every statObject/getObject/removeObject on them fails 403.
import * as Minio from 'minio';
import { createRequire } from 'module';

// Reported at startup and on lookup failures. v7 vs v8 changes how object paths are signed,
// and a cached Docker layer can silently keep an old version installed despite package.json,
// so the running version is worth stating rather than assuming.
export const MINIO_SDK_VERSION = (() => {
  try {
    return createRequire(import.meta.url)('minio/package.json').version;
  } catch {
    return 'unknown';
  }
})();

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
};

export async function ensureBucket() {
  if (!process.env.MINIO_ENDPOINT) return; // skip if not configured
  const client = getClient();
  const exists = await client.bucketExists(BUCKET);
  if (!exists) await client.makeBucket(BUCKET);
}

// All CRM object keys are plain ASCII by construction. That is load-bearing, not cosmetic:
// keys containing "@", spaces or non-ASCII (which is how Evolution names every inbound file)
// fail intermittently on per-object calls depending on which Cloudflare edge the request lands
// on. Everything we store gets a key shaped like this one, whatever the file was called.
export function buildObjectKey(prefixId, originalName) {
  const ext = String(originalName || '').split('.').pop();
  const safeExt = ext && ext !== originalName ? `.${ext.replace(/[^A-Za-z0-9]/g, '').slice(0, 10)}` : '';
  return `${prefixId}/${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt}`;
}

export async function uploadFile(engagementId, originalName, buffer, mimeType) {
  const key = buildObjectKey(engagementId, originalName);
  await getClient().putObject(BUCKET, key, buffer, buffer.length, { 'Content-Type': mimeType });
  return key;
}

// Server-side copy within the bucket. The source key travels in the x-amz-copy-source HEADER
// rather than the URL path, which is why this works for keys that direct GET/HEAD cannot
// reach. MinIO copies internally, so no bytes cross the network regardless of file size.
export async function copyFile(destKey, sourceKey) {
  return getClient().copyObject(BUCKET, destKey, `/${BUCKET}/${sourceKey}`);
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

// Size via a prefix listing rather than statObject. HEAD on an individual object has proven
// unreliable through the Cloudflare tunnel — it fails outright on some edges, and where it
// succeeds the size comes from content-length, which Cloudflare rewrites for compressible
// types (yielding NaN). Listing uses query-string auth and has been consistent on every route
// and key shape. Returns null if the object is not found.
export async function getObjectSize(key) {
  const client = getClient();
  return new Promise((resolve, reject) => {
    let size = null;
    const stream = client.listObjectsV2(BUCKET, key, false);
    stream.on('data', (obj) => { if (obj?.name === key) size = obj.size; });
    stream.on('error', reject);
    stream.on('end', () => resolve(size));
  });
}

export async function deleteFile(key) {
  await getClient().removeObject(BUCKET, key);
}

export async function streamFile(key) {
  return getClient().getObject(BUCKET, key);
}
