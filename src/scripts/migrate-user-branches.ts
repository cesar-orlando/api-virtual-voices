/**
 * SCRIPT DE MIGRACIÓN: REFERENCIAS DE SUCURSALES EN USUARIOS
 * 
 * Este script actualiza las referencias de sucursales en los usuarios
 * para que usen el nuevo formato con branchId (ObjectId) en lugar del 
 * antiguo formato con id (string).
 * 
 * IMPORTANTE: Ejecutar después de migrar las sucursales a colección independiente.
 */

import mongoose from "mongoose";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import getUserModel from "../core/users/user.model";
import getBranchModel from "../models/branch.model";
import getCompanyModel from "../models/company.model";

interface UserWithOldBranch {
  _id: any;
  name: string;
  email: string;
  branch?: {
    id?: string;      // Formato antiguo
    branchId?: any;   // Formato nuevo
    name: string;
    code: string;
  };
}

/**
 * Migrar referencias de sucursales en usuarios de una empresa
 */
export async function migrateUserBranchReferences(companySlug: string) {
  console.log(`\n🔄 Migrando referencias de sucursales en usuarios: ${companySlug}`);
  
  try {
    const conn = await getConnectionByCompanySlug(companySlug);
    const User = getUserModel(conn);
    const Branch = getBranchModel(conn);
    const Company = getCompanyModel(conn);

    // Obtener la empresa
    const company = await Company.findOne();
    if (!company) {
      console.log(`❌ Empresa no encontrada: ${companySlug}`);
      return { success: false, error: "Company not found" };
    }

    // Buscar usuarios con sucursales asignadas (formato antiguo o nuevo)
    const usersWithBranches = await User.find({
      branch: { $exists: true, $ne: null }
    }).lean() as UserWithOldBranch[];

    console.log(`📊 Encontrados ${usersWithBranches.length} usuarios con sucursales asignadas`);

    if (usersWithBranches.length === 0) {
      console.log(`ℹ️ No hay usuarios con sucursales para migrar en: ${companySlug}`);
      return { success: true, migratedCount: 0, skippedCount: 0 };
    }

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const user of usersWithBranches) {
      try {
        // Verificar si ya tiene el formato nuevo
        if (user.branch?.branchId && mongoose.Types.ObjectId.isValid(user.branch.branchId)) {
          console.log(`⏭️ Usuario ya migrado: ${user.name}`);
          skippedCount++;
          continue;
        }

        // Si tiene el formato antiguo con 'id' string
        if (user.branch?.id && typeof user.branch.id === 'string') {
          // Buscar la sucursal por código (más confiable que por ID antiguo)
          let branch = await Branch.findOne({
            companyId: company._id,
            code: user.branch.code
          });

          // Si no se encuentra por código, intentar por nombre
          if (!branch) {
            branch = await Branch.findOne({
              companyId: company._id,
              name: user.branch.name
            });
          }

          if (!branch) {
            console.log(`⚠️ Sucursal no encontrada para usuario ${user.name}: ${user.branch.name} (${user.branch.code})`);
            errorCount++;
            continue;
          }

          // Actualizar con el nuevo formato
          await User.updateOne(
            { _id: user._id },
            {
              $set: {
                'branch.branchId': branch._id,
                'branch.name': branch.name,
                'branch.code': branch.code
              },
              $unset: {
                'branch.id': ""  // Remover el campo antiguo
              }
            }
          );

          console.log(`✅ Usuario migrado: ${user.name} -> ${branch.name} (${branch.code})`);
          migratedCount++;
        } else {
          // Formato desconocido
          console.log(`❓ Formato de sucursal desconocido para usuario: ${user.name}`, user.branch);
          errorCount++;
        }
      } catch (userError) {
        console.error(`❌ Error procesando usuario ${user.name}:`, userError);
        errorCount++;
      }
    }

    console.log(`\n📈 Migración de usuarios completada:`);
    console.log(`   - Migrados: ${migratedCount}`);
    console.log(`   - Ya estaban migrados: ${skippedCount}`);
    console.log(`   - Errores: ${errorCount}`);

    return { 
      success: true, 
      migratedCount,
      skippedCount,
      errorCount,
      totalProcessed: usersWithBranches.length
    };

  } catch (error) {
    console.error(`❌ Error en migración de usuarios de ${companySlug}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Verificar integridad de referencias de sucursales en usuarios
 */
export async function verifyUserBranchReferences(companySlug: string) {
  console.log(`\n🔍 Verificando referencias de sucursales en usuarios: ${companySlug}`);
  
  try {
    const conn = await getConnectionByCompanySlug(companySlug);
    const User = getUserModel(conn);
    const Branch = getBranchModel(conn);

    // Contar usuarios con sucursales
    const usersWithBranches = await User.countDocuments({
      branch: { $exists: true, $ne: null }
    });

    // Contar usuarios con formato nuevo
    const usersWithNewFormat = await User.countDocuments({
      'branch.branchId': { $exists: true }
    });

    // Contar usuarios con formato antiguo
    const usersWithOldFormat = await User.countDocuments({
      'branch.id': { $exists: true }
    });

    // Verificar referencias rotas
    const brokenReferences = [];
    const usersWithBranchData = await User.find({
      'branch.branchId': { $exists: true }
    }).lean();

    for (const user of usersWithBranchData) {
      const branchExists = await Branch.findById(user.branch.branchId);
      if (!branchExists) {
        brokenReferences.push({
          userId: user._id,
          userName: user.name,
          branchId: user.branch.branchId,
          branchName: user.branch.name
        });
      }
    }

    console.log(`📊 Resultados de verificación:`);
    console.log(`   - Total usuarios con sucursales: ${usersWithBranches}`);
    console.log(`   - Con formato nuevo: ${usersWithNewFormat}`);
    console.log(`   - Con formato antiguo: ${usersWithOldFormat}`);
    console.log(`   - Referencias rotas: ${brokenReferences.length}`);

    if (brokenReferences.length > 0) {
      console.log(`⚠️ Referencias rotas encontradas:`);
      brokenReferences.forEach(ref => {
        console.log(`   - ${ref.userName}: ${ref.branchName} (ID: ${ref.branchId})`);
      });
    }

    return {
      success: true,
      stats: {
        totalWithBranches: usersWithBranches,
        newFormat: usersWithNewFormat,
        oldFormat: usersWithOldFormat,
        brokenReferences: brokenReferences.length
      },
      brokenReferences
    };

  } catch (error) {
    console.error(`❌ Error verificando referencias de usuarios:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Limpiar referencias rotas de sucursales en usuarios
 */
export async function cleanupBrokenUserBranchReferences(companySlug: string) {
  console.log(`\n🧹 Limpiando referencias rotas de sucursales: ${companySlug}`);
  
  try {
    const conn = await getConnectionByCompanySlug(companySlug);
    const User = getUserModel(conn);
    const Branch = getBranchModel(conn);

    const usersWithBranchData = await User.find({
      'branch.branchId': { $exists: true }
    });

    let cleanedCount = 0;

    for (const user of usersWithBranchData) {
      const branchExists = await Branch.findById(user.branch.branchId);
      if (!branchExists) {
        await User.updateOne(
          { _id: user._id },
          { $unset: { branch: "" } }
        );
        console.log(`🗑️ Referencia rota removida: ${user.name} -> ${user.branch.name}`);
        cleanedCount++;
      }
    }

    console.log(`✅ Referencias rotas limpiadas: ${cleanedCount}`);

    return { success: true, cleanedCount };

  } catch (error) {
    console.error(`❌ Error limpiando referencias rotas:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Ejecutar migración completa de usuarios
 */
export async function runFullUserBranchMigration(companySlug: string, options = { cleanup: false }) {
  console.log(`\n🚀 INICIANDO MIGRACIÓN DE USUARIOS PARA: ${companySlug.toUpperCase()}`);
  console.log(`⚙️ Opciones: cleanup=${options.cleanup}`);
  
  // Paso 1: Migrar referencias
  const migrationResult = await migrateUserBranchReferences(companySlug);
  if (!migrationResult.success) {
    console.log(`❌ Migración de usuarios fallida, abortando proceso`);
    return migrationResult;
  }

  // Paso 2: Verificar migración
  const verificationResult = await verifyUserBranchReferences(companySlug);
  if (!verificationResult.success) {
    console.log(`❌ Verificación de usuarios fallida`);
    return verificationResult;
  }

  // Paso 3: Limpiar referencias rotas (opcional)
  let cleanupResult;
  if (options.cleanup && verificationResult.stats.brokenReferences > 0) {
    cleanupResult = await cleanupBrokenUserBranchReferences(companySlug);
    if (!cleanupResult.success) {
      console.log(`⚠️ Limpieza de referencias rotas fallida, pero migración completada`);
    }
  }

  console.log(`\n🎉 MIGRACIÓN DE USUARIOS FINALIZADA`);
  return {
    success: true,
    migration: migrationResult,
    verification: verificationResult,
    cleanup: cleanupResult
  };
}

/**
 * Script de ejecución principal para usuarios
 */
async function main() {
  const companySlug = process.argv[2];
  const cleanup = process.argv.includes('--cleanup');

  if (!companySlug) {
    console.log(`
📖 USO:
  npm run migrate-user-branches <company-slug> [--cleanup]

📋 EJEMPLOS:
  npm run migrate-user-branches "EMPRESA_DEMO"           # Solo migrar
  npm run migrate-user-branches "EMPRESA_DEMO" --cleanup # Migrar y limpiar

⚠️ IMPORTANTE: Ejecutar después de migrar las sucursales principales
    `);
    process.exit(1);
  }

  try {
    await runFullUserBranchMigration(companySlug, { cleanup });
    console.log(`\n✅ Proceso de migración de usuarios completado exitosamente`);
    process.exit(0);
  } catch (error) {
    console.error(`❌ Error en proceso principal de usuarios:`, error);
    process.exit(1);
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  main();
}
