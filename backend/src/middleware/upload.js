import multer from 'multer';

const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_MB || '200', 10) * 1024 * 1024;

// Shared across all upload routes — same limits everywhere, one config to change.
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });
