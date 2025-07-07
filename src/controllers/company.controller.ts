import { Request, Response } from "express";
import getCompanyModel from "../models/company.model";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import { createIAConfig } from "./iaConfig.controller";
import getIaConfigModel from "../models/iaConfig.model";
// ... otros imports ...
import { getDbConnection } from "../config/connectionManager";

export const createCompanyAndDatabase = async (req: Request, res: Response) => {
  try {
    const { name, address, phone } = req.body;
    if (!name) res.status(400).json({ message: "Name is required" });

    // Crea la base de datos específica para la empresa
    const conn = await getConnectionByCompanySlug(name);

    // Crea el registro de la empresa en la base principal
    const Company = getCompanyModel(conn);
    const company = new Company({ name, address, phone });
    await company.save();
    
    // Llama a createIAConfig para crear la configuración IA inicial
    // Simula un Request y Response mínimos para reutilizar el controlador
    const IaConfig = getIaConfigModel(conn);

    const firstConfig = new IaConfig({
      name: "Asistente",
      type: "general",
      tone: "persuasivo",
      objective: "ventas",
      welcomeMessage: "¡Hola! ¿Buscas una nueva oferta hoy?",
      intents: [],
      customPrompt: "",
    });

    await firstConfig.save();

    res.status(201).json({ message: "Empresa, base de datos e IAConfig creadas", name });
    return;
  } catch (error) {
    res.status(500).json({ message: "Error creando empresa/base de datos/IAConfig", error });
    return;
  }
};

export const getCompany = async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    
    const conn = await getConnectionByCompanySlug(name);

    const Company = getCompanyModel(conn);
    const company = await Company.find({ name });
    res.status(200).json(company);
    return;
  } catch (error) {
    res.status(500).json({ message: "Error fetching company", error });
    return;
  }
};

export const updateCompany = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.params;
    const { displayName, logoUrl, statuses, address, phone } = req.body;

    if (!name) {
      res.status(400).json({ message: "Company name is required" });
      return 
    }

    // Conexión a la base de datos de la empresa
    const conn = await getDbConnection(name);
    const Company = getCompanyModel(conn);

    // Solo permitir actualizar los campos definidos
    const updateFields: any = {};
    if (displayName !== undefined) updateFields.displayName = displayName;
    if (logoUrl !== undefined) updateFields.logoUrl = logoUrl;
    if (statuses !== undefined) updateFields.statuses = statuses;
    if (address !== undefined) updateFields.address = address;
    if (phone !== undefined) updateFields.phone = phone;

    const updatedCompany = await Company.findOneAndUpdate(
      { name },
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedCompany) {
      res.status(404).json({ message: "Company not found" });
      return 
    }

    res.status(200).json({ message: "Company updated successfully", company: updatedCompany });
  } catch (error) {
    res.status(500).json({ message: "Error updating company", error });
  }
};