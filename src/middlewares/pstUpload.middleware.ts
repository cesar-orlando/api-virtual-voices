import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Crear directorio para PST
const uploadDir = path.join(process.cwd(), 'uploads', 'pst');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configurar multer para PST
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const company = req.params.c_name || 'default';
    const timestamp = Date.now();
    cb(null, `${company}_${timestamp}.pst`);
  }
});

const fileFilter = (req: any, file: any, cb: any) => {
  if (file.originalname.toLowerCase().endsWith('.pst')) {
    cb(null, true);
  } else {
    cb(new Error('Only PST files allowed'), false);
  }
};

export const pstUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 1024 * 1024 * 1024 // 1GB
  }
});