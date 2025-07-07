import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getEnvironmentConfig } from '../config/environments';
import { initializeProjects } from '../shared/projectManager';
import { getProjectConfig } from '../shared/projectManager';
import { getDbConnection } from '../config/connectionManager';
import getUserModel from '../core/users/user.model';

async function testLoginFlow() {
  console.log('🔐 Probando flujo de login completo...\n');

  try {
    // 1. Cargar configuración
    console.log('1️⃣ Cargando configuración...');
    const config = getEnvironmentConfig();
    console.log('   - JWT Secret:', config.jwtSecret ? 'Configurado' : 'No configurado');
    
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

    // 5. Buscar usuario
    console.log('5️⃣ Buscando usuario...');
    const conn = await getDbConnection('quicklearning');
    const User = getUserModel(conn);

    const existingUser = await User.findOne({ email: 'admin@quicklearning.com' });
    if (!existingUser) {
      console.log('❌ Usuario admin@quicklearning.com no encontrado');
      return;
    }

    console.log('✅ Usuario encontrado:');
    console.log('   - ID:', existingUser._id);
    console.log('   - Email:', existingUser.email);
    console.log('   - Role:', existingUser.role);
    console.log('   - Company Slug:', existingUser.companySlug);

    // 6. Probar contraseña
    console.log('\n6️⃣ Probando contraseña...');
    const password = 'QuickLearning2024!';
    const passwordMatch = await bcrypt.compare(password, existingUser.password);
    console.log(`   Contraseña "${password}": ${passwordMatch ? '✅ MATCH' : '❌ NO MATCH'}`);

    if (!passwordMatch) {
      console.log('❌ La contraseña no coincide');
      return;
    }

    // 7. Simular login del sistema legacy
    console.log('\n7️⃣ Simulando login del sistema legacy...');
    
    // Verificar si el email existe
    if (!existingUser.email) {
      console.log('❌ Error: existingUser.email es falsy');
      return;
    }

    // Generar JWT como lo hace el sistema legacy
    const JWT_SECRET = config.jwtSecret;
    const userId = (existingUser._id as any).toString();
    
    const token = jwt.sign(
      {
        sub: userId,
        email: existingUser.email,
        name: existingUser.name,
        role: existingUser.role,
        c_name: 'quicklearning',
        id: userId,
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    console.log('✅ JWT generado exitosamente:');
    console.log('   - Token:', token.substring(0, 50) + '...');
    console.log('   - Length:', token.length);

    // 8. Verificar JWT
    console.log('\n8️⃣ Verificando JWT...');
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      console.log('✅ JWT válido:');
      console.log('   - sub:', decoded.sub);
      console.log('   - email:', decoded.email);
      console.log('   - c_name:', decoded.c_name);
      console.log('   - role:', decoded.role);
    } catch (jwtError) {
      console.log('❌ Error verificando JWT:', jwtError);
    }

    // 9. Simular respuesta del sistema legacy
    console.log('\n9️⃣ Respuesta del sistema legacy:');
    const response = {
      id: userId,
      name: existingUser.name,
      email: existingUser.email,
      role: existingUser.role,
      c_name: 'quicklearning',
      token,
    };

    console.log('✅ Respuesta generada:');
    console.log('   - id:', response.id);
    console.log('   - name:', response.name);
    console.log('   - email:', response.email);
    console.log('   - role:', response.role);
    console.log('   - c_name:', response.c_name);
    console.log('   - token:', response.token.substring(0, 50) + '...');

    // 10. Probar con curl
    console.log('\n🔗 Comando curl para probar:');
    console.log(`curl -X POST http://localhost:3001/api/users/login \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"email":"admin@quicklearning.com","password":"QuickLearning2024!"}'`);

    console.log('\n🎉 ¡Prueba de login completada!');

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

// Ejecutar script
testLoginFlow(); 