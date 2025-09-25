// src/utils/validateFileType.ts
export const isValidFileType = (file: Express.Multer.File): boolean => {
  const allowedTypes = [
    "image/jpeg",
    "image/png", 
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];

  return allowedTypes.includes(file.mimetype);
};

export const getFileExtension = (filename: string): string => {
  return filename.split('.').pop()?.toLowerCase() || '';
};

export const getFileTypeIcon = (filename: string): string => {
  const extension = getFileExtension(filename);
  
  switch (extension) {
    case 'pdf':
      return 'pdf-icon.png';
    case 'doc':
    case 'docx':
      return 'word-icon.png';
    case 'xls':
    case 'xlsx':
      return 'excel-icon.png';
    case 'ppt':
    case 'pptx':
      return 'ppt-icon.png';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'webp':
      return 'image-icon.png';
    default:
      return 'file-icon.png';
  }
};