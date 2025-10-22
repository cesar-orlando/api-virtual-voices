# 🏢 SIMPLE GREEN - Tools Exclusivas

## ✅ RUTA PRINCIPAL

### **transfer-to-advisor-simple-green** (TODO en UNA)
```
POST /api/elevenlabs-tools/transfer-to-advisor-simple-green
```

**Maneja automáticamente:**
- ✅ Asesores a móvil (Juanita, Monica, Gerson)
- ✅ Extensiones a móvil (100, 105, 115)
- ✅ Extensión a conmutador (103 con DTMF)

### ⚠️ Opcional: **transfer-to-extension** (Backup)
```
POST /api/elevenlabs-tools/transfer-to-extension
```
Solo si necesitas transferir extensiones manualmente.

---

## 👥 ASESORES CONFIGURADOS

| Asesor | Móvil | Extensión | Tool a Usar |
|--------|-------|-----------|-------------|
| **Juanita** | `3322619753` | 100 | `transfer-to-advisor-simple-green` |
| **Monica** | `3315995603` | 105 | `transfer-to-advisor-simple-green` |
| **Gerson** | `5537043277` | 115 | `transfer-to-advisor-simple-green` |
| **Guillermo** | ❌ Sin móvil | 103 | `transfer-to-advisor-simple-green` (solo ext 103) |

---

## 🎯 CÓMO FUNCIONA

### ✅ Por NOMBRE → Móvil Directo

```json
POST /api/elevenlabs-tools/transfer-to-advisor-simple-green

{
  "advisor_name": "juanita"
}
```

**Resultado:** Llama a `+523322619753`

⚠️ **Nota:** Guillermo NO tiene móvil, solo disponible por extensión 103

---

### ✅ Por EXTENSIÓN 100/105/115 → Móvil

```json
POST /api/elevenlabs-tools/transfer-to-advisor-simple-green

{
  "advisor_name": "100"
}
```

**Resultado:** Llama a Juanita `+523322619753`

---

### ✅ EXTENSIÓN 103 → Conmutador

```json
POST /api/elevenlabs-tools/transfer-to-advisor-simple-green

{
  "advisor_name": "103"
}
```

**Resultado:** Responde `should_use_extension: true`

**Luego la IA debe llamar:**

```json
POST /api/elevenlabs-tools/transfer-to-extension

{
  "extension_number": "103"
}
```

**Resultado:** Envía DTMF `*103` al conmutador

---

## 📋 CONFIGURACIÓN EN ELEVENLABS

### 🎯 SOLO UNA TOOL NECESARIA

**Nombre:** `transfer_to_advisor_simple_green`

**Webhook URL:**
```
https://subcuticular-tenley-unmalicious.ngrok-free.de/api/elevenlabs-tools/transfer-to-advisor-simple-green
```

**Parámetros:**
- `advisor_name` (string, required): Nombre o extensión
  - Ejemplos: "juanita", "monica", "gerson", "100", "105", "115", "103"

**Descripción:**
```
Transfiere llamadas a los asesores de Simple Green.
Maneja automáticamente móviles y conmutador.
Usar cuando el cliente pida hablar con: Juanita, Monica, Gerson
o extensiones 100, 105, 115, 103.
```

**Cuándo usar:**
- Cliente dice: "Quiero hablar con [nombre]"
- Cliente dice: "Extensión [número]"
- Cliente dice: "Comunícame con [asesor]"

---

## 💬 PROMPT PARA ELEVENLABS

Agrega esto al prompt de tu agente:

```
# SIMPLE GREEN - ASESORES DISPONIBLES

Cuando el cliente pida hablar con alguien, usa transfer_to_advisor_simple_green:

**Asesores por nombre:**
- Juanita
- Monica
- Gerson

**Por extensión:**
- Extensión 100 → Juanita
- Extensión 105 → Monica
- Extensión 115 → Gerson
- Extensión 103 → Guillermo (SOLO por extensión, conmutador)

**Cómo transferir:**
1. Usuario dice nombre o extensión 100/105/115/103
2. Llama a transfer_to_advisor_simple_green con advisor_name="[nombre o número]"
3. La tool maneja TODO automáticamente:
   - Móvil → Llama directo
   - Conmutador → Envía DTMF
4. Si asesor no disponible:
   - Ofrece dejar recado con take_voicemail
```

---

## 🧪 EJEMPLOS DE CONVERSACIÓN

### Ejemplo 1: "Quiero hablar con Juanita"

```
Usuario: "Quiero hablar con Juanita"
IA: "Con mucho gusto, te conecto con Juanita."

Sistema:
  🔧 transfer_to_advisor_simple_green
  📞 Llama a +523322619753
  ⏳ Espera 35s
  ✅ Si contesta → Conecta
  ❌ Si no → Ofrece recado
```

---

### Ejemplo 2: "Extensión 100"

```
Usuario: "Extensión 100"
IA: "Conectando con Juanita."

Sistema:
  🔧 transfer_to_advisor_simple_green
  🔍 Detecta "100" → Juanita
  📞 Llama a +523322619753
```

---

### Ejemplo 3: "Extensión 103"

```
Usuario: "Extensión 103"
IA: "Un momento, transfiriendo a extensión 103."

Sistema:
  🔧 transfer_to_advisor_simple_green
  🔍 Detecta "103" → conmutador
  🎹 Envía DTMF: *103 automáticamente
  ✅ Conmutador transfiere a Guillermo
```

---

## 📊 LOGS ESPERADOS

### Transferencia a móvil:

```bash
🏢 ===== SIMPLE GREEN: transfer_to_advisor =====
📞 Simple Green - Buscando: juanita
🔍 Normalizado: "juanita" → "juanita"
📱 Llamando a Juanita: +523322619753
📞 Llamando al asesor... Call SID: CAxxxx
⏳ Esperando respuesta (35s)...
✅ Asesor contestó
```

### Extensión 103 (conmutador):

```bash
🏢 ===== SIMPLE GREEN: transfer_to_advisor =====
📞 Simple Green - Buscando: 103
🔍 Normalizado: "103" → "103"
🎹 Extensión 103 → Enviar al conmutador
✅ Extensión 103 - Guillermo
🎹 DTMF: *103
```

---

## ⚠️ IMPORTANTE

### NO tocar `transfer_to_advisor` original

La ruta `/api/elevenlabs-tools/transfer-to-advisor` sigue funcionando para **otras empresas**.

**Simple Green usa EXCLUSIVAMENTE:**
- `/api/elevenlabs-tools/transfer-to-advisor-simple-green`
- `/api/elevenlabs-tools/transfer-to-extension`

---

## ✅ RESUMEN

| Solicitud | Tool | Destino |
|-----------|------|---------|
| "Juanita" | transfer_to_advisor_simple_green | 📱 3322619753 |
| "Monica" | transfer_to_advisor_simple_green | 📱 3315995603 |
| "Gerson" | transfer_to_advisor_simple_green | 📱 5537043277 |
| "Guillermo" | ❌ No disponible | Solo por extensión 103 |
| "Ext 100" | transfer_to_advisor_simple_green | 📱 3322619753 |
| "Ext 105" | transfer_to_advisor_simple_green | 📱 3315995603 |
| "Ext 115" | transfer_to_advisor_simple_green | 📱 5537043277 |
| "Ext 103" | transfer_to_advisor_simple_green | 🎹 DTMF *103 (automático) |

---

**¿Listo para configurar en ElevenLabs?** 🚀

