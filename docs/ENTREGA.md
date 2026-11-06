# Entrega Fase 2 · LavanderIA

## Integrantes
Samuel Snibal Tinajero Armendariz

## Link del proyecto
- **Aplicación publicada:** https://lavanderia-burbuja-3477.azurewebsites.net
- **Panel del operador:** https://lavanderia-burbuja-3477.azurewebsites.net/operador.html
- **Repositorio:** https://github.com/SamuelTinajero/LavanderIA

## Explicación del proyecto

**LavanderIA** es un asistente con inteligencia artificial para una lavandería, construido con **Microsoft Foundry** y publicado en **Azure App Service**. Resuelve cuatro problemas de una lavandería pequeña: cotizar cada pedido a mano, contestar todo el día "¿ya está lista mi ropa?", avisar uno por uno que la ropa está lista y dar seguimiento a las quejas por manchas o daños.

**Cómo funciona**
- El cliente conversa con un **agente de Foundry** que responde únicamente con los documentos de la lavandería (tarifas, políticas y horarios) y **cita la fuente** de cada respuesta.
- El agente puede **cotizar, crear órdenes, consultar su estado y registrar quejas** mediante herramientas. El modelo propone la acción y el servidor la valida y la ejecuta. **Los precios no los calcula la IA**, sino una función determinista, así nunca inventa un importe.
- Un **panel del operador** permite pasar las órdenes de estado, entregar la ropa solo con folio y nombre exacto del cliente, y ver los avisos y las quejas.
- Al marcar una orden como lista se genera el **aviso al cliente**, y un **recordatorio semanal** ("estamos listos para lavar tu ropa") se envía a quien aceptó recibirlo y lleva 7 días o más sin pedir. Ambos son simulados con una bandeja tipo WhatsApp.

**Servicios de Azure:** Microsoft Foundry (proyecto, modelo `gpt-5-mini`, agente, File Search y filtro de contenido), Azure App Service y Microsoft Entra ID (identidad administrada, sin llaves en el código).

**IA responsable:** el asistente se identifica como IA, no inventa datos, **no promete reembolsos** (una persona decide), protege los datos de otros clientes, rechaza temas ajenos y resiste intentos de manipulación. Todos los datos son ficticios.

**Reglas de negocio:** lavado a $30/kg con mínimo de 4 kg, planchado a $110 la docena, tintorería desde $65 por pieza, exprés +50 %, descuento del 10 % desde 10 kg y domicilio de $40 (gratis desde $300).

## Capturas

1. Chat con el asistente: `docs/capturas/01-chat-inicio.png`
2. Creación de una orden por chat: `docs/capturas/04-chat-crear-orden.png`
3. Queja sin promesa de reembolso: `docs/capturas/05-chat-queja.png`
4. Respuestas con fuentes (políticas, horarios, domicilio): `docs/capturas/06-chat-politicas-fuentes.png`
5. Pruebas de seguridad y límites: `docs/capturas/07-chat-seguridad.png`
6. Panel del operador: `docs/capturas/08-panel-operador.png`
7. Aviso "tu ropa está lista": `docs/capturas/09-aviso-ropa-lista.png`
8. Recordatorio semanal: `docs/capturas/10-recordatorio-semanal.png`
9. Quejas en el panel: `docs/capturas/11-quejas-operador.png`
