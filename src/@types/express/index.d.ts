declare namespace Express {
  interface Request {
    user?: {
      id: string;
      name: string;
      email: string;
      role: string;
      companySlug?: string;
    };
    file?: Express.Multer.File & {
      path: string;
      filename: string;
      originalname: string;
      mimetype: string;
      size: number;
    };
    files?: (Express.Multer.File & {
      path: string;
      filename: string;
      originalname: string;
      mimetype: string;
      size: number;
    })[] | { [fieldname: string]: (Express.Multer.File & {
      path: string;
      filename: string;
      originalname: string;
      mimetype: string;
      size: number;
    })[] };
  }

  namespace Multer {
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
      destination?: string;
      filename?: string;
      path?: string;
    }
  }
}