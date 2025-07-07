import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { getEnvironmentConfig } from '../config/environments';
import { initializeProjects } from '../shared/projectManager';
import { getProjectConfig } from '../shared/projectManager';
import { getDbConnection } from '../config/connectionManager';
import getUserModel from '../core/users/user.model';

async function debugQuickLearningUser() {
  console.log('🔍 Debuggeando usuario de Quick Learning...\n');

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

    // 5. Buscar usuario existente
    console.log('5️⃣ Buscando usuario existente...');
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
    console.log('   - Company Slug:', existingUser.companySlug);
    console.log('   - Status:', existingUser.status);
    console.log('   - Created At:', existingUser.createdAt);
    console.log('   - Password Hash:', existingUser.password.substring(0, 20) + '...');

    // 6. Probar contraseñas
    console.log('\n6️⃣ Probando contraseñas...');
    
    const testPasswords = [
      'QuickLearning2024!',
      'QuickLearning2024',
      'password123',
      'admin123',
      '1234567890'
    ];

    for (const password of testPasswords) {
      const isMatch = await bcrypt.compare(password, existingUser.password);
      console.log(`   "${password}": ${isMatch ? '✅ MATCH' : '❌ NO MATCH'}`);
    }

    // 7. Crear nueva contraseña si es necesario
    console.log('\n7️⃣ Actualizando contraseña...');
    const newPassword = 'QuickLearning2024!';
    const saltRound = 10;
    const newHashedPassword = await bcrypt.hash(newPassword, saltRound);
    
    existingUser.password = newHashedPassword;
    await existingUser.save();
    
    console.log('✅ Contraseña actualizada a:', newPassword);

    // 8. Verificar que funciona
    console.log('\n8️⃣ Verificando nueva contraseña...');
    const isMatch = await bcrypt.compare(newPassword, existingUser.password);
    console.log(`   Nueva contraseña funciona: ${isMatch ? '✅ SÍ' : '❌ NO'}`);

    console.log('\n🎉 ¡Debug completado!');
    console.log('\n📋 Credenciales actualizadas:');
    console.log('   Email: admin@quicklearning.com');
    console.log('   Password: QuickLearning2024!');
    console.log('   Role: admin');
    console.log('   Company: quicklearning');

  } catch (error) {
    console.error('\n❌ Error durante debug:', error);
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
debugQuickLearningUser(); 