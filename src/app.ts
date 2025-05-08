import express from "express";
import cors from "cors";
import tableRoutes from "./routes/table.routes";
import dynamicRecordRoutes from "./routes/record.routes";

const app = express();

app.use(cors());
app.use(express.json());

// Rutas para tablas
app.use("/api/tables", tableRoutes);

// Rutas para registros dinámicos
app.use("/api/records", dynamicRecordRoutes);

app.get("/", (req, res) => {
    res.json({
      status: "ok",
      code: 200,
      message: "Sistema operativo: Virtual Voices Node Engine v2.4",
      uptime: `${Math.floor(process.uptime())}s`,
      trace: "XJ-85::Verified",
    });
  });
  
export default app;