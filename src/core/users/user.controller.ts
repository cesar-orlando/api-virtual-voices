import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getConnectionByCompanySlug } from "../../config/connectionManager";
import getUserModel from "../../models/user.model";

// Función para obtener el JWT secret específico por empresa
function getJWTSecret(companySlug?: string): string {
  if (companySlug === "quicklearning") {
    return process.env.JWT_SECRET_QUICKLEARNING || "changeme";
  }
  
  // Para otros usuarios, usar el JWT secret del entorno actual
  const { getEnvironmentConfig } = require("../../config/environments");
  const config = getEnvironmentConfig();
  return config.jwtSecret || "changeme";
}

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, role, companySlug } = req.body;
    if (!name || !email || !password || !role) {
      res.status(400).json({ message: "Missing required fields" });
      return;
    }
    const connection = await getConnectionByCompanySlug(companySlug);
    const User = getUserModel(connection);
    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ message: "User already exists" });
      return;
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashed,
      role,
      companySlug,
      status: 1,
    });
    res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      companySlug: user.companySlug,
      status: user.status,
    });
  } catch (err: any) {
    res.status(500).json({ message: "Registration error", error: err.message });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, companySlug } = req.body;
    if (!email || !password) {
      res.status(400).json({ message: "Missing credentials" });
      return;
    }
    const connection = await getConnectionByCompanySlug(companySlug);
    const User = getUserModel(connection);
    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }
    if (user.status !== 1) {
      res.status(403).json({ message: "User is not active" });
      return;
    }
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        companySlug: user.companySlug,
      },
      getJWTSecret(companySlug),
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
  } catch (err: any) {
    res.status(500).json({ message: "Login error", error: err.message });
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
  } catch (err: any) {
    res.status(500).json({ message: "Profile error", error: err.message });
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
  } catch (err: any) {
    res.status(500).json({ message: "Update error", error: err.message });
  }
};