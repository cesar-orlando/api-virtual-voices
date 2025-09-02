import { Request, Response } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import getUserModel, { IUser } from "./user.model";
import getMinutosControlModel from "./minutosControl.model";
import getElevenLabsCallModel from "./elevenLabs.model";
import getCompanyModel from "../../models/company.model";
import getBranchModel from "../../models/branch.model";
import { getConnectionByCompanySlug } from "../../config/connectionManager";
import { getCurrentCompanyContext, requireCompanyContext } from "../auth/companyMiddleware";
import { hasFeature } from "../../shared/projectManager";

const saltRound = 10;

// Función para obtener JWT secret específico por empresa
function getJwtSecret(companySlug?: string): string {
  if (companySlug === "quicklearning") {
    return process.env.JWT_SECRET_QUICKLEARNING || process.env.JWT_SECRET || "changeme";
  }
  return process.env.JWT_SECRET || "changeme";
}

// Get all users for a company
export const getAllCompanyUsers = async (req: Request, res: Response) => {
  try {
    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    const conn = await getConnectionByCompanySlug(companyContext.slug);
    const User = getUserModel(conn);
    const users = await User.find({ companySlug: companyContext.slug });

    if (users.length === 0) {
      res.status(404).json({ message: "No hay usuarios registrados" });
      return;
    }

    res.json(users);
  } catch (error) {
    console.error('Error getting company users:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Get all users from all companies (admin only)
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    if (!mongoose.connection.db) {
      res.status(500).json({ message: "Database connection not established" });
      return;
    }
  
    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();

    const allUsers: any[] = [];

    for (const dbInfo of dbs.databases) {
      const dbName = dbInfo.name;
      if (dbName === "admin" || dbName === "local") continue;

      try {
        const conn = await getConnectionByCompanySlug(dbName);
        const User = getUserModel(conn);
        const users = await User.find();
        users.forEach((user: any) => {
          allUsers.push({ ...user.toObject(), dbName });
        });
      } catch (err) {
        console.error(`Error fetching users from ${dbName}:`, err);
      }
    }

    res.json(allUsers);
  } catch (error) {
    console.error('Error getting all users:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Get a single user by ID
export const getUserById = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    const conn = await getConnectionByCompanySlug(companyContext.slug);
    const User = getUserModel(conn);

    // Log para depuración
    console.log('Buscando usuario por ID:', req.params.id, 'en empresa:', companyContext.slug);

    // Buscar solo por _id
    const user = await User.findById(req.params.id);

    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error('Error getting user by ID:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Create a new user
export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, role } = req.body;
    
    if (!name || !email) {
      res.status(400).json({ message: "Nombre y email son requeridos" });
      return;
    }
    if (!password) {
      res.status(400).json({ message: "Contraseña es requerida" });
      return;
    }
    if (password.length < 10) {
      res.status(400).json({ message: "La contraseña debe tener al menos 10 caracteres" });
      return;
    }

    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    // --- FIX: Redirigir quicklearning a test ---
    const realDbName = companyContext.slug === 'quicklearning' ? 'test' : companyContext.slug;
    const conn = await getConnectionByCompanySlug(realDbName);
    const User = getUserModel(conn);

    // Verificar si el email ya existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ message: "El email ya está registrado" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, saltRound);
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: role || 'Usuario',
      companySlug: companyContext.slug === 'quicklearning' ? 'quicklearning' : companyContext.slug
    });

    await newUser.save();
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: "Error interno del servidor", error: error });
  }
};

// Update a user by ID
export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, role, status, branch, companySlug } = req.body;
    const companyContext = getCurrentCompanyContext(req);
    
    console.log('🔄 updateUser llamado:');
    console.log('  - Usuario ID:', req.params.id);
    console.log('  - Datos a actualizar:', { name, email, role, status, companySlug, branch: branch ? `${branch.name} (${branch.code})` : 'sin cambios' });
    console.log('  - Company Context:', companyContext ? companyContext.slug : 'NULL');
    console.log('  - Headers Authorization:', req.headers.authorization ? 'Presente' : 'Ausente');
    
    // CAMBIO: Si no hay companyContext, intentar usar el companySlug del body o derivarlo del JWT
    let targetCompanySlug = companyContext?.slug;
    
    if (!targetCompanySlug && companySlug) {
      console.log('📝 Usando companySlug del body:', companySlug);
      targetCompanySlug = companySlug;
    }
    
    if (!targetCompanySlug) {
      // Intentar extraer del JWT directamente
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.substring(7);
          const jwt = require('jsonwebtoken');
          const decoded = jwt.decode(token) as any;
          targetCompanySlug = decoded?.companySlug || decoded?.c_name;
          console.log('🔓 CompanySlug extraído del JWT:', targetCompanySlug);
        } catch (err) {
          console.log('❌ Error decodificando JWT:', err);
        }
      }
    }
    
    if (!targetCompanySlug) {
      console.log('❌ No se pudo determinar companySlug - devolviendo 400');
      res.status(400).json({ message: "No se pudo determinar la empresa del usuario" });
      return;
    }

    const conn = await getConnectionByCompanySlug(targetCompanySlug);
    const User = getUserModel(conn);

    // Log para depuración
    console.log('Intentando actualizar usuario:', req.params.id, 'en empresa:', targetCompanySlug);

    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (status) updateData.status = status;
    if (companySlug) updateData.companySlug = companySlug; // NUEVO: Permitir actualizar companySlug
    
    // ACTUALIZADO: Validar y procesar sucursal con nuevo modelo independiente
    if (branch && branch.branchId) {
      const Branch = getBranchModel(conn);
      const foundBranch = await Branch.findById(branch.branchId);
      
      if (!foundBranch) {
        console.log('❌ Sucursal no encontrada con ID:', branch.branchId);
        res.status(400).json({ message: "Sucursal no encontrada" });
        return;
      }
      
      if (!foundBranch.isActive) {
        console.log('⚠️ Sucursal inactiva:', foundBranch.name);
        res.status(400).json({ message: "No se puede asignar una sucursal inactiva" });
        return;
      }
      
      updateData.branch = {
        branchId: foundBranch._id,
        name: foundBranch.name,
        code: foundBranch.code
      };
      console.log('✅ Sucursal validada:', foundBranch.name, `(${foundBranch.code})`);
    } else if (branch === null) {
      // Permitir remover la asignación de sucursal
      updateData.branch = undefined;
      console.log('🗑️ Removiendo asignación de sucursal');
    }
    
    if (password) {
      if (password.length < 10) {
        res.status(400).json({ message: "La contraseña debe tener al menos 10 caracteres" });
        return;
      }
      updateData.password = await bcrypt.hash(password, saltRound);
    }

    // Buscar solo por _id
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Delete a user by ID
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    const conn = await getConnectionByCompanySlug(companyContext.slug);
    const User = getUserModel(conn);

    const deletedUser = await User.findByIdAndDelete(req.params.id);
    if (!deletedUser) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Login with company detection
export const compareLogin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!mongoose.connection.db) {
      res.status(500).json({ message: "Database connection not established" });
      return;
    }
    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();


    for (const dbInfo of dbs.databases) {
      const dbName = dbInfo.name;
      if (dbName === "admin" || dbName === "local") continue;

      const conn = await getConnectionByCompanySlug(dbName);
      const User = getUserModel(conn);
      console.log("email", email);
      console.log("User", User);
      const existingUser = await User.findOne({ email });

      console.log("existingUser", existingUser);

      if (existingUser) {
        if (!existingUser.email) {
          res.status(401).json({ error: "Credenciales inválidas" });
          return;
        }
        const passwordMatch = await bcrypt.compare(
          password,
          existingUser.password
        );
        if (!passwordMatch) {
          res.status(401).json({ error: "Credenciales inválidas" });
          return;
        }
        
        // Verificar si el usuario está eliminado
        if (existingUser.status === "eliminado") {
          res.status(403).json({ error: "Este usuario ha sido eliminado, no se puede acceder a la cuenta" });
          return;
        }
        
        // Generate JWT token
        const token = jwt.sign(
          {
            sub: existingUser._id,
            email: existingUser.email,
            name: existingUser.name,
            role: existingUser.role,
            c_name: dbName,
            companySlug: dbName, // AGREGAR: Para que el middleware lo detecte
            branchId: existingUser.branch.branchId,
            id: existingUser._id,
          },
          getJwtSecret(existingUser.companySlug),
          { expiresIn: "1h" }
        );
        res.json({
          id: existingUser._id,
          name: existingUser.name,
          email: existingUser.email,
          role: existingUser.role,
          c_name: dbName,
          companySlug: dbName, // AGREGAR: Para consistencia
          branchId: existingUser.branch.branchId, // NUEVO: Incluir branchId en la respuesta
          token,
        });
        console.log(
          "✅ Inicio de sesión exitoso para el usuario:",
          existingUser.name,
          "- Empresa:", dbName,
          "- Email:", existingUser.email
        );
        return;
      }
    }
    // If no user found
    res.status(401).json({ error: "Credenciales inválidas" });
  } catch (error: any) {
    res
      .status(400)
      .json({ message: "Error comparing login", error: error.message });
    return;
  }
};

// Get user minutes (if feature is enabled)
export const getUserMinutos = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    if (!hasFeature(companyContext.slug, 'controlMinutos')) {
      res.status(403).json({ message: "Control de minutos no disponible para esta empresa" });
      return;
    }

    const userId = req.params.userId || req.body.userId;
    if (!userId) {
      res.status(400).json({ message: "ID de usuario requerido" });
      return;
    }

    const conn = await getConnectionByCompanySlug(companyContext.slug);
    const MinutosControl = getMinutosControlModel(conn);
    
    const control = await MinutosControl.findOne({ 
      userId, 
      companySlug: companyContext.slug 
    });

    res.json({
      userId,
      companySlug: companyContext.slug,
      minutosAcumulados: control?.minutosAcumulados || 0,
      estado: control?.estado || 'activo',
      ultimaActividad: control?.ultimaActividad || new Date()
    });
  } catch (error) {
    console.error('Error getting user minutes:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Get ElevenLabs calls (if feature is enabled)
export const getUserElevenLabsCalls = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    if (!hasFeature(companyContext.slug, 'elevenLabs')) {
      res.status(403).json({ message: "ElevenLabs no disponible para esta empresa" });
      return;
    }

    const userId = req.params.userId || req.body.userId;
    if (!userId) {
      res.status(400).json({ message: "ID de usuario requerido" });
      return;
    }

    const conn = await getConnectionByCompanySlug(companyContext.slug);
    const ElevenLabsCall = getElevenLabsCallModel(conn);
    
    const calls = await ElevenLabsCall.find({ 
      userId, 
      companySlug: companyContext.slug 
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('userId', 'name email');

    res.json(calls);
  } catch (error) {
    console.error('Error getting ElevenLabs calls:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ========================================
// NUEVAS FUNCIONES CRÍTICAS PARA LOGIN/REGISTER
// ========================================

// Get all users for current company (improved version)
export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companySlug } = req.query;
    
    if (!companySlug) {
      res.status(400).json({ message: "companySlug is required" });
      return;
    }

    const connection = await getConnectionByCompanySlug(companySlug as string);
    const User = getUserModel(connection);
    
    // Exclude password field from response
    const users = await User.find({}, { password: 0 }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: users.length,
      companySlug: companySlug,
      users: users
    });
    return;
  } catch (err: any) {
    console.error('Error getting users:', err);
    res.status(500).json({ message: "Error getting users", error: err.message });
    return;
  }
};

// Get all users from all companies (admin only)
export const getAllUsersFromAllCompanies = async (req: Request, res: Response): Promise<void> => {
  try {
    const allUsers: any[] = [];
    
    // Get users from Quick Learning Enterprise
    try {
      const quickLearningConn = await getConnectionByCompanySlug("quicklearning");
      const QuickLearningUser = getUserModel(quickLearningConn);
      const quickLearningUsers = await QuickLearningUser.find({}, { password: 0 });
      quickLearningUsers.forEach((user: any) => {
        allUsers.push({ 
          ...user.toObject(), 
          companySlug: "quicklearning",
          companyName: "Quick Learning Enterprise"
        });
      });
    } catch (err) {
      console.error('Error fetching Quick Learning users:', err);
    }

    // Get users from test database (regular companies)
    try {
      const testConn = await getConnectionByCompanySlug("test");
      const TestUser = getUserModel(testConn);
      const testUsers = await TestUser.find({}, { password: 0 });
      testUsers.forEach((user: any) => {
        allUsers.push({ 
          ...user.toObject(), 
          companySlug: user.companySlug || "test",
          companyName: user.companySlug === "quicklearning" ? "Quick Learning" : "Regular Company"
        });
      });
    } catch (err) {
      console.error('Error fetching test users:', err);
    }

    res.json({
      success: true,
      count: allUsers.length,
      users: allUsers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    });
    return;
  } catch (err: any) {
    console.error('Error getting all users:', err);
    res.status(500).json({ message: "Error getting all users", error: err.message });
    return;
  }
};

export const register = async (req: Request, res: Response): Promise<void> => {
  console.log("req.body", req.body);
  try {
    const { name, email, password, role, companySlug } = req.body;
    if (!name || !email || !password || !role || !companySlug) {
      res.status(400).json({ message: "Missing required fields" });
      return;
    }
    
    if (!mongoose.connection.db) {
      res.status(500).json({ message: "Database connection not established" });
      return;
    }
    
    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();
    const dbExists = dbs.databases.some(db => db.name === companySlug);
    
    if (!dbExists) {
      res.status(400).json({ message: "Compañia no encontrada" });
      return;
    }
    
    const connection = await getConnectionByCompanySlug(companySlug);
    if (!connection) {
      res.status(400).json({ message: "Compañia no encontrada" });
      return;
    }
    const User = getUserModel(connection);
    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ message: "Usuario ya existe" });
      return;
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashed,
      role,
      companySlug,
      status: "active",
    });
    res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      companySlug: user.companySlug,
      status: user.status,
    });
    return;
  } catch (err: any) {
    console.log("error", err);
    res.status(500).json({ message: "Registration error", error: err.message });
    return;
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, companySlug } = req.body;
    console.log("req.body", req.body);
    if (!email || !password) {
      res.status(400).json({ message: "Credenciales Invalidas" });
      return;
    }
    if (!companySlug) {
      res.status(400).json({ message: "Credenciales Invalidas" });
      return;
    }

    if (!mongoose.connection.db) {
      res.status(500).json({ message: "Database connection not established" });
      return;
    }
    
    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();
    const dbExists = dbs.databases.some(db => db.name === companySlug);
    
    if (!dbExists) {
      res.status(400).json({ message: "Compañia no encontrada" });
      return;
    }
    
    const connection = await getConnectionByCompanySlug(companySlug);
    if (!connection) {
      res.status(400).json({ message: "Compañia no encontrada" });
      return;
    }
    const User = getUserModel(connection);
    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ message: "Credenciales Invalidas" });
      return;
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ message: "Credenciales Invalidas" });
      return;
    }
    console.log("user", user);
    // Verificar si el usuario está eliminado
    if (user.status === "eliminado") {
      res.status(403).json({ message: "Este usuario ha sido eliminado, no se puede acceder a la cuenta" });
      return;
    }
    const jwtSecret = getJwtSecret(companySlug);
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        companySlug: user.companySlug,
      },
      jwtSecret,
      { expiresIn: "7d" }
    );
    // Preparar la respuesta base
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      companySlug: user.companySlug,
      status: user.status,
      branchId: user.branch.branchId, // Incluir branchId en la respuesta
    };

    // Si es SuperAdmin, guardar userId en variable separada
    let response: any = {
      token,
      user: userResponse,
    };

    if (user.role === 'SuperAdmin') {
      response.superAdminId = user._id; // Variable separada para SuperAdmin
      response.originalUserId = user._id; // También mantener referencia original
      console.log('🔑 SuperAdmin login detected, userId saved:', user._id);
    }

    res.json(response);
    return;
  } catch (err: any) {
    res.status(500).json({ message: "Login error", error: err.message });
    return;
  }
};

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { user } = req as any;
    if (!user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const connection = await getConnectionByCompanySlug(user.companySlug);
    const User = getUserModel(connection);
    const dbUser = await User.findById(user.id);
    if (!dbUser) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    res.json({
      id: dbUser._id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      companySlug: dbUser.companySlug,
      status: dbUser.status,
    });
    return;
  } catch (err: any) {
    res.status(500).json({ message: "Profile error", error: err.message });
    return;
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { user } = req as any;
    if (!user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const { name, password } = req.body;
    const connection = await getConnectionByCompanySlug(user.companySlug);
    const User = getUserModel(connection);
    const dbUser = await User.findById(user.id);
    if (!dbUser) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    if (name) dbUser.name = name;
    if (password) dbUser.password = await bcrypt.hash(password, 10);
    await dbUser.save();
    res.json({
      id: dbUser._id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      companySlug: dbUser.companySlug,
      status: dbUser.status,
    });
    return;
  } catch (err: any) {
    res.status(500).json({ message: "Update error", error: err.message });
    return;
  }
};

// Obtener sucursales disponibles para asignar a usuarios
export const getAvailableBranches = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    const conn = await getConnectionByCompanySlug(companyContext.slug);
    const Company = getCompanyModel(conn);
    const Branch = getBranchModel(conn);

    // Buscar la empresa para obtener su ID
    const company = await Company.findOne();
    if (!company) {
      res.status(404).json({ message: "Company not found" });
      return;
    }

    // ACTUALIZADO: Buscar sucursales en la colección independiente
    const branches = await Branch.find({ 
      companyId: company._id,
      isActive: true 
    })
    .select('_id name code address phone email isActive manager')
    .populate('manager.id', 'name email')
    .sort({ name: 1 });
    
    res.json({ 
      branches: branches.map(branch => ({
        branchId: branch._id,  // Cambio de 'id' a 'branchId' para consistencia
        name: branch.name,
        code: branch.code,
        address: branch.address,
        phone: branch.phone,
        email: branch.email,
        isActive: branch.isActive,
        manager: branch.manager
      }))
    });
  } catch (error) {
    console.error('Error getting available branches:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * Asignar sucursal a un usuario
 * POST /api/users/:userId/assign-branch
 */
export const assignBranchToUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { branchId } = req.body;
    
    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    if (!branchId) {
      res.status(400).json({ message: "ID de sucursal requerido" });
      return;
    }

    const conn = await getConnectionByCompanySlug(companyContext.slug);
    const User = getUserModel(conn);
    const Branch = getBranchModel(conn);

    // Verificar que la sucursal existe y está activa
    const branch = await Branch.findById(branchId);
    if (!branch) {
      res.status(404).json({ message: "Sucursal no encontrada" });
      return;
    }

    if (!branch.isActive) {
      res.status(400).json({ message: "No se puede asignar una sucursal inactiva" });
      return;
    }

    // Actualizar el usuario con la nueva sucursal
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        branch: {
          branchId: branch._id,
          name: branch.name,
          code: branch.code
        }
      },
      { new: true, select: '-password' }
    );

    if (!updatedUser) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    console.log(`✅ Sucursal asignada: ${branch.name} (${branch.code}) -> Usuario: ${updatedUser.name}`);
    
    res.json({
      message: "Sucursal asignada exitosamente",
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        branch: updatedUser.branch
      }
    });
  } catch (error) {
    console.error('Error assigning branch to user:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * Remover sucursal de un usuario
 * DELETE /api/users/:userId/remove-branch
 */
export const removeBranchFromUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    
    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    const conn = await getConnectionByCompanySlug(companyContext.slug);
    const User = getUserModel(conn);

    // Remover la sucursal del usuario
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $unset: { branch: "" } },
      { new: true, select: '-password' }
    );

    if (!updatedUser) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    console.log(`🗑️ Sucursal removida del usuario: ${updatedUser.name}`);
    
    res.json({
      message: "Sucursal removida exitosamente",
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        branch: null
      }
    });
  } catch (error) {
    console.error('Error removing branch from user:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * Obtener usuarios por sucursal
 * GET /api/users/by-branch/:branchId
 */
export const getUsersByBranch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { branchId } = req.params;
    
    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    const conn = await getConnectionByCompanySlug(companyContext.slug);
    const User = getUserModel(conn);
    const Branch = getBranchModel(conn);

    // Verificar que la sucursal existe
    const branch = await Branch.findById(branchId);
    if (!branch) {
      res.status(404).json({ message: "Sucursal no encontrada" });
      return;
    }

    // Buscar usuarios asignados a esta sucursal
    const users = await User.find({ 
      'branch.branchId': branchId,
      status: { $ne: 'eliminado' }
    })
    .select('-password')
    .sort({ name: 1 });

    res.json({
      branch: {
        _id: branch._id,
        name: branch.name,
        code: branch.code
      },
      users,
      total: users.length
    });
  } catch (error) {
    res.status(500).json({ message: "Error interno del servidor" });
  }
}; 

// 📧 EMAIL CONFIGURATION ENDPOINTS - Mínimos necesarios

/**
 * Actualizar configuración completa de email del usuario
 * PUT /api/users/:userId/email-config
 */
export const updateEmailConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
  const { smtpEmail, smtpPassword, signature, footerImage, provider = 'gmail', isEnabled } = req.body;

    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    const conn = await getConnectionByCompanySlug(companyContext.slug);
    const User = getUserModel(conn);
    
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    // Actualizar configuración
    user.emailConfig = {
      smtpEmail: smtpEmail || user.emailConfig?.smtpEmail,
      smtpPassword: smtpPassword || user.emailConfig?.smtpPassword,
      signature: signature !== undefined ? signature : user.emailConfig?.signature,
      footerImage: footerImage !== undefined ? footerImage : user.emailConfig?.footerImage,
      isEnabled: (isEnabled !== undefined ? isEnabled : !!(smtpEmail && smtpPassword)),
      provider,
      smtpHost: user.emailConfig?.smtpHost,
      smtpPort: user.emailConfig?.smtpPort,
      smtpSecure: user.emailConfig?.smtpSecure
    };

    await user.save();

    res.json({ 
      success: true,
      message: "Configuración actualizada",
      emailConfig: {
        smtpEmail: user.emailConfig.smtpEmail,
        signature: user.emailConfig.signature,
        footerImage: user.emailConfig.footerImage,
        provider: user.emailConfig.provider,
        isEnabled: user.emailConfig.isEnabled
      }
    });
  } catch (error) {
    console.error('Error updating email config:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * Obtener configuración de email del usuario
 * GET /api/users/:userId/email-config
 */
export const getEmailConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    const conn = await getConnectionByCompanySlug(companyContext.slug);
    const User = getUserModel(conn);
    
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    res.json({
      emailConfig: user.emailConfig ? {
        smtpEmail: user.emailConfig.smtpEmail,
        signature: user.emailConfig.signature,
        footerImage: user.emailConfig.footerImage,
        provider: user.emailConfig.provider,
        isEnabled: user.emailConfig.isEnabled
      } : null
    });
  } catch (error) {
    console.error('Error getting email config:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * 🔧 FUNCIÓN INTERNA: Obtener configuración completa con contraseña (solo para uso interno del sistema)
 * Esta función SÍ incluye la contraseña para poder enviar emails
 */
export const getEmailConfigInternal = async (companySlug: string, userId: string) => {
  try {
    const conn = await getConnectionByCompanySlug(companySlug);
    const User = getUserModel(conn);
    
    const user = await User.findById(userId);
    if (!user || !user.emailConfig || !user.emailConfig.isEnabled) {
      return null;
    }

    const emailConfig = user.emailConfig;
    
    // Configuraciones SMTP por proveedor
    const smtpConfigs = {
      gmail: { host: 'smtp.gmail.com', port: 587, secure: false },
      outlook: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
      yahoo: { host: 'smtp.mail.yahoo.com', port: 587, secure: false },
      custom: { 
        host: emailConfig.smtpHost || 'smtp.gmail.com', 
        port: emailConfig.smtpPort || 587, 
        secure: emailConfig.smtpSecure || false 
      }
    };
    
    const providerConfig = smtpConfigs[emailConfig.provider || 'gmail'];
    
    // Preparar firma con imagen si existe
    let signature = emailConfig.signature || '';
    if (emailConfig.footerImage) {
      signature += `<br><br><img src="${emailConfig.footerImage}" alt="Footer" style="max-width: 400px;">`;
    }

    return {
      smtpConfig: {
        host: providerConfig.host,
        port: providerConfig.port,
        secure: providerConfig.secure,
        user: emailConfig.smtpEmail,
        pass: emailConfig.smtpPassword // ✅ Incluye la contraseña
      },
      signature,
      userInfo: {
        name: user.name,
        email: user.email,
        smtpEmail: emailConfig.smtpEmail
      }
    };
  } catch (error) {
    console.error('Error getting internal email config:', error);
    return null;
  }
};

/**
 * Eliminar configuración de email del usuario
 * DELETE /api/users/:userId/email-config
 */
export const deleteEmailConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    const conn = await getConnectionByCompanySlug(companyContext.slug);
    const User = getUserModel(conn);
    
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    user.emailConfig = undefined;
    await user.save();

    res.json({ 
      success: true,
      message: "Configuración de email eliminada" 
    });
  } catch (error) {
    console.error('Error deleting email config:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * 📧 NUEVO: Enviar email usando la configuración del usuario
 * POST /api/users/:userId/send-email
 */
export const sendEmailFromUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { to, subject, text, html } = req.body;

    if (!to || !subject || !text) {
      res.status(400).json({ 
        message: "Los campos 'to', 'subject' y 'text' son requeridos" 
      });
      return;
    }

    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    // Obtener configuración completa del usuario (con contraseña)
    const userEmailConfig = await getEmailConfigInternal(companyContext.slug, userId);
    if (!userEmailConfig) {
      res.status(400).json({ 
        message: "Usuario no tiene configuración de email habilitada" 
      });
      return;
    }

    // Preparar contenido HTML con firma
    const htmlContent = html || `<div>${text.replace(/\n/g, '<br>')}</div>`;
    const finalHtml = `${htmlContent}<br><br>${userEmailConfig.signature}`;

    // Datos para enviar al endpoint de email existente
    const emailData = {
      to,
      subject,
      text,
      html: finalHtml,
      smtpConfig: userEmailConfig.smtpConfig
    };

    // Aquí puedes llamar directamente a la función sendEmail del email.controller
    // O hacer una petición HTTP interna al endpoint existente
    res.json({
      success: true,
      message: "Email configurado para envío",
      emailData: {
        to: emailData.to,
        subject: emailData.subject,
        from: userEmailConfig.smtpConfig.user,
        hasSignature: !!userEmailConfig.signature,
        provider: userEmailConfig.smtpConfig.host
      },
      // Para usar en el frontend: hacer POST a /api/email/send/companySlug con emailData
      endpoint: `/api/email/send/${companyContext.slug}`,
      payload: emailData
    });

  } catch (error) {
    console.error('Error preparing email from user:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
}; 