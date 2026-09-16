import multer from 'multer';

// Shared across all manual upload routes — same limits everywhere, one config to change.
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
