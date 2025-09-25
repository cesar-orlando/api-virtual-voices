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
}