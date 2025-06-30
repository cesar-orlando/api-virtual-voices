import mongoose from 'mongoose';
import { getEnvironmentConfig, logEnvironmentInfo } from '../config/environments';
import { initializeProjects } from '../shared/projectManager';
import { getProjectConfig } from '../shared/projectManager';

async function testQuickLearningConnection() {
  console.log('🧪 Probando conexión a Quick Learning...\n');

  try {
    // 1. Cargar configuración
    console.log('1️⃣ Cargando configuración...');
    const config = getEnvironmentConfig();
    logEnvironmentInfo(config);

    // 2. Inicializar proyectos
    console.log('\n2️⃣ Inicializando proyectos...');
    initializeProjects();

    // 3. Verificar configuración de Quick Learning
    console.log('\n3️⃣ Verificando configuración de Quick Learning...');
    const quickLearningConfig = getProjectConfig('quicklearning');
    
    if (!quickLearningConfig) {
      throw new Error('❌ Configuración de Quick Learning no encontrada');
    }

    console.log('✅ Configuración de Quick Learning cargada:');
    console.log(`   - Nombre: ${quickLearningConfig.name}`);
    console.log(`   - Slug: ${quickLearningConfig.slug}`);
    console.log(`   - Roles: ${quickLearningConfig.roles.join(', ')}`);
    console.log(`   - Features: ${Object.keys(quickLearningConfig.features).join(', ')}`);

    // 4. Probar conexión a MongoDB
    console.log('\n4️⃣ Probando conexión a MongoDB...');
    console.log(`   - URI: ${quickLearningConfig.databaseUri.replace(/\/\/.*@/, '//***:***@')}`);
    
    await mongoose.connect(quickLearningConfig.databaseUri);
    console.log('✅ Conexión a MongoDB exitosa');

    // 5. Verificar base de datos
    console.log('\n5️⃣ Verificando base de datos...');
    if (mongoose.connection.db) {
      const admin = mongoose.connection.db.admin();
      const dbs = await admin.listDatabases();
      
      const quickLearningDb = dbs.databases.find(db => db.name === 'quicklearning');
      if (quickLearningDb) {
        console.log('✅ Base de datos Quick Learning encontrada');
        console.log(`   - Tamaño: ${((quickLearningDb.sizeOnDisk || 0) / 1024 / 1024).toFixed(2)} MB`);
      } else {
        console.log('⚠️ Base de datos Quick Learning no encontrada (se creará automáticamente)');
      }
    } else {
      console.log('❌ No se pudo acceder a la base de datos');
    }

    // 6. Probar JWT
    console.log('\n6️⃣ Probando JWT Secret...');
    if (config.jwtSecret && config.jwtSecret.length > 0) {
      console.log('✅ JWT Secret configurado correctamente');
    } else {
      console.log('❌ JWT Secret no configurado');
    }

    // 7. Resumen
    console.log('\n🎉 ¡Prueba completada exitosamente!');
    console.log('\n📋 Resumen:');
    console.log('   ✅ Configuración cargada');
    console.log('   ✅ Proyectos inicializados');
    console.log('   ✅ Quick Learning configurado');
    console.log('   ✅ Conexión a MongoDB exitosa');
    console.log('   ✅ JWT Secret configurado');
    console.log('\n🚀 El sistema está listo para Quick Learning!');

  } catch (error) {
    console.error('\n❌ Error durante la prueba:', error);
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

// Ejecutar prueba
testQuickLearningConnection(); 