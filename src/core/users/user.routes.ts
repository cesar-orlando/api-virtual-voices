import { Router } from "express";
import {
  login,
  register,
  getProfile,
  updateProfile,
  getUsers,
  getAllUsersFromAllCompanies,
  updateUser,
  getUserById,
  getAvailableBranches,
  assignBranchToUser,
  removeBranchFromUser,
  getUsersByBranch,
  updateEmailConfig,
  getEmailConfig,
  deleteEmailConfig,
  sendEmailFromUser
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

/**
 * @swagger
 * /api/core/users:
 *   get:
 *     summary: Obtener todos los usuarios de una empresa
 *     description: Retorna todos los usuarios de la empresa especificada. Excluye contraseñas por seguridad.
 *     tags: [Usuarios]
 *     parameters:
 *       - in: query
 *         name: companySlug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug de la empresa (quicklearning, test, etc.)
 *         examples:
 *           quickLearning:
 *             value: "quicklearning"
 *             summary: Quick Learning Enterprise
 *           regularCompany:
 *             value: "test"
 *             summary: Empresa Regular
 *     responses:
 *       200:
 *         description: Lista de usuarios obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: number
 *                   description: Número total de usuarios
 *                   example: 5
 *                 companySlug:
 *                   type: string
 *                   description: Slug de la empresa
 *                   example: "quicklearning"
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       400:
 *         description: companySlug requerido
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
router.get("/", detectCompanyFromToken, getUsers);

/**
 * @swagger
 * /api/core/users/all:
 *   get:
 *     summary: Obtener todos los usuarios de todas las empresas (Admin)
 *     description: Retorna todos los usuarios de todas las empresas. Solo para administradores.
 *     tags: [Usuarios]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista completa de usuarios obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: number
 *                   description: Número total de usuarios
 *                   example: 15
 *                 users:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/User'
 *                       - type: object
 *                         properties:
 *                           companySlug:
 *                             type: string
 *                             description: Slug de la empresa
 *                             example: "quicklearning"
 *                           companyName:
 *                             type: string
 *                             description: Nombre de la empresa
 *                             example: "Quick Learning Enterprise"
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/all", getAllUsersFromAllCompanies);

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
router.get("/me", detectCompanyFromToken, getProfile);

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
router.put("/me/update", detectCompanyFromToken, updateProfile);

// Agregar endpoint para actualizar usuario por ID
router.put("/:id", detectCompanyFromToken, updateUser);

// Agregar endpoint para consultar usuario por ID
router.get("/:id", detectCompanyFromToken, getUserById);

// ===== RUTAS PARA MANEJO DE SUCURSALES EN USUARIOS =====

// Agregar endpoint para obtener sucursales disponibles
router.get("/branches/available", detectCompanyFromToken, getAvailableBranches);

// Asignar sucursal a usuario
router.post("/:userId/assign-branch", detectCompanyFromToken, assignBranchToUser);

// Remover sucursal de usuario
router.delete("/:userId/remove-branch", detectCompanyFromToken, removeBranchFromUser);

// Obtener usuarios por sucursal
router.get("/by-branch/:branchId", detectCompanyFromToken, getUsersByBranch);

// ===== RUTAS PARA CONFIGURACIÓN DE EMAIL =====

// Obtener configuración de email del usuario
router.get("/:userId/email-config", detectCompanyFromToken, getEmailConfig);

// Actualizar configuración de email del usuario
router.put("/:userId/email-config", detectCompanyFromToken, updateEmailConfig);

// Eliminar configuración de email del usuario
router.delete("/:userId/email-config", detectCompanyFromToken, deleteEmailConfig);

// Enviar email usando la configuración del usuario
router.post("/:userId/send-email", detectCompanyFromToken, sendEmailFromUser);

export default router; 