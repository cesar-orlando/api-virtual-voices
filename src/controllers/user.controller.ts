import { Request, Response } from "express";
import getUserModel from "../models/user.model";
import { getDbConnection } from "../config/connectionManager";

// Get all users
export const getAllUsers = async (req: Request, res: Response) => {
  const { c_name } = req.body;
  const dbName = `${c_name}`;
  const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];
  const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");

  const User = getUserModel(conn);
  const users = await User.find();
  res.json(users);
};

// Get a single user by ID
export const getUserById = async (req: Request, res: Response): Promise<void> => {
  const { c_name } = req.params;
  const dbName = `${c_name}`;
  const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];
  const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");

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
  const { name, email, c_name } = req.body;
  if (!name || !email) {
    res.status(400).json({ message: "Name and email are required" });
    return
  }

  const dbName = `${c_name}`;
  const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];
  const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");

  const User = getUserModel(conn);

  const newuser = new User({ name, email });
  await newuser.save();
  res.status(201).json(newuser);
};

// Update a user by ID
export const updateUser = async (req: Request, res: Response): Promise<void> => {
  const { name, email, c_name } = req.body;
  const dbName = `${c_name}`;
  const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];
  const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");

  const User = getUserModel(conn);

  const updatedUser = await User.findByIdAndUpdate(
    req.params.id,
    { name, email },
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
  const dbName = `${c_name}`;
  const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];
  const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");

  const User = getUserModel(conn);

  const deletedUser = await User.findByIdAndDelete(req.params.id);
  if (!deletedUser) {
    res.status(404).json({ message: "user not found" });
    return
  }
  res.status(204).send();
};