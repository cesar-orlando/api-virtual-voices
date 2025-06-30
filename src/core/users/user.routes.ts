import { Router } from "express";
import {
  login,
  register,
  getProfile,
  updateProfile
} from "./user.controller";
import { detectCompanyFromToken } from "../auth/companyMiddleware";

const router = Router();

/**
 * @swagger
 * /api/core/users/login:
 *   post:
 *     summary: Iniciar sesión en el sistema
 *     description: Permite a los usuarios autenticarse en el sistema usando email, password y companySlug. Quick Learning usa su base de datos enterprise externa.
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *           examples:
 *             quickLearning:
 *               summary: Quick Learning Admin Login
 *               value:
 *                 email: "admin@quicklearning.com"
 *                 password: "QuickLearning2024!"
 *                 companySlug: "quicklearning"
 *             regularCompany:
 *               summary: Empresa Regular Login
 *               value:
 *                 email: "korina@gmail.com"
 *                 password: "Korina1234567890."
 *                 companySlug: "test"
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
 *         description: Usuario no activo
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
 *     description: Permite registrar un nuevo usuario en el sistema. Quick Learning usa su base de datos enterprise externa automáticamente.
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *           examples:
 *             quickLearning:
 *               summary: Quick Learning User Registration
 *               value:
 *                 name: "Quick Learning Admin"
 *                 email: "admin@quicklearning.com"
 *                 password: "QuickLearning2024!"
 *                 role: "Admin"
 *                 companySlug: "quicklearning"
 *             regularCompany:
 *               summary: Registro Empresa Regular
 *               value:
 *                 name: "Usuario Test"
 *                 email: "test@example.com"
 *                 password: "password123"
 *                 role: "Usuario"
 *                 companySlug: "test"
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
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/register", register);

// Middleware para rutas protegidas
router.use(detectCompanyFromToken);

/**
 * @swagger
 * /api/core/users/me:
 *   get:
 *     summary: Obtener perfil del usuario autenticado
 *     description: Retorna la información del perfil del usuario actualmente autenticado
 *     tags: [Perfil de Usuario]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil del usuario
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
 *       404:
 *         description: Usuario no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/me", getProfile);

/**
 * @swagger
 * /api/core/users/me/update:
 *   put:
 *     summary: Actualizar perfil del usuario autenticado
 *     description: Permite al usuario actualizar su nombre y/o contraseña
 *     tags: [Perfil de Usuario]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nuevo nombre del usuario
 *                 example: "Nuevo Nombre"
 *               password:
 *                 type: string
 *                 description: Nueva contraseña
 *                 example: "nuevapassword123"
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
 *       404:
 *         description: Usuario no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put("/me/update", updateProfile);

export default router; 