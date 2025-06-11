import mongoose, { Connection } from "mongoose";

const connections: Record<string, Connection> = {};

export async function getDbConnection(dbName: string, uriBase: string): Promise<Connection> {
  if (connections[dbName]) return connections[dbName];

  const uri = `${uriBase}/${dbName}`;
  const conn = await mongoose.createConnection(uri).asPromise();

  connections[dbName] = conn;
  return conn;
}