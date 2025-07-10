// src/middlewares/upload.middleware.ts
import multer from 'multer';
import multerS3 from 'multer-s3';
import dotenv from 'dotenv';
import { s3 } from '../config/aws';

dotenv.config();

const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_BUCKET_NAME!,
    // @ts-ignore
    contentType: (multerS3 as any).AUTO_CONTENT_TYPE,
    contentDisposition: 'inline',
    key: (req, file, cb) => {
      const filename = `${Date.now()}-${file.originalname}`;
      cb(null, `uploads/${filename}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export default upload; 