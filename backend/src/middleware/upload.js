import multer from 'multer';

// Shared across all upload routes — same limits everywhere, one config to change.
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
