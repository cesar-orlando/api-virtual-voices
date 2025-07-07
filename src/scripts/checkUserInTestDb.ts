import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { getEnvironmentConfig } from '../config/environments';
import { initializeProjects } from '../shared/projectManager';
import { getProjectConfig } from '../shared/projectManager';
import { getDbConnection } from '../config/connectionManager';
import getUserModel from '../core/users/user.model';

async function checkUserInTestDb() {
  console.log('🔍 Verificando usuario en base de datos test...\n');

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

    // 4. Conectar a MongoDB de Quick Learning
    console.log('4️⃣ Conectando a MongoDB de Quick Learning...');
    await mongoose.connect(quickLearningConfig.databaseUri);
    console.log('✅ Conexión exitosa');

    // 5. Verificar en qué base de datos estamos
    console.log('5️⃣ Verificando base de datos actual...');
    if (!mongoose.connection.db) {
      console.log('❌ No hay conexión a la base de datos');
      return;
    }
    const currentDb = mongoose.connection.db.databaseName;
    console.log(`   - Base de datos actual: ${currentDb}`);

    // 6. Buscar usuario en la base de datos actual
    console.log('6️⃣ Buscando usuario en la base de datos actual...');
    const conn = await getDbConnection(currentDb);
    const User = getUserModel(conn);

    const existingUser = await User.findOne({ email: 'admin@quicklearning.com' });
    if (existingUser) {
      console.log('✅ Usuario encontrado en la base de datos actual:');
      console.log('   - ID:', existingUser._id);
      console.log('   - Name:', existingUser.name);
      console.log('   - Email:', existingUser.email);
      console.log('   - Role:', existingUser.role);
      console.log('   - Company Slug:', existingUser.companySlug);
      console.log('   - Status:', existingUser.status);

      // Verificar contraseña
      console.log('\n7️⃣ Verificando contraseña...');
      const password = 'QuickLearning2024!';
      const passwordMatch = await bcrypt.compare(password, existingUser.password);
      console.log(`   - Contraseña coincide: ${passwordMatch ? '✅ SÍ' : '❌ NO'}`);

      if (passwordMatch) {
        console.log('\n🎉 ¡Usuario válido encontrado!');
        console.log(`   - Base de datos: ${currentDb}`);
        console.log(`   - Usuario: ${existingUser.name}`);
        console.log(`   - Email: ${existingUser.email}`);
        console.log(`   - Role: ${existingUser.role}`);
      }
    } else {
      console.log('❌ Usuario no encontrado en la base de datos actual');
    }

    // 7. Verificar todas las colecciones en la base de datos actual
    console.log('\n8️⃣ Verificando colecciones en la base de datos actual...');
    if (!mongoose.connection.db) {
      console.log('❌ No hay conexión a la base de datos');
      return;
    }
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('   - Colecciones encontradas:');
    collections.forEach((collection: any) => {
      console.log(`     * ${collection.name}`);
    });

  } catch (error) {
    console.error('\n❌ Error durante la verificación:', error);
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
checkUserInTestDb(); 