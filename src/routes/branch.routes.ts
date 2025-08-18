import { Router } from "express";
import {
  createBranch,
  getBranchesByCompany,
  getBranchById,
  updateBranch,
  deleteBranch,
  toggleBranchStatus,
  getBranchStats
} from "../controllers/branch.controller";

const router = Router();

// ===== RUTAS PARA GESTIÓN DE SUCURSALES =====

/**
 * @swagger
 * components:
 *   schemas:
 *     Branch:
 *       type: object
 *       required:
 *         - companyId
 *         - name
 *         - code
 *       properties:
 *         _id:
 *           type: string
 *           description: ID único de la sucursal
 *         companyId:
 *           type: string
 *           description: ID de la empresa propietaria
 *         name:
 *           type: string
 *           description: Nombre de la sucursal
 *         code:
 *           type: string
 *           description: Código único de la sucursal (por empresa)
 *         address:
 *           type: string
 *           description: Dirección física
 *         phone:
 *           type: string
 *           description: Teléfono de contacto
 *         email:
 *           type: string
 *           description: Email de la sucursal
 *         isActive:
 *           type: boolean
 *           description: Estado activo/inactivo
 *         manager:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               description: ID del usuario gerente
 *             name:
 *               type: string
 *               description: Nombre del gerente
 *         metadata:
 *           type: object
 *           description: Datos adicionales
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/companies/{c_name}/branches:
 *   post:
 *     summary: Crear nueva sucursal
 *     tags: [Branches]
 *     parameters:
 *       - in: path
 *         name: c_name
 *         required: true
 *         schema:
 *           type: string
 *         description: Nombre de la empresa
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - code
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Sucursal Norte"
 *               code:
 *                 type: string
 *                 example: "NOR"
 *               address:
 *                 type: string
 *                 example: "Av. Principal 123"
 *               phone:
 *                 type: string
 *                 example: "+52 33 1234 5678"
 *               email:
 *                 type: string
 *                 example: "norte@empresa.com"
 *               isActive:
 *                 type: boolean
 *                 default: true
 *               manager:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *     responses:
 *       201:
 *         description: Sucursal creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 branch:
 *                   $ref: '#/components/schemas/Branch'
 */
router.post("/:c_name/branches", createBranch);

/**
 * @swagger
 * /api/companies/{c_name}/branches:
 *   get:
 *     summary: Obtener todas las sucursales de una empresa
 *     tags: [Branches]
 *     parameters:
 *       - in: path
 *         name: c_name
 *         required: true
 *         schema:
 *           type: string
 *         description: Nombre de la empresa
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filtrar por estado activo
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Buscar en nombre, código o dirección
 *     responses:
 *       200:
 *         description: Lista de sucursales
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 branches:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Branch'
 *                 total:
 *                   type: number
 *                 company:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     name:
 *                       type: string
 */
router.get("/:c_name/branches", getBranchesByCompany);

/**
 * @swagger
 * /api/companies/{c_name}/branches/stats:
 *   get:
 *     summary: Obtener estadísticas de sucursales
 *     tags: [Branches]
 *     parameters:
 *       - in: path
 *         name: c_name
 *         required: true
 *         schema:
 *           type: string
 *         description: Nombre de la empresa
 *     responses:
 *       200:
 *         description: Estadísticas de sucursales
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     active:
 *                       type: number
 *                     inactive:
 *                       type: number
 *                     withManagers:
 *                       type: number
 *                     withoutManagers:
 *                       type: number
 */
router.get("/:c_name/branches/stats", getBranchStats);

/**
 * @swagger
 * /api/companies/{c_name}/branches/{branchId}:
 *   get:
 *     summary: Obtener sucursal por ID
 *     tags: [Branches]
 *     parameters:
 *       - in: path
 *         name: c_name
 *         required: true
 *         schema:
 *           type: string
 *         description: Nombre de la empresa
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la sucursal
 *     responses:
 *       200:
 *         description: Datos de la sucursal
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 branch:
 *                   $ref: '#/components/schemas/Branch'
 */
router.get("/:c_name/branches/:branchId", getBranchById);

/**
 * @swagger
 * /api/companies/{c_name}/branches/{branchId}:
 *   put:
 *     summary: Actualizar sucursal
 *     tags: [Branches]
 *     parameters:
 *       - in: path
 *         name: c_name
 *         required: true
 *         schema:
 *           type: string
 *         description: Nombre de la empresa
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la sucursal
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *               address:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               manager:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *     responses:
 *       200:
 *         description: Sucursal actualizada exitosamente
 */
router.put("/:c_name/branches/:branchId", updateBranch);

/**
 * @swagger
 * /api/companies/{c_name}/branches/{branchId}:
 *   delete:
 *     summary: Eliminar sucursal
 *     tags: [Branches]
 *     parameters:
 *       - in: path
 *         name: c_name
 *         required: true
 *         schema:
 *           type: string
 *         description: Nombre de la empresa
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la sucursal
 *       - in: query
 *         name: force
 *         schema:
 *           type: boolean
 *         description: Forzar eliminación (incluso si es la última sucursal activa)
 *     responses:
 *       200:
 *         description: Sucursal eliminada exitosamente
 */
router.delete("/:c_name/branches/:branchId", deleteBranch);

/**
 * @swagger
 * /api/companies/{c_name}/branches/{branchId}/toggle-status:
 *   patch:
 *     summary: Cambiar estado activo/inactivo de sucursal
 *     tags: [Branches]
 *     parameters:
 *       - in: path
 *         name: c_name
 *         required: true
 *         schema:
 *           type: string
 *         description: Nombre de la empresa
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la sucursal
 *     responses:
 *       200:
 *         description: Estado cambiado exitosamente
 */
router.patch("/:c_name/branches/:branchId/toggle-status", toggleBranchStatus);

export default router;
