# 🎯 SISTEMA DE TRANSFERENCIAS INTELIGENTE POR MOTIVO

## 📋 **CONFIGURACIÓN ACTUAL**

### **Números Configurados:**

| Motivo | Número | Descripción |
|--------|--------|-------------|
| **Por Defecto** | `+523131068685` | Asesor general |
| **Visitas/Fotos** | `+523131068685` | Asesor tapatío especializado |
| **Comisiones/Brokers** | `+523319444737` | Lic. Paz Gómez |
| **Empleo/RH** | `+523331222882` | Recursos Humanos |
| **Quejas/Dudas** | `+523131068685` | Asesor especializado |

---

## 🤖 **CONFIGURACIÓN EN ELEVENLABS**

### **1. Tool Configuration**

```json
Name: transfer_to_advisor

Description: 
Transfiere la llamada al departamento correcto según el motivo.
Identifica automáticamente si es visita, comisión, empleo, queja o general.

Parameters:
{
  "advisor_name": {
    "type": "string",
    "required": true,
    "description": "El motivo de la llamada: visita, comisión, broker, empleo, queja, duda, o cualquier descripción"
  }
}

Webhook URL:
https://f46fc203889b.ngrok-free.app/api/elevenlabs-tools/transfer-to-advisor

Method: POST
```

---

### **2. Prompt para el Agent**

```
Cuando el cliente quiera hablar con alguien, identifica su necesidad:

DETECCIÓN AUTOMÁTICA:
- Si menciona "ver una propiedad", "agendar visita", "quiero verla", "fotos":
  → usa transfer_to_advisor con advisor_name="visita"
  
- Si menciona "comisiones", "soy broker", "trabajar juntos", "colaboración":
  → usa transfer_to_advisor con advisor_name="comision"
  
- Si menciona "empleo", "trabajar aquí", "vacantes", "recursos humanos":
  → usa transfer_to_advisor con advisor_name="empleo"
  
- Si menciona "queja", "problema", "molestia", "inconformidad":
  → usa transfer_to_advisor con advisor_name="queja"

- Para cualquier otra consulta o transferencia general:
  → usa transfer_to_advisor con advisor_name="general"

NO PREGUNTES:
❌ "¿Con quién deseas hablar?"
❌ "¿Cuál es el nombre del asesor?"

EN SU LUGAR:
✅ Identifica el motivo automáticamente
✅ Di el mensaje apropiado del sistema
✅ Transfiere directamente

EJEMPLOS:

Cliente: "Quiero ver una propiedad"
Tú: [usar transfer_to_advisor con "visita"]
Sistema responde con: "Con mucho gusto, coordino su visita con un asesor tapatío especializado."

Cliente: "Soy broker y quiero colaborar"
Tú: [usar transfer_to_advisor con "comision"]
Sistema responde con: "Permítame conectarle con la Lic. Paz Gómez para platicar de colaboraciones."

Cliente: "¿Tienen vacantes?"
Tú: [usar transfer_to_advisor con "empleo"]
Sistema responde con: "Con gusto le transfiero al área de recursos humanos."
```

---

## 🧪 **PRUEBAS**

### **Prueba 1: Visita**
```
Cliente: "Quiero agendar una visita"
IA: [transfer_to_advisor → "visita"]
Sistema: → +523131068685
```

### **Prueba 2: Comisiones**
```
Cliente: "Soy broker y quiero trabajar con ustedes"
IA: [transfer_to_advisor → "comision"]  
Sistema: → +523319444737 (Lic. Paz Gómez)
```

### **Prueba 3: Empleo**
```
Cliente: "¿Tienen vacantes disponibles?"
IA: [transfer_to_advisor → "empleo"]
Sistema: → +523331222882 (Recursos Humanos)
```

### **Prueba 4: General/Default**
```
Cliente: "Quiero hablar con alguien"
IA: [transfer_to_advisor → "general"]
Sistema: → +523131068685 (Asesor general)
```

---

## 🔧 **PALABRAS CLAVE DETECTADAS**

El sistema detecta automáticamente estas palabras:

### **Visitas:**
- visita, ver, conocer, foto, propiedad

### **Comisiones:**
- comision, broker, colaboracion, trabajar, inmobiliaria

### **Empleo:**
- empleo, trabajo, vacante, contratar, recursos humanos

### **Quejas:**
- queja, problema, inconveniente, molestia

### **Dudas:**
- duda, pregunta, informacion, ayuda

---

## 📊 **LOGS ESPERADOS**

```bash
🔧 ===== TOOL LLAMADA: transfer_to_advisor =====
Body: {
  "advisor_name": "visita",
  "conversation_id": "..."
}
📞 Intentando transferir a: visita
🔍 Buscando contacto: "visita" → normalizado: "visita"
✅ Motivo encontrado: visita → +523131068685 (Asesor tapatío especializado en visitas)
📲 Número identificado: +523131068685
📋 Departamento: Asesor tapatío especializado en visitas
⏳ Esperando respuesta del asesor (máximo 35s)...
```

---

## 🌐 **MULTI-TENANT (FUTURO)**

Actualmente hardcoded para una empresa.

**TODO:** Mover a base de datos con estructura:

```sql
CREATE TABLE transfer_rules (
  id INT PRIMARY KEY,
  company_id INT,
  keyword VARCHAR(50),
  phone VARCHAR(20),
  description TEXT,
  message TEXT,
  is_default BOOLEAN
);
```

---

## 🎯 **VENTAJAS DEL SISTEMA**

✅ **Inteligente:** Detecta el motivo automáticamente  
✅ **Flexible:** Acepta palabras clave o texto descriptivo  
✅ **Escalable:** Fácil agregar más departamentos  
✅ **Mensajes personalizados:** Cada motivo tiene su mensaje  
✅ **Fallback:** Siempre hay un número por defecto  
✅ **Multi-idioma:** Normaliza texto (tildes, mayúsculas)  

