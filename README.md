# 🧺 LavanderIA · Asistente con IA para una lavandería

Prototipo funcional, desplegado en Azure, de una **lavandería** que atiende a sus clientes con un **asistente de chat con IA**: cotiza, registra órdenes, consulta su estado, recibe quejas y avisa cuando la ropa está lista. Un **panel de operador** permite dar seguimiento a las órdenes, entregar la ropa y enviar recordatorios.

> Proyecto educativo (Microsoft Foundry · AI-901). Todos los datos de clientes, órdenes y la sucursal ("Lavandería Burbuja") son **ficticios**. Las tarifas de lavado, planchado, tintorería y colchonetas parten de las de una lavandería real; el resto son de ejemplo.

**Demo en vivo:** https://lavanderia-burbuja-3477.azurewebsites.net
**Panel del operador:** https://lavanderia-burbuja-3477.azurewebsites.net/operador.html

*(Es una demo sin inicio de sesión, por diseño del ejercicio. Puede dejar de estar disponible cuando se eliminen los recursos de Azure.)*

| Página | Qué hace |
|---|---|
| `/` | Chat con el asistente de la lavandería |
| `/operador.html` | Órdenes, cambio de estado, entrega con validación, avisos al cliente (simulador de WhatsApp) y quejas |

---

## El problema

Una lavandería pequeña atiende todo por mensajes y papel:

| Situación actual | Consecuencia |
|---|---|
| Cotizar a mano cada pedido (kilos, exprés, domicilio, tintorería por prenda) | Errores de precio y tiempo perdido |
| Clientes que preguntan "¿ya está lista mi ropa?" todo el día | Interrupciones constantes |
| Avisar uno por uno que la ropa está lista | Se olvidan avisos y la ropa se acumula |
| Quejas por manchas o daños sin registro central | Nadie da seguimiento |
| Clientes que dejan de venir y nadie se lo recuerda | Pérdida de ventas recurrentes |

## La solución

1. **Asistente en Microsoft Foundry** con conocimiento propio (tarifas, políticas y horarios) mediante *File Search*. Responde solo con esos documentos y **cita la fuente**.
2. **Herramientas de función**: el modelo *propone* la acción y **el servidor la valida y la ejecuta**: `cotizar`, `crear_orden`, `estado_orden` y `registrar_queja`.
3. **Los precios nunca los calcula la IA**: los calcula una función determinista (`cotizar`). La IA solo los explica.
4. **La persona decide**: la IA no promete reembolsos ni aprueba descuentos; registra el caso y lo escala al encargado.
5. **Avisos y recordatorio semanal** (simulados): "tu ropa está lista" al marcar la orden y "estamos listos para lavar tu ropa" a quien aceptó recordatorios y lleva 7 días o más sin pedir.
6. **Seguridad sin llaves**: la aplicación se autentica en Foundry con **identidad administrada** y un rol mínimo. No hay llaves en el código.

### Qué hace hoy

- Cotiza lavado por kilo (mínimo 4 kg), planchado por docena, tintorería por prenda y servicios con cotización personalizada.
- Aplica exprés (+50 %), descuento del 10 % desde 10 kg y domicilio ($40, gratis desde $300).
- Registra órdenes por chat con folio `LAV-AAAA-NNNN` y consulta su estado.
- Registra quejas, sin prometer reembolsos, y las muestra al operador.
- Entrega la ropa solo con **folio y nombre exacto** del cliente.
- Rechaza datos de otros clientes, temas ajenos y intentos de saltarse las reglas.
- Funciona también **sin Azure** en modo simulado, para desarrollar y probar.

---

## Arquitectura

```mermaid
flowchart LR
    U["Cliente / Operador<br/>navegador o celular"] -->|HTTPS| W["Azure App Service<br/>Node.js + Express"]
    W -->|"Identidad administrada<br/>rol Foundry User"| A["Agente lavanderia-bot<br/>Microsoft Foundry"]
    A --> M["Modelo gpt-5-mini"]
    A --> K["File Search<br/>tarifas, políticas, horarios"]
    A -. "propone herramienta" .-> W
    W --> D[("datos/*.json<br/>clientes, órdenes, avisos, quejas")]
    W --> N["Bandeja de avisos<br/>simulador de WhatsApp"]
```

El navegador **nunca** habla directo con Foundry: solo el servidor. Los resultados de las herramientas se tratan como **datos**, no como instrucciones.

### Servicios y tecnologías

| Capa | Tecnología |
|---|---|
| Backend | Node.js 24, Express 5, módulos ES |
| IA | Microsoft Foundry: agente, modelo `gpt-5-mini`, File Search y herramientas de función |
| SDK | `@azure/ai-projects` 2.x y `@azure/identity` |
| Autenticación | `DefaultAzureCredential` en local · identidad administrada en Azure |
| Seguridad | `helmet`, `express-rate-limit`, validación de entradas, filtro de contenido de Azure |
| Frontend | HTML, CSS y JavaScript sin frameworks |
| Datos | Archivos JSON (suficiente para el prototipo) |
| Pruebas | Ejecutor de pruebas de Node (`node --test`) |
| Hospedaje | Azure App Service (Linux, plan F1) |

---

## Tarifas y reglas de negocio

| Servicio | Unidad | Precio MXN |
|---|---|---|
| Lavado (lavado, secado y doblado) | kg, **mínimo 4 kg** | 30.00 |
| Planchado | docena | 110.00 |
| Tintorería | pieza, **desde** | 65.00 (según la prenda) |
| Colchonetas / industrial / hoteles / spa | desde | 120 · **cotización con una persona** |
| Exprés 24 h | recargo sobre el lavado | +50 % |
| Domicilio | envío | $40 (gratis desde $300) |

Otros servicios del catálogo (de ejemplo): desmanchado, limpieza de tenis, cobijas y edredones, peluches, uniformes, mantelería y toallas para spa.

- Descuento del 10 % del lavado desde 10 kg.
- Estados de la orden: `recibida → en_proceso → lista → entregada` (no se pueden saltar).
- Entrega solo con folio y nombre exacto del cliente.
- Las prendas no reclamadas pasan a abandono a los 30 días.
- Daños o manchas: no se prometen reembolsos; la queja la valora una persona (tope de responsabilidad de 10 veces el precio del servicio).

---

## Cómo ejecutarlo

Requisitos: **Node.js 22 o superior** (se desarrolló con la 24).

```bash
npm install
npm run dev
```

Abre http://localhost:3000. Sin configuración la app funciona en **modo simulado** (sin Azure): cotiza con las mismas reglas, pero no usa el modelo.

### Con Microsoft Foundry

1. En [Microsoft Foundry](https://ai.azure.com) crea un proyecto y despliega un modelo *mini*.
2. Da a tu usuario el rol **Foundry User** (o *Azure AI User*) y ejecuta `az login`.
3. Copia `.env.example` a `.env` y llénalo:

```
FOUNDRY_PROJECT_ENDPOINT=https://<recurso>.services.ai.azure.com/api/projects/<proyecto>
FOUNDRY_AGENT_NAME=lavanderia-bot
FOUNDRY_MODEL_DEPLOYMENT=<nombre del despliegue del modelo>
```

4. Crea el agente (sube los documentos de `conocimiento/` y registra las herramientas):

```bash
npm run create-agent
```

5. Reinicia `npm run dev`. La etiqueta del chat cambia a **IA Foundry**.

### Otros comandos

| Comando | Qué hace |
|---|---|
| `npm test` | Ejecuta las pruebas (cotización, órdenes, avisos y API) |
| `npm run reset-demo` | Restaura los datos de ejemplo |
| `npm run create-agent` | Crea una nueva versión del agente en Foundry |

---

## Estructura del repositorio

```text
server.js              Servidor Express y rutas de la API
src/                   Lógica de negocio: cotizar, órdenes, avisos, quejas, herramientas, Foundry
public/                Chat (index.html) y panel del operador (operador.html)
conocimiento/          Documentos que consulta el agente (tarifas, políticas, horarios)
datos/                 Datos de ejemplo en JSON (seed/ guarda la copia inicial)
scripts/               create-agent.js y reset-demo.js
test/                  Pruebas automáticas
docs/                  Entrega y capturas de pantalla
```

### API

| Ruta | Descripción |
|---|---|
| `GET /health` | Estado del servicio |
| `POST /api/chat` | Chat con el asistente |
| `POST /api/cotizar` | Cotización directa |
| `GET /api/ordenes` · `POST /api/ordenes` | Listar y crear órdenes |
| `PATCH /api/ordenes/:folio` | Cambiar de estado (al pasar a `lista` genera el aviso) |
| `POST /api/ordenes/:folio/entregar` | Entrega con validación del nombre |
| `GET /api/avisos` · `POST /api/recordatorios` | Bandeja de avisos y recordatorio semanal |
| `GET /api/quejas` | Quejas registradas |

---

## IA responsable

- **Transparencia:** el asistente se identifica como IA y la interfaz avisa que es un proyecto educativo con datos ficticios.
- **Fundamento y fuentes:** responde con los documentos y herramientas, y cita de qué documento salió el dato. Si no lo tiene, lo dice y ofrece pasar con una persona.
- **Sin inventar precios:** todo importe viene de la función `cotizar`.
- **La persona decide:** reembolsos, descuentos fuera de regla y daños los atiende el encargado.
- **Privacidad:** no revela datos de otros clientes; la entrega exige folio y nombre.
- **Resistencia a manipulación:** las instrucciones del agente tratan los resultados de las herramientas como datos, y el filtro de contenido de Azure bloquea intentos de saltarse las reglas.
- **Equidad y alcance:** trato igual para todos y rechazo de temas ajenos a la lavandería.

## Seguridad

- Sin llaves ni secretos en el repositorio (`.env` está excluido); autenticación con identidad administrada.
- Validación del mensaje (1 a 2000 caracteres) y límite de 30 mensajes por minuto en el chat.
- Cabeceras de seguridad con `helmet`; errores genéricos hacia el navegador y detalle solo en la bitácora del servidor.
- Limitaciones conocidas del prototipo: sin inicio de sesión, datos en archivos JSON y un limitador de peticiones en memoria. Antes de un uso real habría que añadir autenticación (por ejemplo Microsoft Entra ID), una base de datos y un limitador distribuido.

## Costos

- App Service plan **F1**: gratis.
- Foundry: se cobra por uso del modelo `gpt-5-mini` (tokens) y el almacenamiento mínimo de los tres documentos de conocimiento. Con el uso de una demo, el costo es muy bajo.
- Al terminar, conviene **eliminar el grupo de recursos** para no consumir créditos.

---

## Capturas

| | |
|---|---|
| **Chat con el asistente** ![Chat](docs/capturas/01-chat-inicio.png) | **Panel del operador** ![Panel](docs/capturas/08-panel-operador.png) |
| **Crear una orden por chat** ![Orden](docs/capturas/04-chat-crear-orden.png) | **Queja sin promesa de reembolso** ![Queja](docs/capturas/05-chat-queja.png) |
| **Respuestas con fuentes** ![Fuentes](docs/capturas/06-chat-politicas-fuentes.png) | **Seguridad y límites** ![Seguridad](docs/capturas/07-chat-seguridad.png) |
| **Aviso "ropa lista"** ![Aviso](docs/capturas/09-aviso-ropa-lista.png) | **Recordatorio semanal** ![Recordatorio](docs/capturas/10-recordatorio-semanal.png) |

![Quejas en el panel](docs/capturas/11-quejas-operador.png)

## Entrega

La descripción para publicar el proyecto está en [docs/ENTREGA.md](docs/ENTREGA.md).

## Integrantes

- _Nombre del integrante 1_
- _Nombre del integrante 2_
