// src/types/multer.d.ts
declare namespace Express {
  namespace Multer {
    interface File {
      location?: string;
      key?: string;
      bucket?: string;
      acl?: string;
      contentType?: string;
      contentDisposition?: string;
      storageClass?: string;
      serverSideEncryption?: string;
      metadata?: { [key: string]: string };
      etag?: string;
    }
  }
}

declare module 'multer-s3' {
  import { S3Client } from '@aws-sdk/client-s3';
  
  interface S3StorageOptions {
    s3: S3Client;
    bucket: string;
    acl?: string;
    key?: (req: Express.Request, file: Express.Multer.File, cb: (error: any, key?: string) => void) => void;
  }
  
  function s3Storage(options: S3StorageOptions): any;
  export = s3Storage;
} 