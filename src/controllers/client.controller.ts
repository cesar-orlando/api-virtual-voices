import { Request, Response } from "express";
import Client from "../models/client.model";

// Get all clients
export const getAllClients = async (req: Request, res: Response) => {
  const clients = await Client.find();
  res.json(clients);
};

// Get a single client by ID
export const getClientById = async (req: Request, res: Response): Promise<void> => {
  const client = await Client.findById(req.params.id);
  if (!client) {
    res.status(404).json({ message: "Client not found" });
    return 
  }
  res.json(client);
};

// Create a new client
export const createClient = async (req: Request, res: Response): Promise<void> => {
  const { name, email } = req.body;
  if (!name || !email) {
    res.status(400).json({ message: "Name and email are required" });
    return
  }

  const newClient = new Client({ name, email });
  await newClient.save();
  res.status(201).json(newClient);
};

// Update a client by ID
export const updateClient = async (req: Request, res: Response): Promise<void> => {
  const { name, email } = req.body;
  const updatedClient = await Client.findByIdAndUpdate(
    req.params.id,
    { name, email },
    { new: true, runValidators: true }
  );

  if (!updatedClient) {
    res.status(404).json({ message: "Client not found" });
    return
  }

  res.json(updatedClient);
};

// Delete a client by ID
export const deleteClient = async (req: Request, res: Response): Promise<void> => {
  const deletedClient = await Client.findByIdAndDelete(req.params.id);
  if (!deletedClient) {
    res.status(404).json({ message: "Client not found" });
    return
  }
  res.status(204).send();
};