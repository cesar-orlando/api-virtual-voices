#!/usr/bin/env node

/**
 * Script para listar todos los asesores de QuickLearning
 * 
 * Uso: node scripts/list-advisors.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Configuración de conexión
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/quicklearning';

async function listAdvisors() {
  try {
    console.log("🔍 Conectando a la base de datos...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Conectado a MongoDB");
    
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Buscar todos los usuarios con rol de asesor
    const advisors = await usersCollection.find({
      role: 'Asesor',
      status: 'active',
      companySlug: 'quicklearning'
    }).toArray();
    
    console.log(`\n👥 ASESORES DE QUICKLEARNING (${advisors.length} encontrados):`);
    console.log("=".repeat(80));
    
    if (advisors.length === 0) {
      console.log("❌ No se encontraron asesores activos");
      return;
    }
    
    for (const advisor of advisors) {
      console.log(`\n👨‍💼 ${advisor.name}`);
      console.log(`📧 Email: ${advisor.email}`);
      console.log(`🆔 ID: ${advisor._id}`);
      console.log(`📅 Creado: ${advisor.createdAt ? new Date(advisor.createdAt).toLocaleString() : 'N/A'}`);
      console.log(`📅 Actualizado: ${advisor.updatedAt ? new Date(advisor.updatedAt).toLocaleString() : 'N/A'}`);
      console.log("-".repeat(60));
    }
    
    console.log("\n💡 Para analizar las conversaciones de un asesor específico, usa:");
    console.log("node scripts/advisor-conversations.js [ID_DEL_ASESOR]");
    
    console.log("\n✅ Lista completada exitosamente");
    
  } catch (error) {
    console.error("❌ Error obteniendo asesores:", error);
  } finally {
    // Cerrar conexión
    await mongoose.connection.close();
    console.log("🔌 Conexión a la base de datos cerrada");
  }
}

// Ejecutar el script
listAdvisors()
  .then(() => {
    console.log("🎉 Script ejecutado exitosamente");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Error ejecutando script:", error);
    process.exit(1);
  });
