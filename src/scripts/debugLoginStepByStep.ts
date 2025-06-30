import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { getEnvironmentConfig } from '../config/environments';
import { initializeProjects } from '../shared/projectManager';
import { getProjectConfig } from '../shared/projectManager';
import { getDbConnection } from '../config/connectionManager';
import getUserModel from '../core/users/user.model';

async function debugLoginStepByStep() {
  console.log('🔍 Debuggeando login paso a paso...\n');

  try {
    // 1. Cargar configuración
    console.log('1️⃣ Cargando configuración...');
    const config = getEnvironmentConfig();
    
    // 2. Inicializar proyectos
    console.log('2️⃣ Inicializando proyectos...');
    initializeProjects();

    // 3. Verificar configuración de Quick Learning
    console.log('3️⃣ Verificando configuración de Quick Learning...');
    const quickLearningConfig = getProjectConfig('quicklearning');
    
    if (!quickLearningConfig) {
      throw new Error('❌ Configuración de Quick Learning no encontrada');
    }

    console.log('   - Roles disponibles:', quickLearningConfig.roles);

    // 4. Conectar a MongoDB de Quick Learning
    console.log('4️⃣ Conectando a MongoDB de Quick Learning...');
    await mongoose.connect(quickLearningConfig.databaseUri);
    console.log('✅ Conexión exitosa');

    // 5. Simular el flujo de login del controlador
    console.log('5️⃣ Simulando flujo de login del controlador...');
    
    const email = 'admin@quicklearning.com';
    const password = 'QuickLearning2024!';
    
    console.log(`   - Email: ${email}`);
    console.log(`   - Password: ${password}`);

    // 6. Obtener todas las bases de datos
    console.log('6️⃣ Obteniendo todas las bases de datos...');
    if (!mongoose.connection.db) {
      console.log('❌ No hay conexión a la base de datos');
      return;
    }

    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();
    
    console.log('   - Bases de datos encontradas:');
    dbs.databases.forEach((db: any) => {
      console.log(`     * ${db.name}`);
    });

    // 7. Buscar usuario en cada base de datos
    console.log('7️⃣ Buscando usuario en cada base de datos...');
    
    for (const dbInfo of dbs.databases) {
      const dbName = dbInfo.name;
      if (dbName === "admin" || dbName === "local") {
        console.log(`   - Saltando ${dbName} (base de datos del sistema)`);
        continue;
      }

      console.log(`   - Buscando en ${dbName}...`);
      
      try {
        const conn = await getDbConnection(dbName);
        const User = getUserModel(conn);
        const existingUser = await User.findOne({ email });

        if (existingUser) {
          console.log(`   ✅ Usuario encontrado en ${dbName}:`);
          console.log(`      - ID: ${existingUser._id}`);
          console.log(`      - Name: ${existingUser.name}`);
          console.log(`      - Email: ${existingUser.email}`);
          console.log(`      - Role: ${existingUser.role}`);
          console.log(`      - Company Slug: ${existingUser.companySlug}`);
          console.log(`      - Status: ${existingUser.status}`);

          // Verificar si el email existe
          if (!existingUser.email) {
            console.log(`   ❌ Error: existingUser.email es falsy`);
            continue;
          }

          // Verificar contraseña
          console.log(`   - Verificando contraseña...`);
          const passwordMatch = await bcrypt.compare(password, existingUser.password);
          console.log(`   - Contraseña coincide: ${passwordMatch ? '✅ SÍ' : '❌ NO'}`);

          if (!passwordMatch) {
            console.log(`   ❌ Contraseña incorrecta para ${dbName}`);
            continue;
          }

          console.log(`   ✅ Login exitoso en ${dbName}!`);
          console.log(`   - Usuario válido: ${existingUser.name}`);
          console.log(`   - Base de datos: ${dbName}`);
          
          return; // Salir del bucle si encontramos el usuario
        } else {
          console.log(`   - No se encontró usuario en ${dbName}`);
        }
      } catch (error) {
        console.log(`   ❌ Error buscando en ${dbName}:`, error);
      }
    }

    console.log('❌ No se encontró usuario en ninguna base de datos');

  } catch (error) {
    console.error('\n❌ Error durante el debug:', error);
    process.exit(1);
  } finally {
    // Cerrar conexión
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('\n🔌 Conexión cerrada');
    }
    process.exit(0);
  }
}

// Ejecutar script
debugLoginStepByStep(); 