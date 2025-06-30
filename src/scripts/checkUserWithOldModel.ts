import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { getEnvironmentConfig } from '../config/environments';
import { initializeProjects } from '../shared/projectManager';
import { getProjectConfig } from '../shared/projectManager';
import { getDbConnection } from '../config/connectionManager';

// Importar el modelo antiguo
import getUserModelOld from '../models/user.model';

async function checkUserWithOldModel() {
  console.log('🔍 Verificando usuario con modelo antiguo...\n');

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

    // 6. Buscar usuario con modelo antiguo
    console.log('6️⃣ Buscando usuario con modelo antiguo...');
    const conn = await getDbConnection(currentDb);
    const UserOld = getUserModelOld(conn);

    const existingUser = await UserOld.findOne({ email: 'admin@quicklearning.com' });
    if (existingUser) {
      console.log('✅ Usuario encontrado con modelo antiguo:');
      console.log('   - ID:', existingUser._id);
      console.log('   - Name:', existingUser.name);
      console.log('   - Email:', existingUser.email);
      console.log('   - Role:', existingUser.role);
      console.log('   - Campos adicionales:', Object.keys(existingUser.toObject()));

      // Verificar contraseña
      console.log('\n7️⃣ Verificando contraseña...');
      const password = 'QuickLearning2024!';
      const passwordMatch = await bcrypt.compare(password, existingUser.password);
      console.log(`   - Contraseña coincide: ${passwordMatch ? '✅ SÍ' : '❌ NO'}`);

      if (passwordMatch) {
        console.log('\n🎉 ¡Usuario válido encontrado con modelo antiguo!');
        console.log(`   - Base de datos: ${currentDb}`);
        console.log(`   - Usuario: ${existingUser.name}`);
        console.log(`   - Email: ${existingUser.email}`);
        console.log(`   - Role: ${existingUser.role}`);
      }
    } else {
      console.log('❌ Usuario no encontrado con modelo antiguo');
    }

    // 7. Buscar todos los usuarios en la colección
    console.log('\n8️⃣ Buscando todos los usuarios en la colección...');
    const allUsers = await UserOld.find({});
    console.log(`   - Total de usuarios encontrados: ${allUsers.length}`);
    
    if (allUsers.length > 0) {
      console.log('   - Usuarios:');
      allUsers.forEach((user: any, index: number) => {
        console.log(`     ${index + 1}. ${user.name} (${user.email}) - Role: ${user.role}`);
      });
    }

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
checkUserWithOldModel(); 