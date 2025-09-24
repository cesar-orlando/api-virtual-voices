declare namespace Express {
  interface Request {
    user?: {
      id: string;
      name: string;
      email: string;
      role: string;
      companySlug?: string;
    };
    file?: Express.Multer.File;
    files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
  }
}