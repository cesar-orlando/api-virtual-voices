import { Request, Response } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import getUserModel, { IUser } from "./user.model";
import getMinutosControlModel from "./minutosControl.model";
import getElevenLabsCallModel from "./elevenLabs.model";
import { getDbConnection, getConnectionByCompanySlug } from "../../config/connectionManager";
import { getCurrentCompanyContext, requireCompanyContext } from "../auth/companyMiddleware";
import { hasFeature } from "../../shared/projectManager";

const saltRound = 10;
const JWT_SECRET = process.env.JWT_SECRET || "changeme";

// Get all users for a company
export const getAllCompanyUsers = async (req: Request, res: Response) => {
  try {
    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    const conn = await getDbConnection(companyContext.slug);
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
        const conn = await getDbConnection(dbName);
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

    const conn = await getDbConnection(companyContext.slug);
    const User = getUserModel(conn);
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
    const conn = await getDbConnection(realDbName);
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
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Update a user by ID
export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, role } = req.body;
    const companyContext = getCurrentCompanyContext(req);
    
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    const conn = await getDbConnection(companyContext.slug);
    const User = getUserModel(conn);

    const updateData: any = { name, email, role };
    if (password) {
      if (password.length < 10) {
        res.status(400).json({ message: "La contraseña debe tener al menos 10 caracteres" });
        return;
      }
      updateData.password = await bcrypt.hash(password, saltRound);
    }

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

    const conn = await getDbConnection(companyContext.slug);
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

      const conn = await getDbConnection(dbName);
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
        // Generate JWT token
        const token = jwt.sign(
          {
            sub: existingUser._id,
            email: existingUser.email,
            name: existingUser.name,
            role: existingUser.role,
            c_name: dbName,
            id: existingUser._id,
          },
          JWT_SECRET,
          { expiresIn: "1h" }
        );
        res.json({
          id: existingUser._id,
          name: existingUser.name,
          email: existingUser.email,
          role: existingUser.role,
          c_name: dbName,
          token,
        });
        console.log(
          "Inicio de sesión exitoso para el usuario:",
          existingUser.name
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

    const conn = await getDbConnection(companyContext.slug);
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

    const conn = await getDbConnection(companyContext.slug);
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

export { login, register, getProfile, updateProfile }; 