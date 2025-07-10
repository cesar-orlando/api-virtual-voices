// src/routes/upload.routes.ts
import express from 'express';
import upload from '../middlewares/upload.middleware';
import { uploadFile, generatePreviewUrl } from '../controllers/upload.controller';

const router = express.Router();

// 🔹 Subir archivo
router.post('/', upload.single('file'), uploadFile);

// 🔹 Obtener previsualización de archivo
router.get('/preview/:key', generatePreviewUrl);

export default router; 