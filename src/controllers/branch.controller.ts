import { Request, Response } from "express";
import getBranchModel from "../models/branch.model";
import getCompanyModel from "../models/company.model";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import { Types } from "mongoose";

// ===== OPERACIONES CRUD PARA SUCURSALES =====

/**
 * Crear nueva sucursal
 * POST /api/companies/:c_name/branches
 */
export const createBranch = async (req: Request, res: Response) => {
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

    // Verificar que la empresa exista
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
      res.status(400).json({ 
        message: "Branch code already exists for this company",
        existingBranch: { _id: existingBranch._id, name: existingBranch.name }
      });
      return;
    }

    // Crear nueva sucursal
    const branch = new Branch({
      companyId: company._id,
      name: name.trim(),
      code: code.toUpperCase().trim(),
      address: address?.trim(),
      phone: phone?.trim(),
      email: email?.toLowerCase().trim(),
      isActive,
      manager: manager ? {
        id: manager.id,
        name: manager.name?.trim()
      } : undefined
    });

    await branch.save();
    
    // Poblar datos del manager si existe
    await branch.populate('manager.id', 'name email');

    res.status(201).json({ 
      message: "Branch created successfully", 
      branch 
    });
  } catch (error) {
    console.error('Error creating branch:', error);
    res.status(500).json({ message: "Error creating branch", error });
  }
};

/**
 * Obtener todas las sucursales de una empresa
 * GET /api/companies/:c_name/branches
 */
export const getBranchesByCompany = async (req: Request, res: Response) => {
  try {
    const { c_name } = req.params;
    const { active, search } = req.query;
    
    const conn = await getConnectionByCompanySlug(c_name);
    const Company = getCompanyModel(conn);
    const Branch = getBranchModel(conn);

    // Verificar que la empresa exista
    const company = await Company.findOne();
    if (!company) {
      res.status(404).json({ message: "Company not found" });
      return;
    }

    // Construir filtro de búsqueda
    const filter: any = { companyId: company._id };
    
    if (active !== undefined) {
      filter.isActive = active === 'true';
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } }
      ];
    }

    // Buscar sucursales con filtros
    const branches = await Branch.find(filter)
      .populate('manager.id', 'name email')
      .sort({ name: 1 });

    res.status(200).json({ 
      branches,
      total: branches.length,
      company: {
        _id: company._id,
        name: company.name
      }
    });
  } catch (error) {
    console.error('Error getting branches:', error);
    res.status(500).json({ message: "Error getting branches", error });
  }
};

/**
 * Obtener una sucursal específica por ID
 * GET /api/companies/:c_name/branches/:branchId
 */
export const getBranchById = async (req: Request, res: Response) => {
  try {
    const { c_name, branchId } = req.params;
    
    const conn = await getConnectionByCompanySlug(c_name);
    const Company = getCompanyModel(conn);
    const Branch = getBranchModel(conn);

    // Verificar que la empresa exista
    const company = await Company.findOne();
    if (!company) {
      res.status(404).json({ message: "Company not found" });
      return;
    }

    // Buscar la sucursal específica
    const branch = await Branch.findOne({ 
      _id: branchId, 
      companyId: company._id 
    }).populate('manager.id', 'name email');
    
    if (!branch) {
      res.status(404).json({ message: "Branch not found" });
      return;
    }

    res.status(200).json({ branch });
  } catch (error) {
    console.error('Error getting branch:', error);
    res.status(500).json({ message: "Error getting branch", error });
  }
};

/**
 * Actualizar una sucursal
 * PUT /api/companies/:c_name/branches/:branchId
 */
export const updateBranch = async (req: Request, res: Response) => {
  try {
    const { c_name, branchId } = req.params;
    const updateData = req.body;

    const conn = await getConnectionByCompanySlug(c_name);
    const Company = getCompanyModel(conn);
    const Branch = getBranchModel(conn);

    // Verificar que la empresa exista
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

    // Si se actualiza el código, verificar que no exista en esta empresa
    if (updateData.code && updateData.code.toUpperCase() !== branch.code) {
      const existingBranch = await Branch.findOne({ 
        companyId: company._id, 
        code: updateData.code.toUpperCase(),
        _id: { $ne: branchId }
      });
      if (existingBranch) {
        res.status(400).json({ 
          message: "Branch code already exists for this company",
          existingBranch: { _id: existingBranch._id, name: existingBranch.name }
        });
        return;
      }
    }

    // Actualizar campos con validación
    const allowedFields = ['name', 'code', 'address', 'phone', 'email', 'isActive', 'manager', 'metadata'];
    const updateFields: any = {};

    allowedFields.forEach(field => {
      if (updateData.hasOwnProperty(field)) {
        switch (field) {
          case 'code':
            updateFields[field] = updateData[field].toUpperCase().trim();
            break;
          case 'name':
          case 'address':
          case 'phone':
            updateFields[field] = updateData[field]?.trim();
            break;
          case 'email':
            updateFields[field] = updateData[field]?.toLowerCase().trim();
            break;
          case 'manager':
            updateFields[field] = updateData[field] ? {
              id: updateData[field].id,
              name: updateData[field].name?.trim()
            } : undefined;
            break;
          default:
            updateFields[field] = updateData[field];
        }
      }
    });

    // Actualizar la sucursal
    const updatedBranch = await Branch.findByIdAndUpdate(
      branchId,
      updateFields,
      { new: true, runValidators: true }
    ).populate('manager.id', 'name email');

    res.status(200).json({ 
      message: "Branch updated successfully", 
      branch: updatedBranch 
    });
  } catch (error) {
    console.error('Error updating branch:', error);
    res.status(500).json({ message: "Error updating branch", error });
  }
};

/**
 * Eliminar una sucursal
 * DELETE /api/companies/:c_name/branches/:branchId
 */
export const deleteBranch = async (req: Request, res: Response) => {
  try {
    const { c_name, branchId } = req.params;
    const { force } = req.query; // Para forzar eliminación
    
    const conn = await getConnectionByCompanySlug(c_name);
    const Company = getCompanyModel(conn);
    const Branch = getBranchModel(conn);

    // Verificar que la empresa exista
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

    // No permitir eliminar si es la única sucursal activa (a menos que sea forzado)
    if (force !== 'true') {
      const activeBranchesCount = await Branch.countDocuments({ 
        companyId: company._id, 
        isActive: true,
        _id: { $ne: branchId }
      });
      
      if (activeBranchesCount === 0 && branch.isActive) {
        res.status(400).json({ 
          message: "Cannot delete the last active branch. Use ?force=true to override.",
          suggestion: "Consider deactivating the branch instead of deleting it."
        });
        return;
      }
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
    console.error('Error deleting branch:', error);
    res.status(500).json({ message: "Error deleting branch", error });
  }
};

/**
 * Cambiar estado activo/inactivo de una sucursal
 * PATCH /api/companies/:c_name/branches/:branchId/toggle-status
 */
export const toggleBranchStatus = async (req: Request, res: Response) => {
  try {
    const { c_name, branchId } = req.params;
    
    const conn = await getConnectionByCompanySlug(c_name);
    const Company = getCompanyModel(conn);
    const Branch = getBranchModel(conn);

    // Verificar que la empresa exista
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

    // Si se va a desactivar, verificar que no sea la única activa
    if (branch.isActive) {
      const activeBranchesCount = await Branch.countDocuments({ 
        companyId: company._id, 
        isActive: true,
        _id: { $ne: branchId }
      });
      
      if (activeBranchesCount === 0) {
        res.status(400).json({ 
          message: "Cannot deactivate the last active branch"
        });
        return;
      }
    }

    // Cambiar estado
    branch.isActive = !branch.isActive;
    await branch.save();
    
    res.status(200).json({ 
      message: `Branch ${branch.isActive ? 'activated' : 'deactivated'} successfully`,
      branch: {
        _id: branch._id,
        name: branch.name,
        code: branch.code,
        isActive: branch.isActive
      }
    });
  } catch (error) {
    console.error('Error toggling branch status:', error);
    res.status(500).json({ message: "Error toggling branch status", error });
  }
};

/**
 * Obtener estadísticas de sucursales de una empresa
 * GET /api/companies/:c_name/branches/stats
 */
export const getBranchStats = async (req: Request, res: Response) => {
  try {
    const { c_name } = req.params;
    
    const conn = await getConnectionByCompanySlug(c_name);
    const Company = getCompanyModel(conn);
    const Branch = getBranchModel(conn);

    // Verificar que la empresa exista
    const company = await Company.findOne();
    if (!company) {
      res.status(404).json({ message: "Company not found" });
      return;
    }

    // Obtener estadísticas
    const totalBranches = await Branch.countDocuments({ companyId: company._id });
    const activeBranches = await Branch.countDocuments({ companyId: company._id, isActive: true });
    const inactiveBranches = totalBranches - activeBranches;
    const branchesWithManagers = await Branch.countDocuments({ 
      companyId: company._id, 
      'manager.id': { $exists: true } 
    });

    res.status(200).json({
      stats: {
        total: totalBranches,
        active: activeBranches,
        inactive: inactiveBranches,
        withManagers: branchesWithManagers,
        withoutManagers: totalBranches - branchesWithManagers
      },
      company: {
        _id: company._id,
        name: company.name
      }
    });
  } catch (error) {
    console.error('Error getting branch stats:', error);
    res.status(500).json({ message: "Error getting branch statistics", error });
  }
};
