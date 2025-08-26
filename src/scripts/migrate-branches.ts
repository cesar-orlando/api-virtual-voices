/**
 * SCRIPT DE MIGRACIÓN: SUCURSALES EMBEBIDAS A COLECCIÓN SEPARADA
 * 
 * Este script migra las sucursales embebidas en el modelo Company
 * hacia una colección independiente Branch con referencias por ObjectId.
 * 
 * IMPORTANTE: Hacer respaldo de la base de datos antes de ejecutar.
 */

import mongoose from "mongoose";
import { getConnectionByCompanySlug, getDbConnection } from "../config/connectionManager";
import getCompanyModel from "../models/company.model";
import getBranchModel from "../models/branch.model";

interface CompanyWithEmbeddedBranches {
  _id: any;
  name: string;
  address?: string;
  phone?: string;
  branches: Array<{
    _id?: any;
    name: string;
    code: string;
    address?: string;
    phone?: string;
    isActive: boolean;
    manager?: {
      id: any;
      name: string;
    };
    metadata?: any;
  }>;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Migrar una empresa específica
 */
export async function migrateCompanyBranches(companySlug: string) {
  console.log(`\n🔄 Iniciando migración para empresa: ${companySlug}`);
  
  try {
    const conn = await getConnectionByCompanySlug(companySlug);
    const Company = getCompanyModel(conn);
    const Branch = getBranchModel(conn);

    // Buscar la empresa con sucursales embebidas
    const company = await Company.findOne().lean() as CompanyWithEmbeddedBranches;
    
    if (!company) {
      console.log(`❌ Empresa no encontrada: ${companySlug}`);
      return { success: false, error: "Company not found" };
    }

    if (!company.branches || company.branches.length === 0) {
      console.log(`ℹ️ No hay sucursales embebidas para migrar en: ${companySlug}`);
      return { success: true, migratedCount: 0 };
    }

    console.log(`📊 Encontradas ${company.branches.length} sucursales embebidas`);

    // Migrar cada sucursal embebida a documento independiente
    const migratedBranches = [];
    
    for (const embeddedBranch of company.branches) {
      // Verificar si ya existe una sucursal con el mismo código
      const existingBranch = await Branch.findOne({ 
        companyId: company._id, 
        code: embeddedBranch.code 
      });

      if (existingBranch) {
        console.log(`⚠️ Sucursal ya existe: ${embeddedBranch.name} (${embeddedBranch.code}) - Saltando`);
        continue;
      }

      // Crear nueva sucursal independiente
      const newBranch = new Branch({
        companyId: company._id,
        name: embeddedBranch.name,
        code: embeddedBranch.code,
        address: embeddedBranch.address,
        phone: embeddedBranch.phone,
        isActive: embeddedBranch.isActive !== false, // Default true si no está definido
        manager: embeddedBranch.manager,
        metadata: embeddedBranch.metadata || {},
        // Preservar timestamps si existen en el documento embebido
        createdAt: (embeddedBranch as any).createdAt || new Date(),
        updatedAt: (embeddedBranch as any).updatedAt || new Date()
      });

      await newBranch.save();
      migratedBranches.push(newBranch);
      
      console.log(`✅ Migrada: ${newBranch.name} (${newBranch.code}) -> ID: ${newBranch._id}`);
    }

    console.log(`\n📈 Migración completada: ${migratedBranches.length} sucursales creadas`);

    return { 
      success: true, 
      migratedCount: migratedBranches.length,
      branches: migratedBranches.map(b => ({ _id: b._id, name: b.name, code: b.code }))
    };

  } catch (error) {
    console.error(`❌ Error en migración de ${companySlug}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Limpiar sucursales embebidas después de migración exitosa
 */
export async function cleanupEmbeddedBranches(companySlug: string) {
  console.log(`\n🧹 Limpiando sucursales embebidas de: ${companySlug}`);
  
  try {
    const conn = await getConnectionByCompanySlug(companySlug);
    const Company = getCompanyModel(conn);

    // Remover el campo branches del documento de empresa
    const result = await Company.updateOne(
      {},
      { $unset: { branches: "" } }
    );

    if (result.modifiedCount > 0) {
      console.log(`✅ Campo 'branches' removido del documento de empresa`);
      return { success: true };
    } else {
      console.log(`ℹ️ No se encontró campo 'branches' para remover`);
      return { success: true };
    }

  } catch (error) {
    console.error(`❌ Error limpiando sucursales embebidas:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Verificar integridad de la migración
 */
export async function verifyMigration(companySlug: string) {
  console.log(`\n🔍 Verificando migración para: ${companySlug}`);
  
  try {
    const conn = await getConnectionByCompanySlug(companySlug);
    const Company = getCompanyModel(conn);
    const Branch = getBranchModel(conn);

    const company = await Company.findOne();
    if (!company) {
      console.log(`❌ Empresa no encontrada: ${companySlug}`);
      return { success: false, error: "Company not found" };
    }

    // Contar sucursales independientes
    const independentBranchesCount = await Branch.countDocuments({ companyId: company._id });
    const activeBranchesCount = await Branch.countDocuments({ companyId: company._id, isActive: true });

    // Verificar si aún existen sucursales embebidas
    const companyDoc = company.toObject();
    const hasEmbeddedBranches = companyDoc.branches && companyDoc.branches.length > 0;

    console.log(`📊 Resultados de verificación:`);
    console.log(`   - Sucursales independientes: ${independentBranchesCount}`);
    console.log(`   - Sucursales activas: ${activeBranchesCount}`);
    console.log(`   - Sucursales embebidas restantes: ${hasEmbeddedBranches ? companyDoc.branches.length : 0}`);

    return {
      success: true,
      stats: {
        independentBranches: independentBranchesCount,
        activeBranches: activeBranchesCount,
        hasEmbeddedBranches,
        embeddedBranchesCount: hasEmbeddedBranches ? companyDoc.branches.length : 0
      }
    };

  } catch (error) {
    console.error(`❌ Error verificando migración:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Ejecutar migración completa para una empresa
 */
export async function runFullMigration(companySlug: string, options = { cleanup: false }) {
  console.log(`\n🚀 INICIANDO MIGRACIÓN COMPLETA PARA: ${companySlug.toUpperCase()}`);
  console.log(`⚙️ Opciones: cleanup=${options.cleanup}`);
  
  // Paso 1: Migrar sucursales
  const migrationResult = await migrateCompanyBranches(companySlug);
  if (!migrationResult.success) {
    console.log(`❌ Migración fallida, abortando proceso`);
    return migrationResult;
  }

  // Paso 2: Verificar migración
  const verificationResult = await verifyMigration(companySlug);
  if (!verificationResult.success) {
    console.log(`❌ Verificación fallida`);
    return verificationResult;
  }

  // Paso 3: Limpiar (opcional)
  let cleanupResult;
  if (options.cleanup) {
    cleanupResult = await cleanupEmbeddedBranches(companySlug);
    if (!cleanupResult.success) {
      console.log(`⚠️ Limpieza fallida, pero migración completada`);
    }
  }

  console.log(`\n🎉 MIGRACIÓN COMPLETA FINALIZADA`);
  return {
    success: true,
    migration: migrationResult,
    verification: verificationResult,
    cleanup: cleanupResult
  };
}

/**
 * Script de ejecución principal
 */
async function main() {
  const companySlug = process.argv[2];
  const cleanup = process.argv.includes('--cleanup');

  if (!companySlug) {
    console.log(`
📖 USO:
  npm run migrate-branches <company-slug> [--cleanup]

📋 EJEMPLOS:
  npm run migrate-branches "EMPRESA_DEMO"           # Solo migrar
  npm run migrate-branches "EMPRESA_DEMO" --cleanup # Migrar y limpiar

⚠️ IMPORTANTE: Hacer respaldo antes de usar --cleanup
    `);
    process.exit(1);
  }

  try {
    await runFullMigration(companySlug, { cleanup });
    console.log(`\n✅ Proceso completado exitosamente`);
    process.exit(0);
  } catch (error) {
    console.error(`❌ Error en proceso principal:`, error);
    process.exit(1);
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  main();
}
