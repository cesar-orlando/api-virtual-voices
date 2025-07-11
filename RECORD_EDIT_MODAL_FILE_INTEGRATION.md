# 🔹 INTEGRACIÓN DE CAMPOS DE ARCHIVOS EN RECORDEDITMODAL

## 📋 Resumen
Guía para integrar campos de tipo "file" en el componente RecordEditModal de Virtual Voices.

## 🎯 Implementación

### 1. Definir Campo de Tipo "file"

```typescript
const editingFields = [
  {
    key: "documentos",
    label: "Documentos",
    type: "file",
    value: [], // Array de URLs de archivos
    options: [],
    visible: true,
    format: "files" // Identificador para campos de archivos
  },
  {
    key: "fotos",
    label: "Fotos del Cliente",
    type: "file", 
    value: [],
    options: [],
    visible: true,
    format: "files"
  },
  // ... otros campos
];
```

### 2. Función de Subida de Archivos

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

### 3. Validación de Tipos de Archivo

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

### 4. Componente FileDropzone

```typescript
import { useState } from "react";
import {
  Box,
  CircularProgress,
  Typography,
  IconButton,
  Snackbar,
  Alert,
} from "@mui/material";
import { useDropzone } from "react-dropzone";
import DeleteIcon from "@mui/icons-material/Delete";

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
}

const FileDropzone = ({ value, onChange }: Props) => {
  const [uploadingFiles, setUploadingFiles] = useState<any[]>([]);
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  const handleFiles = async (acceptedFiles: File[]) => {
    const invalidFiles = acceptedFiles.filter((file) => !isValidFileType(file));
    const validFiles = acceptedFiles.filter((file) => isValidFileType(file));
  
    if (invalidFiles.length > 0) {
      const message = `❌ Estos archivos no están permitidos:\n${invalidFiles.map((f) => f.name).join("\n")}`;
      setSnackbarMessage(message);
      setOpenSnackbar(true);
    }
  
    if (validFiles.length === 0) return;
  
    const newUploading = validFiles.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      isUploading: true,
    }));
  
    setUploadingFiles((prev) => [...prev, ...newUploading]);
  
    let updatedUrls = [...value];
  
    for (const fileObj of newUploading) {
      const url = await uploadFileToS3(fileObj.file);
  
      if (url) {
        updatedUrls.push(url);
      }
  
      setUploadingFiles((prev) => prev.filter((f) => f.file !== fileObj.file));
      onChange([...updatedUrls]);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: true,
    accept: {
      "application/pdf": [],
      "image/jpeg": [],
      "image/png": [],
      "image/webp": [],
      "application/msword": [],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [],
      "application/vnd.ms-excel": [],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [],
      "application/vnd.ms-powerpoint": [],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [],
    },
    onDrop: handleFiles,
    onDropRejected: (fileRejections) => {
      const rejectedNames = fileRejections.map((rejection) => rejection.file.name);
      const message = `❌ No se permiten estos archivos:\n${rejectedNames.join(", ")}`;
      setSnackbarMessage(message);
      setOpenSnackbar(true);
    },
  });

  const handleRemove = (fileUrl: string) => {
    const updated = value.filter((url) => url !== fileUrl);
    onChange(updated);
  };

  return (
    <>
      <Box
        {...getRootProps()}
        sx={{
          border: "2px dashed #ccc",
          padding: 2,
          textAlign: "center",
          borderRadius: 2,
          bgcolor: isDragActive ? "#f0f0f0" : "background.paper",
          cursor: "pointer",
          mb: 2,
        }}
      >
        <input {...getInputProps()} />
        <Typography variant="body2">
          {isDragActive ? "Suelta los archivos aquí..." : "Arrastra archivos o haz clic para subir"}
        </Typography>
      </Box>

      <Box display="flex" flexWrap="wrap" gap={2}>
        {value.map((fileUrl, idx) => {
          const isImage = fileUrl.match(/\.(jpg|jpeg|png|webp)$/i);
          const isPdf = fileUrl.match(/\.pdf$/i);
          const isWord = fileUrl.match(/\.(doc|docx)$/i);
          const isExcel = fileUrl.match(/\.(xls|xlsx)$/i);
          const isPowerPoint = fileUrl.match(/\.(ppt|pptx)$/i);

          return (
            <Box
              key={idx}
              sx={{
                width: 100,
                height: 100,
                position: "relative",
                border: "1px solid #ccc",
                borderRadius: 2,
                overflow: "hidden",
                bgcolor: "#f5f5f5",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                p: 1,
                textAlign: "center",
                cursor: "pointer",
              }}
              onClick={() => window.open(fileUrl, "_blank")}
            >
              {isImage ? (
                <img
                  src={fileUrl}
                  alt="preview"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : isPdf ? (
                <img src="/icons/pdf-icon.png" alt="PDF" style={{ width: 45, height: 45 }} />
              ) : isWord ? (
                <img src="/icons/word-icon.png" alt="Word" style={{ width: 45, height: 45 }} />
              ) : isExcel ? (
                <img src="/icons/excel-icon.png" alt="Excel" style={{ width: 45, height: 45 }} />
              ) : isPowerPoint ? (
                <img src="/icons/ppt-icon.png" alt="PowerPoint" style={{ width: 45, height: 45 }} />
              ) : (
                <Typography variant="caption">Archivo</Typography>
              )}

              <IconButton
                size="small"
                color="error"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(fileUrl);
                }}
                sx={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  backgroundColor: "#fff",
                  borderRadius: "50%",
                  boxShadow: 1,
                  width: 22,
                  height: 22,
                  p: 0,
                  zIndex: 10,
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          );
        })}

        {/* Subiendo archivos */}
        {uploadingFiles.map((fileObj, idx) => (
          <Box
            key={`uploading-${idx}`}
            sx={{
              width: 100,
              height: 100,
              border: "1px dashed #ccc",
              borderRadius: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "#f9f9f9",
            }}
          >
            <CircularProgress size={24} />
          </Box>
        ))}
      </Box>

      <Snackbar
        open={openSnackbar}
        autoHideDuration={4000}
        onClose={() => setOpenSnackbar(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          severity="error"
          onClose={() => setOpenSnackbar(false)}
          sx={{ width: "100%" }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </>
  );
};

export default FileDropzone;
```

### 5. Integración en RecordEditModal

```typescript
// En el RecordEditModal, agregar esta lógica en el renderizado de campos:

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

## 🔧 Configuración del Backend

### Variables de Entorno Requeridas
```env
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_REGION=us-east-1
AWS_BUCKET_NAME=your-bucket-name
```

### Endpoints Disponibles
- `POST /api/upload` - Subir archivo
- `GET /api/upload/preview/:key` - Generar URL de previsualización

## 📊 Estructura de Datos

### Campo de Archivos en la Base de Datos
```json
{
  "key": "documentos",
  "label": "Documentos",
  "type": "file",
  "value": [
    "https://bucket.s3.amazonaws.com/1234567890-documento1.pdf",
    "https://bucket.s3.amazonaws.com/1234567891-documento2.docx"
  ],
  "options": [],
  "visible": true,
  "format": "files"
}
```

## 🎨 Características del Componente

### Funcionalidades
- ✅ Subida múltiple de archivos
- ✅ Validación de tipos de archivo
- ✅ Previsualización de imágenes
- ✅ Iconos para diferentes tipos de archivo
- ✅ Eliminación de archivos
- ✅ Indicadores de progreso
- ✅ Manejo de errores
- ✅ Drag & drop

### Tipos de Archivo Soportados
- **Imágenes**: JPEG, PNG, WebP
- **Documentos**: PDF, Word (.doc, .docx)
- **Hojas de cálculo**: Excel (.xls, .xlsx)
- **Presentaciones**: PowerPoint (.ppt, .pptx)

### Límites
- **Tamaño máximo**: 10MB por archivo
- **Archivos múltiples**: Sin límite (solo limitado por el navegador)

## 🚨 Manejo de Errores

### Errores Comunes
1. **Tipo de archivo no permitido**
2. **Archivo demasiado grande**
3. **Error de conexión con S3**
4. **Error de red**

### Soluciones
- Validación en frontend antes de subir
- Mensajes de error amigables
- Rollback automático en caso de fallo
- Logs detallados en backend

## 🔄 Flujo de Trabajo

1. **Usuario selecciona archivos** → Validación local
2. **Subida a S3** → Progreso visual
3. **Respuesta con URLs** → Actualización del estado
4. **Guardado del registro** → URLs almacenadas en BD
5. **Previsualización** → URLs directas o firmadas

## 📝 Notas de Implementación

- Los archivos se almacenan como arrays de URLs
- Cada URL es única y pública en S3
- El componente maneja automáticamente la conversión de tipos
- La validación se realiza tanto en frontend como backend
- Los archivos se pueden eliminar individualmente
- El sistema soporta múltiples archivos por campo 