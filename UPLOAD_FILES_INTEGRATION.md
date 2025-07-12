# 🔹 INTEGRACIÓN DE SUBIDA DE ARCHIVOS - VIRTUAL VOICES

## 📋 Resumen
Se ha implementado la funcionalidad de subida de archivos a AWS S3 para el sistema Virtual Voices, similar a la implementación de Quick Learning.

## 🚀 Endpoints Disponibles

### 1. Subir Archivo
```
POST /api/upload
Content-Type: multipart/form-data

Body:
- file: [archivo]
```

**Respuesta:**
```json
{
  "url": "https://bucket.s3.amazonaws.com/1234567890-archivo.pdf",
  "key": "1234567890-archivo.pdf"
}
```

### 2. Generar URL de Previsualización
```
GET /api/upload/preview/:key
```

**Respuesta:**
```json
{
  "url": "https://bucket.s3.amazonaws.com/1234567890-archivo.pdf?signature=..."
}
```

## ⚙️ Configuración Requerida

### Variables de Entorno
Agregar al archivo `.env`:

```env
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_REGION=us-east-1
AWS_BUCKET_NAME=your-bucket-name
```

### Dependencias Instaladas
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner multer multer-s3 @types/multer
```

## 📁 Archivos Creados

### Backend
- `src/config/aws.ts` - Configuración de AWS S3
- `src/middlewares/upload.middleware.ts` - Middleware de multer para S3
- `src/routes/upload.routes.ts` - Rutas de subida
- `src/controllers/upload.controller.ts` - Controladores de subida
- `src/utils/validateFileType.ts` - Utilidades de validación
- `src/types/multer.d.ts` - Tipos TypeScript para multer-s3

### Configuración
- `aws.env.example` - Ejemplo de variables de entorno

## 🔧 Integración con Frontend

### 1. Función de Subida
```typescript
const uploadFileToS3 = async (file: File): Promise<string | null> => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      return data.url;
    }
    
    return null;
  } catch (error) {
    console.error('Error uploading file:', error);
    return null;
  }
};
```

### 2. Validación de Tipos
```typescript
const isValidFileType = (file: File): boolean => {
  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];

  return allowedTypes.includes(file.type);
};
```

### 3. Componente FileDropzone (React)
```typescript
import { useState } from "react";
import { useDropzone } from "react-dropzone";

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
}

const FileDropzone = ({ value, onChange }: Props) => {
  const handleFiles = async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      const url = await uploadFileToS3(file);
      if (url) {
        onChange([...value, url]);
      }
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: handleFiles,
    accept: {
      "application/pdf": [],
      "image/jpeg": [],
      "image/png": [],
      // ... otros tipos
    },
  });

  return (
    <div {...getRootProps()}>
      <input {...getInputProps()} />
      <p>Arrastra archivos o haz clic para subir</p>
    </div>
  );
};
```

## 🎯 Uso en RecordEditModal

### 1. Agregar Campo de Tipo "file"
```typescript
const editingFields = [
  {
    key: "documentos",
    label: "Documentos",
    type: "file",
    value: [],
    options: [],
    visible: true,
  },
  // ... otros campos
];
```

### 2. Renderizar FileDropzone
```typescript
if (field.type === "file") {
  return (
    <Box key={field.key} sx={{ mt: 2 }}>
      <Typography variant="body2" sx={{ mb: 1 }}>
        {field.label}
      </Typography>
      <FileDropzone
        value={Array.isArray(field.value) ? field.value : []}
        onChange={(urls) => handleChange(field.key, urls)}
      />
    </Box>
  );
}
```

## 📊 Tipos de Archivo Soportados

- **Imágenes**: JPEG, PNG, WebP
- **Documentos**: PDF, Word (.doc, .docx)
- **Hojas de cálculo**: Excel (.xls, .xlsx)
- **Presentaciones**: PowerPoint (.ppt, .pptx)

## 🔒 Límites y Seguridad

- **Tamaño máximo**: 10MB por archivo
- **Tipos permitidos**: Solo los especificados en la lista
- **Acceso**: Archivos públicos en S3
- **URLs firmadas**: Para previsualización (1 hora de expiración)

## 🚨 Manejo de Errores

### Backend
- Validación de tipos de archivo
- Límites de tamaño
- Manejo de errores de S3
- Logs detallados de errores

### Frontend
- Validación antes de subir
- Indicadores de progreso
- Mensajes de error amigables
- Rollback en caso de fallo

## 🔄 Flujo de Trabajo

1. **Usuario selecciona archivo** → Validación en frontend
2. **Subida a S3** → Middleware multer-s3
3. **Respuesta con URL** → Almacenamiento en registro
4. **Previsualización** → URL firmada de S3
5. **Eliminación** → Actualización del array de URLs

## 📝 Notas Importantes

- Los archivos se almacenan con nombres únicos (timestamp + nombre original)
- Las URLs de S3 son públicas para acceso directo
- Las URLs de previsualización son firmadas y temporales
- El sistema soporta múltiples archivos por campo
- La validación se realiza tanto en frontend como backend 