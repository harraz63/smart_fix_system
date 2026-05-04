import multer from 'multer';
import cloudinary from '../config/cloudinary';

// multer-storage-cloudinary lacks complete type declarations;
// we use require() to bypass the type constraint mismatch.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CloudinaryStorage } = require('multer-storage-cloudinary') as {
  CloudinaryStorage: new (opts: {
    cloudinary: unknown;
    params: Record<string, unknown>;
  }) => multer.StorageEngine;
};

const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'smartfix/avatars',
    allowed_formats: ['jpeg', 'jpg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill' }],
  },
});

const chatStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'smartfix/chat',
    allowed_formats: ['jpeg', 'jpg', 'png', 'pdf', 'webp'],
    resource_type: 'auto',
  },
});

const documentStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'smartfix/documents',
    allowed_formats: ['jpeg', 'jpg', 'png', 'pdf'],
    resource_type: 'auto',
  },
});

const MB = 1024 * 1024;

export const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * MB },
}).single('avatar');

export const uploadChatAttachment = multer({
  storage: chatStorage,
  limits: { fileSize: 10 * MB },
}).single('file');

export const uploadDocument = multer({
  storage: documentStorage,
  limits: { fileSize: 10 * MB },
}).single('document');
