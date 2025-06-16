import mongoose, { Connection } from "mongoose";

const connections: Record<string, Connection> = {};

export async function getDbConnection(dbName: string): Promise<Connection> {
  if (connections[dbName]) return connections[dbName];

  const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];

  const uri = `${uriBase}/${dbName}`;
  const conn = await mongoose.createConnection(uri).asPromise();

  connections[dbName] = conn;
  return conn;
}