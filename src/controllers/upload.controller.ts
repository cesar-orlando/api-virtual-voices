// src/controllers/upload.controller.ts
import { Request, Response } from 'express';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
import { s3 } from '../config/aws';

dotenv.config();

// 🔹 Subir archivo
export const uploadFile = (req: Request, res: Response): void => {
  if (!req.file) {
    console.error("❌ No se subió ningún archivo.");
    res.status(400).json({ message: 'No se subió ningún archivo' });
    return;
  }

  const file = req.file as Express.Multer.File & { location: string; key: string };

  if (!file.location || !file.key) {
    console.error("❌ Archivo subido pero faltan propiedades location o key.");
    res.status(500).json({ message: 'Error en la subida del archivo' });
    return;
  }

  res.status(200).json({
    url: file.location,
    key: file.key,
  });
};

// 🔹 Generar URL para previsualizar archivo
export const generatePreviewUrl = async (req: Request, res: Response): Promise<void> => {
  const { key } = req.params;

  if (!key) {
     res.status(400).json({ message: "No se proporcionó el key del archivo." });
     return;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: decodeURIComponent(key),
      ResponseContentDisposition: "inline",
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hora
    res.json({ url: signedUrl });
  } catch (error) {
    console.error("❌ Error generando Signed URL:", error);
    res.status(500).json({ message: "Error generando URL de previsualización." });
  }
}; 