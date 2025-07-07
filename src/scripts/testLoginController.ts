import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getEnvironmentConfig } from '../config/environments';
import { initializeProjects } from '../shared/projectManager';
import { getAllProjects } from '../shared/projectManager';
import getUserModel from '../core/users/user.model';

async function testLoginController() {
  console.log('🔐 Probando controlador de login directamente...\n');

  try {
    // 1. Cargar configuración
    console.log('1️⃣ Cargando configuración...');
    const config = getEnvironmentConfig();
    
    // 2. Inicializar proyectos
    console.log('2️⃣ Inicializando proyectos...');
    initializeProjects();

    // 3. Obtener proyectos
    console.log('3️⃣ Obteniendo proyectos...');
    const projects = getAllProjects();
    console.log(`   - Proyectos encontrados: ${projects.length}`);
    projects.forEach(project => {
      console.log(`     * ${project.name} (${project.slug})`);
    });

    // 4. Simular datos de login
    const email = 'admin@quicklearning.com';
    const password = 'QuickLearning2024!';
    
    console.log(`\n4️⃣ Simulando login con:`);
    console.log(`   - Email: ${email}`);
    console.log(`   - Password: ${password}`);

    // 5. Buscar en proyectos configurados
    console.log('\n5️⃣ Buscando en proyectos configurados...');
    
    for (const project of projects) {
      try {
        console.log(`   - Buscando en proyecto: ${project.name} (${project.slug})`);
        
        // Conectar directamente a la base de datos del proyecto
        const projectUri = project.databaseUri;
        console.log(`     URI original: ${projectUri}`);
        
        // Modificar la URI para especificar la base de datos
        const uriWithDb = projectUri.replace('/?', `/${project.slug}?`);
        console.log(`     URI modificada: ${uriWithDb}`);
        
        const projectConn = await mongoose.createConnection(uriWithDb).asPromise();
        console.log(`     ✅ Conexión exitosa`);
        
        const User = getUserModel(projectConn);
        const existingUser = await User.findOne({ email });

        if (existingUser) {
          console.log(`     ✅ Usuario encontrado:`);
          console.log(`        - ID: ${existingUser._id}`);
          console.log(`        - Name: ${existingUser.name}`);
          console.log(`        - Email: ${existingUser.email}`);
          console.log(`        - Role: ${existingUser.role}`);
          console.log(`        - Company Slug: ${existingUser.companySlug}`);

          if (!existingUser.email) {
            console.log(`     ❌ Error: existingUser.email es falsy`);
            await projectConn.close();
            continue;
          }

          const passwordMatch = await bcrypt.compare(password, existingUser.password);
          console.log(`     - Contraseña coincide: ${passwordMatch ? '✅ SÍ' : '❌ NO'}`);

          if (!passwordMatch) {
            console.log(`     ❌ Contraseña incorrecta`);
            await projectConn.close();
            continue;
          }

          // Generate JWT token
          const JWT_SECRET = config.jwtSecret;
          const token = jwt.sign(
            {
              sub: existingUser._id,
              email: existingUser.email,
              name: existingUser.name,
              role: existingUser.role,
              c_name: project.slug,
              id: existingUser._id,
            },
            JWT_SECRET,
            { expiresIn: "1h" }
          );

          console.log(`\n🎉 ¡Login exitoso!`);
          console.log(`   - Proyecto: ${project.name}`);
          console.log(`   - Usuario: ${existingUser.name}`);
          console.log(`   - Email: ${existingUser.email}`);
          console.log(`   - Role: ${existingUser.role}`);
          console.log(`   - Company: ${project.slug}`);
          console.log(`   - Token: ${token.substring(0, 50)}...`);

          await projectConn.close();
          return;
        } else {
          console.log(`     - Usuario no encontrado`);
        }
        
        await projectConn.close();
      } catch (error) {
        console.error(`     ❌ Error en proyecto ${project.name}:`, error);
      }
    }

    console.log('\n❌ No se encontró usuario en ningún proyecto');

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
testLoginController(); 