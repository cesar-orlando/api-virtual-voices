# 🤖 Guía de Agentes ElevenLabs - Nueva Arquitectura

## 📋 Resumen
Esta guía explica cómo el frontend puede trabajar con agentes de ElevenLabs usando la **nueva arquitectura optimizada**. 

### 🏗️ **Nueva Arquitectura:**
- **Base de datos local**: Solo referencias (`agentId`, `companySlug`)
- **Datos reales**: Siempre desde ElevenLabs API
- **Sin duplicación**: Una sola fuente de verdad
- **Siempre actualizado**: Datos frescos en cada consulta

## 🔗 Endpoints Disponibles

### 1. **Listar Agentes (Datos Reales de ElevenLabs)**
```http
GET /api/elevenlabs/agents?companySlug={companySlug}
```

**Respuesta:**
```json
[
  {
    "_id": "68d2c8420b168caf389667e6",
    "agentId": "agent_01jyhmqpg4evz8mhb56qxw6eg2",
    "companySlug": "quicklearning",
    "createdAt": "2025-09-23T16:18:10.771Z",
    // Datos reales de ElevenLabs
    "name": "Quick Learning teacher",
    "prompt": "# Personality\n\nYou are Alex, a friendly...",
    "isActive": true,
    "elevenLabsData": {
      "agent_id": "agent_01jyhmqpg4evz8mhb56qxw6eg2",
      "name": "Quick Learning teacher",
      "conversation_config": { /* Configuración completa */ },
      "platform_settings": { /* Configuración de plataforma */ },
      "tools": [ /* Herramientas */ ],
      "knowledge_base": [ /* Base de conocimiento */ ]
    }
  }
]
```

### 2. **Ver Agente Específico (Datos Reales de ElevenLabs)**
```http
GET /api/elevenlabs/agents/{localAgentId}?companySlug={companySlug}
```

**Respuesta:**
```json
{
  "_id": "68d2c8420b168caf389667e6",
  "agentId": "agent_01jyhmqpg4evz8mhb56qxw6eg2",
  "companySlug": "quicklearning",
  "createdAt": "2025-09-23T16:18:10.771Z",
  "name": "Quick Learning teacher",
  "prompt": "# Personality\n\nYou are Alex, a friendly...",
  "isActive": true,
  "elevenLabsData": { /* Datos completos de ElevenLabs */ }
}
```

### 3. **Importar Agente Existente**
```http
POST /api/elevenlabs/agents?companySlug={companySlug}
```

**Body:**
```json
{
  "name": "Nombre temporal",
  "prompt": "Prompt temporal",
  "agentId": "agent_01jyhmqpg4evz8mhb56qxw6eg2"
}
```

**Respuesta:**
```json
{
  "message": "Agent reference imported successfully",
  "agent": {
    "_id": "68d2c8420b168caf389667e6",
    "agentId": "agent_01jyhmqpg4evz8mhb56qxw6eg2",
    "companySlug": "quicklearning",
    "createdAt": "2025-09-23T16:18:10.771Z"
  },
  "elevenLabsData": { /* Datos reales de ElevenLabs */ },
  "imported": true
}
```

### 4. **Actualizar Agente (Directo en ElevenLabs)**
```http
PUT /api/elevenlabs/agents/{localAgentId}?companySlug={companySlug}
```

**Body:**
```json
{
  "name": "Nuevo Nombre",
  "prompt": "Nuevo Prompt"
}
```

**Respuesta:**
```json
{
  "message": "Agent updated successfully in ElevenLabs",
  "agent": {
    "_id": "68d2c8420b168caf389667e6",
    "agentId": "agent_01jyhmqpg4evz8mhb56qxw6eg2",
    "companySlug": "quicklearning",
    "createdAt": "2025-09-23T16:18:10.771Z"
  },
  "elevenLabsData": { /* Datos actualizados de ElevenLabs */ },
  "updated": true
}
```

## 💻 Implementación en Frontend

### **Función para Listar Agentes (Datos Reales)**
```javascript
const getElevenLabsAgents = async (companySlug) => {
  try {
    const response = await fetch(
      `/api/elevenlabs/agents?companySlug=${companySlug}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const agents = await response.json();
    return agents;
  } catch (error) {
    console.error('Error obteniendo agentes:', error);
    throw error;
  }
};
```

### **Función para Ver Agente Específico**
```javascript
const getElevenLabsAgent = async (localAgentId, companySlug) => {
  try {
    const response = await fetch(
      `/api/elevenlabs/agents/${localAgentId}?companySlug=${companySlug}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const agent = await response.json();
    return agent;
  } catch (error) {
    console.error('Error obteniendo agente:', error);
    throw error;
  }
};
```

### **Función para Importar Agente Existente**
```javascript
const importElevenLabsAgent = async (agentId, companySlug) => {
  try {
    const response = await fetch(
      `/api/elevenlabs/agents?companySlug=${companySlug}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Importando...', // Temporal
          prompt: 'Importando...', // Temporal
          agentId: agentId
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error importando agente:', error);
    throw error;
  }
};
```

### **Función para Actualizar Agente**
```javascript
const updateElevenLabsAgent = async (localAgentId, updateData, companySlug) => {
  try {
    const response = await fetch(
      `/api/elevenlabs/agents/${localAgentId}?companySlug=${companySlug}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData)
      }
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error actualizando agente:', error);
    throw error;
  }
};
```

## 🔄 Flujos de Trabajo

### **1. Importar Agente Existente**
1. Usuario ingresa el **Agent ID de ElevenLabs** (ej: `agent_01jyhmqpg4evz8mhb56qxw6eg2`)
2. Frontend llama a `POST /api/elevenlabs/agents` con el `agentId`
3. Backend verifica que existe en ElevenLabs y crea referencia local
4. Frontend recibe datos reales de ElevenLabs inmediatamente

### **2. Listar Agentes**
1. Frontend llama a `GET /api/elevenlabs/agents`
2. Backend obtiene referencias locales y trae datos reales de ElevenLabs
3. Frontend recibe lista con datos actualizados de ElevenLabs

### **3. Ver Agente Específico**
1. Usuario hace clic en un agente
2. Frontend llama a `GET /api/elevenlabs/agents/{id}`
3. Backend trae datos reales de ElevenLabs
4. Frontend muestra información actualizada

### **4. Editar Agente**
1. Usuario edita nombre o prompt
2. Frontend llama a `PUT /api/elevenlabs/agents/{id}` con cambios
3. Backend actualiza directo en ElevenLabs
4. Frontend recibe confirmación y datos actualizados

## 📝 Ejemplo de Uso Completo

```javascript
// Componente React de ejemplo
import React, { useState, useEffect } from 'react';

const AgentManager = ({ companySlug }) => {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);

  // Cargar agentes existentes
  useEffect(() => {
    loadAgents();
  }, [companySlug]);

  const loadAgents = async () => {
    try {
      setLoading(true);
      const agentsList = await getElevenLabsAgents(companySlug);
      setAgents(agentsList);
    } catch (error) {
      console.error('Error cargando agentes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImportAgent = async (agentId) => {
    try {
      setLoading(true);
      const result = await importElevenLabsAgent(agentId, companySlug);
      
      // Actualizar la lista de agentes
      await loadAgents();
      
      alert('Agente importado exitosamente');
      console.log('Datos de ElevenLabs:', result.elevenLabsData);
    } catch (error) {
      console.error('Error importando agente:', error);
      alert('Error al importar agente');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAgent = async (agentId, updateData) => {
    try {
      setLoading(true);
      const result = await updateElevenLabsAgent(agentId, updateData, companySlug);
      
      // Actualizar la lista de agentes
      await loadAgents();
      
      alert('Agente actualizado exitosamente');
      console.log('Datos actualizados:', result.elevenLabsData);
    } catch (error) {
      console.error('Error actualizando agente:', error);
      alert('Error al actualizar agente');
    } finally {
      setLoading(false);
    }
  };

  const handleViewAgent = async (agentId) => {
    try {
      setLoading(true);
      const agent = await getElevenLabsAgent(agentId, companySlug);
      setSelectedAgent(agent);
    } catch (error) {
      console.error('Error obteniendo agente:', error);
      alert('Error al obtener agente');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Agentes ElevenLabs - Datos Reales</h2>
      {loading && <p>Cargando...</p>}
      
      <div className="agents-list">
        {agents.map(agent => (
          <div key={agent._id} className="agent-card">
            <h3>{agent.name}</h3>
            <p><strong>ID:</strong> {agent.agentId}</p>
            <p><strong>Estado:</strong> {agent.isActive ? 'Activo' : 'Inactivo'}</p>
            <p><strong>Prompt:</strong> {agent.prompt.substring(0, 100)}...</p>
            
            <div className="agent-actions">
              <button 
                onClick={() => handleViewAgent(agent._id)}
                disabled={loading}
              >
                Ver Detalles
              </button>
              
              <button 
                onClick={() => handleUpdateAgent(agent._id, {
                  name: 'Nuevo Nombre',
                  prompt: 'Nuevo Prompt'
                })}
                disabled={loading}
              >
                Actualizar
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedAgent && (
        <div className="agent-details">
          <h3>Detalles del Agente</h3>
          <p><strong>Nombre:</strong> {selectedAgent.name}</p>
          <p><strong>Prompt:</strong></p>
          <pre>{selectedAgent.prompt}</pre>
          <button onClick={() => setSelectedAgent(null)}>Cerrar</button>
        </div>
      )}
    </div>
  );
};

export default AgentManager;
```

## ⚠️ Consideraciones Importantes

### **Manejo de Errores**
- **404**: Agente no encontrado localmente
- **500**: Error interno del servidor
- **422**: Error de validación en ElevenLabs
- **Agente no disponible**: Si ElevenLabs no responde, se muestra como inactivo

### **Validaciones**
- Verificar que `companySlug` esté presente
- Validar que el `localAgentId` sea un ObjectId válido
- Manejar casos donde el agente no existe en ElevenLabs
- Verificar que el `agentId` de ElevenLabs sea válido

### **Estados de Carga**
- Mostrar indicador de carga durante las operaciones
- Deshabilitar botones durante operaciones
- Mostrar mensajes de éxito/error apropiados
- Manejar timeouts de ElevenLabs API

## 🎯 Casos de Uso

1. **Importación de Agentes**: Usuario ingresa Agent ID de ElevenLabs
2. **Visualización en Tiempo Real**: Datos siempre actualizados de ElevenLabs
3. **Edición Directa**: Cambios se aplican inmediatamente en ElevenLabs
4. **Gestión de Referencias**: Solo se guardan referencias locales

## 📊 Datos Retornados

### **Lista de Agentes:**
- **Datos locales**: `_id`, `agentId`, `companySlug`, `createdAt`
- **Datos de ElevenLabs**: `name`, `prompt`, `isActive`, `elevenLabsData`

### **Agente Específico:**
- **Datos locales**: Referencia básica
- **Datos de ElevenLabs**: Información completa y actualizada

## 🔧 Configuración Requerida

- **API Key**: `ELEVENLABS_API_KEY` configurada en el backend
- **Company Slug**: Identificador de la empresa
- **Autenticación**: Headers de autorización si es necesario

## 🚀 Ventajas de la Nueva Arquitectura

1. **📦 Base de datos ligera**: Solo referencias, no duplicación
2. **🔄 Datos siempre actualizados**: Directo de ElevenLabs
3. **⚡ Mejor rendimiento**: No sincronización manual
4. **🛡️ Menos errores**: Una sola fuente de verdad
5. **🔧 Fácil mantenimiento**: Cambios directo en ElevenLabs
6. **💾 Menos almacenamiento**: No duplicar datos grandes

---

**¿Necesitas ayuda con la implementación?** Contacta al equipo de backend para soporte técnico.
