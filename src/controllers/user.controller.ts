import { Request, Response } from "express";
import mongoose from "mongoose";
import getUserModel from "../models/user.model";
import { getDbConnection } from "../config/connectionManager";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"; // Add this at the top if not already imported

const saltRound = 10; // Number of rounds for bcrypt hashing
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"; // Add this at the top

// Get all users
export const getAllUsers = async (req: Request, res: Response) => {
  const { c_name } = req.body;

  const conn = await getDbConnection(c_name);

  const User = getUserModel(conn);
  const users = await User.find();
  res.json(users);
};

// Get a single user by ID
export const getUserById = async (req: Request, res: Response): Promise<void> => {
  const { c_name } = req.params;

  const conn = await getDbConnection(c_name);

  const User = getUserModel(conn);

  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404).json({ message: "user not found" });
    return;
  }
  res.json(user);
};

// Create a new user
export const createUser = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, role, c_name } = req.body;
  if (!name || !email) {
    res.status(400).json({ message: "Name and email are required" });
    return;
  }
  if (!password) {
    res.status(400).json({ message: "Password is required" });
    return;
  }
  if (password.length < 10) {
    res.status(400).json({ message: "Password must be at least 10 characters long" });
    return;
  }
  if (!mongoose.connection.db) {
    res.status(500).json({ message: "Database connection not established" });
    return;
  }

  const admin = mongoose.connection.db.admin();
  const dbs = await admin.listDatabases();
  const dbExists = dbs.databases.some((db: any) => db.name === c_name);

  if (!dbExists) {
    res.status(400).json({ message: "Company database does not exist" });
    return;
  }
  const conn = await getDbConnection(c_name);

  const User = getUserModel(conn);

  const hashedPassword = await bcrypt.hash(password, saltRound);
  const newuser = new User({
    name,
    email,
    password: hashedPassword,
    role,
  });
  await newuser.save();
  res.status(201).json(newuser);
};

// Update a user by ID
export const updateUser = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, c_name } = req.body;

  const conn = await getDbConnection(c_name);

  const User = getUserModel(conn);

  const updatedUser = await User.findByIdAndUpdate(
    req.params.id,
    { name, email, password },
    { new: true, runValidators: true }
  );

  if (!updatedUser) {
    res.status(404).json({ message: "user not found" });
    return;
  }

  res.json(updatedUser);
};

// Delete a user by ID
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  const { c_name } = req.body;
  
  const conn = await getDbConnection(c_name);

  const User = getUserModel(conn);

  const deletedUser = await User.findByIdAndDelete(req.params.id);
  if (!deletedUser) {
    res.status(404).json({ message: "user not found" });
    return
  }
  res.status(204).send();
};

export const compareLogin = async (req: Request, res: Response): Promise<void> => {
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
      const existingUser = await User.findOne({ email });

      if (existingUser) {
        if (!existingUser.email) {
          res.status(400).json({ error: "Credenciales inválidas" });
          return;
        }
        const passwordMatch = await bcrypt.compare(
          password,
          existingUser.password
        );
        if (!passwordMatch) {
          res.status(400).json({ error: "Credenciales inválidas" });
          return;
        }
        // Generate JWT token
        const token = jwt.sign(
          { sub: existingUser._id, email: existingUser.email, name: existingUser.name, role: existingUser.role, c_name: dbName, id: existingUser._id },
          JWT_SECRET,
          { expiresIn: "1h" }
        );
        res.json({
          id: existingUser._id,
          name: existingUser.name,
          email: existingUser.email,
          c_name: dbName,
          token,
        });
        console.log("Inicio de sesión exitoso para el usuario:", existingUser.name);
        return;
      }
    }
    // If no user found
    res.status(400).json({ error: "Credenciales inválidas" });
  } catch (error) {
    res.status(400).json({ message: "Error comparing login" });
    return;
  }
};