import { Request, Response } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import getUserModel, { IUser } from "./user.model";
import getMinutosControlModel from "./minutosControl.model";
import getElevenLabsCallModel from "./elevenLabs.model";
import getCompanyModel from "../../models/company.model";
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
    if (branch) updateData.branch = branch; // NUEVO: Permitir actualizar sucursal
    if (companySlug) updateData.companySlug = companySlug; // NUEVO: Permitir actualizar companySlug
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
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        companySlug: user.companySlug,
        status: user.status,
      },
    });
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

    const company = await Company.findOne();
    if (!company) {
      res.status(404).json({ message: "Company not found" });
      return;
    }

    // Filtrar solo sucursales activas
    const activeBranches = company.branches.filter(branch => branch.isActive);
    
    res.json({ 
      branches: activeBranches.map(branch => ({
        id: branch._id,
        name: branch.name,
        code: branch.code,
        address: branch.address,
        phone: branch.phone,
        isActive: branch.isActive
      }))
    });
  } catch (error) {
    console.error('Error getting available branches:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
}; 