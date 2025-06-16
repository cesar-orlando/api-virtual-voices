import { Schema, Document, Connection, Model } from "mongoose";

// Define la interfaz para la tabla
export interface ITable extends Document {
  name: string; // Nombre de la tabla
  slug: string; // Identificador único
  icon: string; // Ícono asociado a la tabla
}

// Define el esquema para la tabla
const TableSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    icon: { type: String, default: "" }, // Campo opcional para el ícono
  },
  {
    timestamps: true, // Agrega createdAt y updatedAt automáticamente
  }
);

// Exporta el modelo
export default function getTableModel(conn: Connection): Model<ITable>{
  return conn.model<ITable>("Table", TableSchema);
}