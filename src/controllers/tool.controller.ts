import { Request, Response } from "express";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import getToolModel, { getToolExecutionModel, getToolCategoryModel } from "../models/tool.model";
import { 
  ITool, 
  ToolExecutionRequest, 
  BatchExecutionRequest,
  DEFAULT_CATEGORIES,
  COMPANY_LIMITS 
} from "../types/tool.types";


// Crear una nueva herramienta
export const createTool = async (req: Request, res: Response) => {
  const { name, displayName, description, category, c_name, createdBy, config, parameters, responseMapping, security } = req.body;

  if (!name || !displayName || !description || !category || !c_name || !createdBy || !config || !parameters) {
    res.status(400).json({ 
      message: "name, displayName, description, category, c_name, createdBy, config, and parameters are required" 
    });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Tool = getToolModel(conn);

    // Crear herramienta
    const newTool = new Tool({
      name,
      displayName,
      description,
      category,
      c_name,
      createdBy,
      config,
      parameters,
      responseMapping,
      security: security || {}
    });

    await newTool.save();

    res.status(201).json({ 
      message: "Tool created successfully", 
      tool: newTool 
    });
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      res.status(409).json({ message: error.message });
    } else if (error.message.includes('not allowed')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: "Error creating tool", error: error.message });
    }
  }
};

// Obtener todas las herramientas de una empresa
export const getTools = async (req: Request, res: Response) => {
  const { c_name } = req.params;
  const { 
    page = 1, 
    limit = 10, 
    category, 
    isActive,
    sortBy = 'createdAt', 
    sortOrder = 'desc' 
  } = req.query;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Tool = getToolModel(conn);

    // Construir filtros
    const filter: any = { c_name };
    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    // Configurar paginación y ordenamiento
    const skip = (Number(page) - 1) * Number(limit);
    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

    // Obtener herramientas con paginación
    const tools = await Tool.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .lean();

    // Contar total
    const total = await Tool.countDocuments(filter);

    res.json({
      tools,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching tools", error });
  }
};

// Obtener una herramienta específica
export const getToolById = async (req: Request, res: Response) => {
  const { id, c_name } = req.params;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Tool = getToolModel(conn);

    const tool = await Tool.findOne({ _id: id, c_name });

    if (!tool) {
      res.status(404).json({ message: "Tool not found" });
      return;
    }

    res.json({ tool });
  } catch (error) {
    res.status(500).json({ message: "Error fetching tool", error });
  }
};

// Actualizar una herramienta
export const updateTool = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { updatedBy, ...updateData } = req.body;

  if (!updatedBy) {
    res.status(400).json({ message: "updatedBy is required" });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(updateData.c_name || req.body.c_name);
    const Tool = getToolModel(conn);

    // Buscar herramienta existente
    const existingTool = await Tool.findOne({ _id: id, c_name: updateData.c_name || req.body.c_name });
    if (!existingTool) {
      res.status(404).json({ message: "Tool not found" });
      return;
    }

    // Actualizar herramienta
    Object.assign(existingTool, updateData, { updatedBy });
    await existingTool.save();

    res.json({ 
      message: "Tool updated successfully", 
      tool: existingTool 
    });
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      res.status(409).json({ message: error.message });
    } else if (error.message.includes('not allowed')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: "Error updating tool", error: error.message });
    }
  }
};

// Eliminar herramienta (soft delete)
export const deleteTool = async (req: Request, res: Response) => {
  const { id, c_name } = req.params;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Tool = getToolModel(conn);

    const tool = await Tool.findOneAndUpdate(
      { _id: id, c_name },
      { isActive: false },
      { new: true }
    );

    if (!tool) {
      res.status(404).json({ message: "Tool not found" });
      return;
    }

    res.json({ 
      message: "Tool deactivated successfully", 
      tool 
    });
  } catch (error) {
    res.status(500).json({ message: "Error deactivating tool", error });
  }
};

// Activar/desactivar herramienta
export const toggleToolStatus = async (req: Request, res: Response) => {
  const { id, c_name } = req.params;
  const { isActive } = req.body;

  if (typeof isActive !== 'boolean') {
    res.status(400).json({ message: "isActive must be a boolean" });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Tool = getToolModel(conn);

    const tool = await Tool.findOneAndUpdate(
      { _id: id, c_name },
      { isActive },
      { new: true }
    );

    if (!tool) {
      res.status(404).json({ message: "Tool not found" });
      return;
    }

    res.json({ 
      message: `Tool ${isActive ? 'activated' : 'deactivated'} successfully`, 
      tool 
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating tool status", error });
  }
};

// Obtener categorías disponibles
export const getCategories = async (req: Request, res: Response) => {
  const { c_name } = req.params;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const ToolCategory = getToolCategoryModel(conn);

    // Obtener categorías personalizadas de la empresa
    const customCategories = await ToolCategory.find({ c_name, isActive: true }).lean();
    
    // Combinar con categorías por defecto
    const allCategories = [
      ...DEFAULT_CATEGORIES,
      ...customCategories.map((cat: any) => ({
        name: cat.name,
        displayName: cat.displayName,
        description: cat.description
      }))
    ];

    res.json({ categories: allCategories });
  } catch (error) {
    res.status(500).json({ message: "Error fetching categories", error });
  }
};

// Crear nueva categoría
export const createCategory = async (req: Request, res: Response) => {
  const { name, displayName, description, c_name } = req.body;

  if (!name || !displayName || !c_name) {
    res.status(400).json({ message: "name, displayName, and c_name are required" });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const ToolCategory = getToolCategoryModel(conn);

    const newCategory = new ToolCategory({
      name,
      displayName,
      description,
      c_name
    });

    await newCategory.save();

    res.status(201).json({ 
      message: "Category created successfully", 
      category: newCategory 
    });
  } catch (error: any) {
    if (error.code === 11000) { // Duplicate key error
      res.status(409).json({ message: "Category name already exists for this company" });
    } else {
      res.status(500).json({ message: "Error creating category", error: error.message });
    }
  }
};

// Probar herramienta
export const testTool = async (req: Request, res: Response) => {
  const { id, c_name } = req.params;
  const { testParameters } = req.body;



  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Tool = getToolModel(conn);

    const tool = await Tool.findOne({ _id: id, c_name });
    if (!tool) {
      res.status(404).json({ message: "Tool not found" });
      return;
    }

    // Ejecutar herramienta (implementación básica para test)
    const startTime = Date.now();
    try {
      // Aquí iría la lógica de ejecución real
      const mockResponse = {
        success: true,
        data: { message: "Test execution successful", parameters: testParameters },
        statusCode: 200,
        executionTime: Date.now() - startTime
      };
      res.json({ 
        message: "Tool test completed", 
        result: mockResponse 
      });
    } catch (execError) {
      res.status(500).json({ 
        message: "Tool execution failed", 
        error: execError 
      });
    }
  } catch (error) {
    res.status(500).json({ message: "Error testing tool", error });
  }
};

// Validar schema de parámetros
export const validateSchema = async (req: Request, res: Response) => {
  const { parameters } = req.body;

  if (!parameters || typeof parameters !== 'object') {
    res.status(400).json({ message: "parameters object is required" });
    return;
  }

  try {
    const errors: string[] = [];

    // Validar estructura básica
    if (!parameters.type || parameters.type !== 'object') {
      errors.push("parameters.type must be 'object'");
    }

    if (!parameters.properties || typeof parameters.properties !== 'object') {
      errors.push("parameters.properties is required and must be an object");
    }

    if (!Array.isArray(parameters.required)) {
      errors.push("parameters.required must be an array");
    }

    // Validar propiedades
    if (parameters.properties) {
      for (const [key, prop] of Object.entries(parameters.properties)) {
        if (typeof prop !== 'object' || !prop) {
          errors.push(`Property '${key}' must be an object`);
          continue;
        }

        const property = prop as any;
        if (!property.type || !['string', 'number', 'boolean', 'array'].includes(property.type)) {
          errors.push(`Property '${key}' must have a valid type`);
        }

        if (!property.description) {
          errors.push(`Property '${key}' must have a description`);
        }
      }
    }

    res.json({ 
      isValid: errors.length === 0, 
      errors 
    });
  } catch (error) {
    res.status(500).json({ message: "Error validating schema", error });
  }
};

// Validar endpoint
export const validateEndpoint = async (req: Request, res: Response) => {
  const { endpoint, method = 'GET', timeout = 5000 } = req.body;

  if (!endpoint) {
    res.status(400).json({ message: "endpoint is required" });
    return;
  }

  try {
    const startTime = Date.now();
    
    // Validación básica de URL
    let url: URL;
    try {
      if (endpoint.startsWith('/')) {
        // Path relativo - crear URL base para validación
        url = new URL('http://localhost' + endpoint);
      } else {
        url = new URL(endpoint);
      }
    } catch {
      res.status(400).json({ 
        message: "Invalid endpoint format", 
        isValid: false 
      });
      return;
    }

    // Para endpoints externos, hacer una validación real (opcional)
    if (endpoint.startsWith('http')) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(endpoint, {
          method: method,
          signal: controller.signal,
          headers: { 'User-Agent': 'Tool-Validator/1.0' }
        });

        clearTimeout(timeoutId);
        
        res.json({
          isValid: true,
          status: response.status,
          statusText: response.statusText,
          responseTime: Date.now() - startTime
        });
      } catch (fetchError: any) {
        res.json({
          isValid: false,
          error: fetchError.message,
          responseTime: Date.now() - startTime
        });
      }
    } else {
      // Para paths relativos, solo validar formato
      res.json({
        isValid: true,
        message: "Relative path format is valid"
      });
    }
  } catch (error) {
    res.status(500).json({ message: "Error validating endpoint", error });
  }
};

// Ejecutar herramienta individual
export const executeTool = async (req: Request, res: Response) => {
  const { toolName, parameters, c_name, executedBy }: ToolExecutionRequest = req.body;

  if (!toolName || !c_name) {
    res.status(400).json({ message: "toolName and c_name are required" });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Tool = getToolModel(conn);
    const ToolExecution = getToolExecutionModel(conn);

    // Buscar herramienta
    const tool = await Tool.findOne({ name: toolName, c_name, isActive: true });
    if (!tool) {
      res.status(404).json({ message: "Tool not found or inactive" });
      return;
    }

    const startTime = Date.now();
    let executionResult;

    try {
      // Aquí iría la lógica real de ejecución de herramientas
      // Por ahora, mock response
      executionResult = {
        success: true,
        data: { message: "Tool executed successfully", parameters },
        statusCode: 200,
        executionTime: Date.now() - startTime
      };

      // Guardar log de ejecución
      const execution = new ToolExecution({
        toolId: tool._id,
        toolName: tool.name,
        c_name,
        parameters: parameters || {},
        response: executionResult,
        executedBy
      });
      await execution.save();

      res.json({ 
        message: "Tool executed successfully", 
        result: executionResult 
      });
    } catch (execError: any) {
      executionResult = {
        success: false,
        error: execError.message,
        statusCode: 500,
        executionTime: Date.now() - startTime
      };

      // Guardar log de error
      const execution = new ToolExecution({
        toolId: tool._id,
        toolName: tool.name,
        c_name,
        parameters: parameters || {},
        response: executionResult,
        executedBy
      });
      await execution.save();

      res.status(500).json({ 
        message: "Tool execution failed", 
        result: executionResult 
      });
    }
  } catch (error) {
    res.status(500).json({ message: "Error executing tool", error });
  }
};

// Ejecutar múltiples herramientas
export const batchExecuteTools = async (req: Request, res: Response) => {
  const { tools, c_name, executedBy }: BatchExecutionRequest = req.body;

  if (!tools || !Array.isArray(tools) || !c_name) {
    res.status(400).json({ message: "tools array and c_name are required" });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Tool = getToolModel(conn);

    const results = [];

    for (const toolExec of tools) {
      try {
        // Buscar herramienta
        const tool = await Tool.findOne({ 
          name: toolExec.toolName, 
          c_name, 
          isActive: true 
        });

        if (!tool) {
          results.push({
            toolName: toolExec.toolName,
            success: false,
            error: "Tool not found or inactive"
          });
          continue;
        }

        // Ejecutar herramienta (mock por ahora)
        const startTime = Date.now();
        const executionResult = {
          success: true,
          data: { message: "Tool executed successfully", parameters: toolExec.parameters },
          statusCode: 200,
          executionTime: Date.now() - startTime
        };

        results.push({
          toolName: toolExec.toolName,
          ...executionResult
        });
      } catch (error: any) {
        results.push({
          toolName: toolExec.toolName,
          success: false,
          error: error.message
        });
      }
    }

    res.json({ 
      message: "Batch execution completed", 
      results 
    });
  } catch (error) {
    res.status(500).json({ message: "Error in batch execution", error });
  }
};

// Obtener schema de OpenAI para una empresa
export const getOpenAISchema = async (req: Request, res: Response) => {
  const { c_name } = req.params;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Tool = getToolModel(conn);

    // Obtener herramientas activas
    const tools = await Tool.find({ c_name, isActive: true }).lean();
    
    // Generar schemas para OpenAI
    const schema = tools.map((tool: any) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: tool.parameters.type,
          properties: Object.fromEntries(
            Object.entries(tool.parameters.properties).map(([key, value]: [string, any]) => [
              key,
              {
                type: value.type,
                description: value.description,
                ...(value.enum && { enum: value.enum }),
                ...(value.format && { format: value.format })
              }
            ])
          ),
          required: tool.parameters.required
        }
      }
    }));

    res.json({ 
      c_name,
      toolsCount: schema.length,
      schema 
    });
  } catch (error) {
    res.status(500).json({ message: "Error generating OpenAI schema", error });
  }
};

// Obtener analytics de uso
export const getAnalytics = async (req: Request, res: Response) => {
  const { c_name } = req.params;
  const { startDate, endDate } = req.query;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const ToolExecution = getToolExecutionModel(conn);

    // Construir filtros de fecha
    const dateFilter: any = { c_name };
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate as string);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate as string);
    }

    // Agregar estadísticas
    const stats = await ToolExecution.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$toolName",
          totalExecutions: { $sum: 1 },
          successfulExecutions: { $sum: { $cond: ["$response.success", 1, 0] } },
          failedExecutions: { $sum: { $cond: ["$response.success", 0, 1] } },
          averageExecutionTime: { $avg: "$response.executionTime" },
          lastExecuted: { $max: "$createdAt" }
        }
      },
      { $sort: { totalExecutions: -1 } }
    ]);

    res.json({ 
      c_name,
      period: { startDate, endDate },
      stats 
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching analytics", error });
  }
};

// Obtener logs de ejecución de una herramienta
export const getToolLogs = async (req: Request, res: Response) => {
  const { toolId, c_name } = req.params;
  const { page = 1, limit = 50 } = req.query;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const ToolExecution = getToolExecutionModel(conn);

    const skip = (Number(page) - 1) * Number(limit);

    const logs = await ToolExecution.find({ toolId, c_name })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await ToolExecution.countDocuments({ toolId, c_name });

    res.json({
      logs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching tool logs", error });
  }
};

