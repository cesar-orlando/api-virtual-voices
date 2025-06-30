import { Router } from "express";
import { login, register, getProfile, updateProfile } from "./user.controller";

const router = Router();

/**
 * @swagger
 * /api/core/users/login:
 *   post:
 *     summary: Iniciar sesión de usuario
 *     description: Autentica un usuario y devuelve un JWT token. Soporta Quick Learning Enterprise y empresas regulares.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *           examples:
 *             quicklearning:
 *               summary: Quick Learning Admin
 *               value:
 *                 email: admin@quicklearning.com
 *                 password: QuickLearning2024!
 *                 companySlug: quicklearning
 *             regular:
 *               summary: Usuario Regular
 *               value:
 *                 email: korina@gmail.com
 *                 password: Korina1234567890.
 *                 companySlug: test
 *     responses:
 *       200:
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Credenciales faltantes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Credenciales inválidas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Usuario inactivo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/login", login);

/**
 * @swagger
 * /api/core/users/register:
 *   post:
 *     summary: Registrar nuevo usuario
 *     description: Crea una nueva cuenta de usuario. Quick Learning se conecta a base de datos enterprise separada.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *           examples:
 *             quicklearning:
 *               summary: Nuevo usuario Quick Learning
 *               value:
 *                 name: Quick Learning Admin
 *                 email: admin@quicklearning.com
 *                 password: QuickLearning2024!
 *                 role: Admin
 *                 companySlug: quicklearning
 *             regular:
 *               summary: Nuevo usuario regular
 *               value:
 *                 name: Test User
 *                 email: test@example.com
 *                 password: password123
 *                 role: Usuario
 *                 companySlug: test
 *     responses:
 *       201:
 *         description: Usuario creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Campos requeridos faltantes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Usuario ya existe
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/register", register);

/**
 * @swagger
 * /api/core/users/profile:
 *   get:
 *     summary: Obtener perfil de usuario
 *     description: Obtiene información del perfil del usuario autenticado
 *     tags: [User Profile]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/profile", getProfile);

/**
 * @swagger
 * /api/core/users/profile:
 *   put:
 *     summary: Actualizar perfil de usuario
 *     description: Actualiza información del perfil del usuario autenticado
 *     tags: [User Profile]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nuevo nombre del usuario
 *               password:
 *                 type: string
 *                 description: Nueva contraseña del usuario
 *           example:
 *             name: Nuevo Nombre
 *             password: nuevaPassword123
 *     responses:
 *       200:
 *         description: Perfil actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put("/profile", updateProfile);

export default router;