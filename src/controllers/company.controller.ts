import { Request, Response } from "express";
import getCompanyModel from "../models/company.model";
import getBranchModel from "../models/branch.model";
import { getConnectionByCompanySlug, getDbConnection } from "../config/connectionManager";
import { createIAConfig } from "./iaConfig.controller";
import getIaConfigModel from "../models/iaConfig.model";
import mongoose from "mongoose";

export const createCompanyAndDatabase = async (req: Request, res: Response) => {
  try {
    const { name, address, phone, branches } = req.body;
    if (!name) res.status(400).json({ message: "Name is required" });

    // Crea la base de datos específica para la empresa
    const conn = await getConnectionByCompanySlug(name);
    const uppercaseName = name.toUpperCase();

    // Crea el registro de la empresa en la base principal (sin branches embebidas)
    const Company = getCompanyModel(conn);
    const company = new Company({ 
      name, 
      address, 
      phone
    });
    await company.save();

    // Crear sucursales en colección separada
    const Branch = getBranchModel(conn);
    const defaultBranches = branches && branches.length > 0 
      ? branches 
      : [{ 
          name: name, 
          code: uppercaseName, 
          address: address || "", 
          phone: phone || "", 
          isActive: true 
        }];

    // Crear cada sucursal con referencia a la empresa
    const createdBranches = await Promise.all(
      defaultBranches.map(async (branchData: any) => {
        const branch = new Branch({
          companyId: company._id,
          name: branchData.name,
          code: branchData.code.toUpperCase(),
          address: branchData.address,
          phone: branchData.phone,
          email: branchData.email,
          isActive: branchData.isActive !== false
        });
        return await branch.save();
      })
    );
    
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

    res.status(201).json({ 
      message: "Company, database and branches created successfully", 
      company: {
        _id: company._id,
        name: company.name,
        address: company.address,
        phone: company.phone
      },
      branches: createdBranches,
      iaConfig: firstConfig 
    });
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

export const updateCompany = async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const updates = req.body;

    const conn = await getConnectionByCompanySlug(name);
    const Company = getCompanyModel(conn);

    const company = await Company.findOneAndUpdate({ name }, updates, { new: true });
    
    if (!company) {
      res.status(404).json({ message: "Company not found" });
      return;
    }

    res.status(200).json(company);
    return;
  } catch (error) {
    res.status(500).json({ message: "Error updating company", error });
    return;
  }
};

/**
 * Obtener todas las empresas disponibles (para admin supremo y usuarios VirtualVoices)
 */
export const getAllCompanies = async (req: Request, res: Response) => {
  try {
    // Verificar permisos: solo admin supremo o usuarios de VirtualVoices
    const userCompany = req.headers['x-user-company'] as string;
    const userRole = req.headers['x-user-role'] as string;
    
    const hasAccess = userRole === 'SuperAdmin' || 
                     userCompany?.toLowerCase() === 'virtualvoices';
    
    if (!hasAccess) {
      res.status(403).json({ 
        message: "Acceso denegado. Solo admin supremo o usuarios VirtualVoices pueden ver todas las empresas" 
      });
      return;
    }

    if (!mongoose.connection.db) {
      res.status(500).json({ message: "Database connection not established" });
      return;
    }

    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();

    const companies = [];

    // Obtener empresas de cada base de datos
    for (const dbInfo of dbs.databases) {
      const dbName = dbInfo.name;
      if (dbName === "admin" || dbName === "local") continue;

      try {
        const conn = await getDbConnection(dbName);
        const Company = getCompanyModel(conn);
        const companyRecords = await Company.find({});
        
        companies.push(...companyRecords.map(company => ({
          _id: company._id,
          name: company.name,
          address: company.address,
          phone: company.phone,
          slug: dbName,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt
        })));
      } catch (err) {
        console.error(`Error fetching company from ${dbName}:`, err);
        // Agregar empresa básica si hay error
        companies.push({
          name: dbName,
          slug: dbName,
          address: null,
          phone: null,
          error: 'Error loading company details'
        });
      }
    }

    // Agregar opción especial para vista consolidada
    companies.push({
      _id: 'all-companies',
      name: 'Todas las Empresas',
      slug: 'all-companies',
      description: 'Vista consolidada de todas las empresas',
      isSpecial: true
    });

    res.json(companies);
  } catch (error) {
    console.error('Error getting all companies:', error);
    res.status(500).json({ message: "Error interno del servidor", error });
  }
};

/**
 * Obtener estadísticas globales de todas las empresas (solo admin supremo)
 */
export const getGlobalStats = async (req: Request, res: Response) => {
  try {
    const userRole = req.headers['x-user-role'] as string;
    const userCompany = req.headers['x-user-company'] as string;
    
    const hasAccess = userRole === 'SuperAdmin' || 
                     userCompany?.toLowerCase() === 'virtualvoices';
    
    if (!hasAccess) {
      res.status(403).json({ message: "Acceso denegado" });
      return;
    }

    if (!mongoose.connection.db) {
      res.status(500).json({ message: "Database connection not established" });
      return;
    }

    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();

    const globalStats = {
      totalCompanies: 0,
      totalUsers: 0,
      totalTasks: 0,
      companiesDetails: [] as any[]
    };

    for (const dbInfo of dbs.databases) {
      const dbName = dbInfo.name;
      if (dbName === "admin" || dbName === "local") continue;

      try {
        const conn = await getDbConnection(dbName);
        
        // Contar empresas
        const Company = getCompanyModel(conn);
        const companyCount = await Company.countDocuments();
        globalStats.totalCompanies += companyCount;

        // Intentar contar usuarios
        try {
          const User = conn.models.User || conn.model('User', new mongoose.Schema({}, { strict: false }));
          const userCount = await User.countDocuments();
          globalStats.totalUsers += userCount;
        } catch (userError) {
          console.log(`No users collection in ${dbName}`);
        }

        // Intentar contar tareas
        try {
          const Task = conn.models.Task || conn.model('Task', new mongoose.Schema({}, { strict: false }));
          const taskCount = await Task.countDocuments();
          globalStats.totalTasks += taskCount;
        } catch (taskError) {
          console.log(`No tasks collection in ${dbName}`);
        }

        globalStats.companiesDetails.push({
          database: dbName,
          companies: companyCount
        });

      } catch (err) {
        console.error(`Error getting stats from ${dbName}:`, err);
      }
    }

    res.json(globalStats);
  } catch (error) {
    console.error('Error getting global stats:', error);
    res.status(500).json({ message: "Error interno del servidor", error });
  }
};

// ===== FUNCIONES PARA MANEJAR BRANCHES =====

export const addBranchToCompany = async (req: Request, res: Response) => {
  try {
    const { c_name } = req.params;
    const { name, code, address, phone, email, isActive = true, manager } = req.body;

    if (!name || !code) {
      res.status(400).json({ message: "Name and code are required" });
      return;
    }

    const conn = await getConnectionByCompanySlug(c_name);
    const Company = getCompanyModel(conn);
    const Branch = getBranchModel(conn);

    // Buscar la empresa
    const company = await Company.findOne();
    if (!company) {
      res.status(404).json({ message: "Company not found" });
      return;
    }

    // Verificar que el código no exista en esta empresa
    const existingBranch = await Branch.findOne({ 
      companyId: company._id, 
      code: code.toUpperCase() 
    });
    if (existingBranch) {
      res.status(400).json({ message: "Branch code already exists for this company" });
      return;
    }

    // Crear nueva sucursal
    const branch = new Branch({
      companyId: company._id,
      name,
      code: code.toUpperCase(),
      address,
      phone,
      email,
      isActive,
      manager
    });

    await branch.save();
    res.status(201).json({ 
      message: "Branch added successfully", 
      branch 
    });
  } catch (error) {
    res.status(500).json({ message: "Error adding branch", error });
  }
};

export const updateBranch = async (req: Request, res: Response) => {
  try {
    const { c_name, branchId } = req.params;
    const updateData = req.body;

    const conn = await getConnectionByCompanySlug(c_name);
    const Company = getCompanyModel(conn);
    const Branch = getBranchModel(conn);

    // Buscar la empresa
    const company = await Company.findOne();
    if (!company) {
      res.status(404).json({ message: "Company not found" });
      return;
    }

    // Buscar y actualizar la sucursal por ID
    const branch = await Branch.findOne({ 
      _id: branchId, 
      companyId: company._id 
    });
    
    if (!branch) {
      res.status(404).json({ message: "Branch not found" });
      return;
    }

    // Si se actualiza el código, verificar que no exista en esta empresa
    if (updateData.code && updateData.code.toUpperCase() !== branch.code) {
      const existingBranch = await Branch.findOne({ 
        companyId: company._id, 
        code: updateData.code.toUpperCase(),
        _id: { $ne: branchId }
      });
      if (existingBranch) {
        res.status(400).json({ message: "Branch code already exists for this company" });
        return;
      }
    }

    // Actualizar campos
    Object.keys(updateData).forEach(key => {
      if (key === 'code') {
        (branch as any)[key] = updateData[key].toUpperCase();
      } else {
        (branch as any)[key] = updateData[key];
      }
    });

    await branch.save();
    res.status(200).json({ message: "Branch updated successfully", branch });
  } catch (error) {
    res.status(500).json({ message: "Error updating branch", error });
  }
};

export const getBranches = async (req: Request, res: Response) => {
  try {
    const { c_name } = req.params;
    
    const conn = await getConnectionByCompanySlug(c_name);
    const Company = getCompanyModel(conn);
    const Branch = getBranchModel(conn);

    // Buscar la empresa
    const company = await Company.findOne();
    if (!company) {
      res.status(404).json({ message: "Company not found" });
      return;
    }

    // Buscar todas las sucursales de esta empresa
    const branches = await Branch.find({ companyId: company._id })
      .populate('manager.id', 'name email')
      .sort({ name: 1 });

    res.status(200).json({ branches });
  } catch (error) {
    res.status(500).json({ message: "Error getting branches", error });
  }
};

export const deleteBranch = async (req: Request, res: Response) => {
  try {
    const { c_name, branchId } = req.params;
    
    const conn = await getConnectionByCompanySlug(c_name);
    const Company = getCompanyModel(conn);
    const Branch = getBranchModel(conn);

    // Buscar la empresa
    const company = await Company.findOne();
    if (!company) {
      res.status(404).json({ message: "Company not found" });
      return;
    }

    // Buscar la sucursal
    const branch = await Branch.findOne({ 
      _id: branchId, 
      companyId: company._id 
    });
    
    if (!branch) {
      res.status(404).json({ message: "Branch not found" });
      return;
    }

    // No permitir eliminar si es la única sucursal activa
    const activeBranchesCount = await Branch.countDocuments({ 
      companyId: company._id, 
      isActive: true,
      _id: { $ne: branchId }
    });
    
    if (activeBranchesCount === 0 && branch.isActive) {
      res.status(400).json({ message: "Cannot delete the last active branch" });
      return;
    }

    // Eliminar la sucursal
    await Branch.findByIdAndDelete(branchId);
    
    res.status(200).json({ 
      message: "Branch deleted successfully",
      deletedBranch: {
        _id: branch._id,
        name: branch.name,
        code: branch.code
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting branch", error });
  }
};