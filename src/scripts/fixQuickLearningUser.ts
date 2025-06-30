import mongoose from 'mongoose';
import { getEnvironmentConfig } from '../config/environments';
import { initializeProjects } from '../shared/projectManager';
import { getProjectConfig } from '../shared/projectManager';
import { getDbConnection } from '../config/connectionManager';
import getUserModel from '../core/users/user.model';

async function fixQuickLearningUser() {
  console.log('🔧 Arreglando usuario de Quick Learning...\n');

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

    // 5. Buscar y actualizar usuario
    console.log('5️⃣ Buscando y actualizando usuario...');
    const conn = await getDbConnection('quicklearning');
    const User = getUserModel(conn);

    const existingUser = await User.findOne({ email: 'admin@quicklearning.com' });
    if (!existingUser) {
      console.log('❌ Usuario admin@quicklearning.com no encontrado');
      return;
    }

    console.log('✅ Usuario encontrado:');
    console.log('   - ID:', existingUser._id);
    console.log('   - Name:', existingUser.name);
    console.log('   - Email:', existingUser.email);
    console.log('   - Role:', existingUser.role);
    console.log('   - Company Slug (antes):', existingUser.companySlug);

    // 6. Actualizar companySlug si no existe
    if (!existingUser.companySlug) {
      console.log('6️⃣ Actualizando companySlug...');
      existingUser.companySlug = 'quicklearning';
      await existingUser.save();
      console.log('✅ Company Slug actualizado a: quicklearning');
    } else {
      console.log('✅ Company Slug ya existe:', existingUser.companySlug);
    }

    // 7. Verificar usuario actualizado
    console.log('\n7️⃣ Verificando usuario actualizado...');
    const updatedUser = await User.findOne({ email: 'admin@quicklearning.com' });
    console.log('✅ Usuario actualizado:');
    console.log('   - ID:', updatedUser?._id);
    console.log('   - Name:', updatedUser?.name);
    console.log('   - Email:', updatedUser?.email);
    console.log('   - Role:', updatedUser?.role);
    console.log('   - Company Slug (después):', updatedUser?.companySlug);
    console.log('   - Status:', updatedUser?.status);

    console.log('\n🎉 ¡Usuario arreglado exitosamente!');
    console.log('\n📋 Credenciales:');
    console.log('   Email: admin@quicklearning.com');
    console.log('   Password: QuickLearning2024!');
    console.log('   Role: admin');
    console.log('   Company: quicklearning');

  } catch (error) {
    console.error('\n❌ Error durante la corrección:', error);
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
fixQuickLearningUser(); 