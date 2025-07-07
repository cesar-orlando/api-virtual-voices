import { ProjectConfig, CompanyContext } from './types';

// Cache de configuraciones por empresa
const projectConfigs: Map<string, ProjectConfig> = new Map();

// Registrar configuraciones de proyectos
export function registerProject(config: ProjectConfig): void {
  projectConfigs.set(config.slug, config);
  console.log(`✅ Proyecto registrado: ${config.name} (${config.slug})`);
}

// Obtener configuración de proyecto por slug
export function getProjectConfig(slug: string): ProjectConfig | null {
  return projectConfigs.get(slug) || null;
}

// Obtener contexto de empresa por slug
export function getCompanyContext(slug: string): CompanyContext | null {
  const config = getProjectConfig(slug);
  if (!config) return null;

  return {
    slug: config.slug,
    name: config.name,
    config,
    database: slug // Por ahora usamos el slug como nombre de DB
  };
}

// Verificar si una empresa tiene una funcionalidad específica
export function hasFeature(slug: string, feature: keyof ProjectConfig['features']): boolean {
  const config = getProjectConfig(slug);
  return config?.features[feature] || false;
}

// Obtener configuración personalizada de una empresa
export function getCustomConfig(slug: string, key: string): any {
  const config = getProjectConfig(slug);
  return config?.customConfig?.[key] || null;
}

// Listar todos los proyectos registrados
export function getAllProjects(): ProjectConfig[] {
  return Array.from(projectConfigs.values());
}

// Verificar si un proyecto existe
export function projectExists(slug: string): boolean {
  return projectConfigs.has(slug);
}

// Inicializar proyectos (se llama al arrancar la app)
export function initializeProjects(): void {
  console.log('🚀 Inicializando proyectos...');
  
  // Importar y registrar Quick Learning
  try {
    const { quickLearningConfig } = require('../projects/quicklearning/config');
    registerProject(quickLearningConfig);
  } catch (error) {
    console.warn('⚠️ No se pudo cargar configuración de Quick Learning:', error);
  }

  console.log(`📊 Proyectos cargados: ${projectConfigs.size}`);
} 