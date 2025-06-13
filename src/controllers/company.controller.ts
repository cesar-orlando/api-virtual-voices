import { Request, Response } from "express";
import getCompanyModel from "../models/company.model";
import { getDbConnection } from "../config/connectionManager";
import { createIAConfig } from "./iaConfig.controller";

export const createCompanyAndDatabase = async (req: Request, res: Response) => {
  try {
    const { name, address, phone } = req.body;
    if (!name) res.status(400).json({ message: "Name is required" });

    // Crea la base de datos específica para la empresa
    const dbName = `${name}`;
    const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];
    const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");

    // Crea el registro de la empresa en la base principal
    const Company = getCompanyModel(conn);
    const company = new Company({ name, address, phone });
    await company.save();

    
    // Llama a createIAConfig para crear la configuración IA inicial
    // Simula un Request y Response mínimos para reutilizar el controlador
    const fakeReq = {
      params: { c_name: name },
      body: {
        name: "Asistente",
        tone: "amigable",
        objective: "agendar",
        welcomeMessage: "¡Hola! ¿En qué puedo ayudarte?",
      }
    } as unknown as Request;
    const fakeRes = {
      status: (code: number) => ({
        json: (obj: any) => obj
      })
    } as unknown as Response;

    await createIAConfig(fakeReq, fakeRes);

    res.status(201).json({ message: "Empresa y base de datos creadas", dbName });
    return;
  } catch (error) {
    res.status(500).json({ message: "Error creating company/database", error });
    return;
  }
};

export const getCompany = async (req: Request, res: Response) => {
  try {
    const { name } = req.params;

    const dbName = `${name}`;
    const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];
    const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");

    const Company = getCompanyModel(conn);
    const company = await Company.find({ name });
    res.status(200).json(company);
    return;
  } catch (error) {
    res.status(500).json({ message: "Error fetching company", error });
    return;
  }
};