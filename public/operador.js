/**
 * public/operador.js
 *
 * Lógica del panel de operador de "Lavandería Burbuja".
 * - Gestión completa del ciclo de vida de órdenes: cotizada -> recibida -> en_proceso -> lista -> entregada.
 * - Validación de entrega con nombre de cliente (POST /api/ordenes/:folio/entregar).
 * - Cotización en vivo al formular nuevas órdenes (POST /api/cotizar).
 * - Creación de órdenes (POST /api/ordenes).
 * - Bandeja de avisos estilo WhatsApp (GET /api/avisos) con simulador de lunes (POST /api/recordatorios).
 * - Monitoreo de quejas abiertas (GET /api/quejas).
 * - Actualización automática periódica cada 5 segundos y reactiva tras cada acción.
 * - Renderizado seguro por nodos DOM (sin innerHTML para datos del servidor) y cumplimiento de CSP.
 */

// Estado del panel
let activeDeliverFolio = null;
let isUpdating = false;
let liveQuoteDebounceTimer = null;

// Referencias del DOM
const operatorAlert = document.getElementById("operatorAlert");
const operatorAlertText = document.getElementById("operatorAlertText");
const operatorAlertDismiss = document.getElementById("operatorAlertDismiss");
const operatorSuccess = document.getElementById("operatorSuccess");
const operatorSuccessText = document.getElementById("operatorSuccessText");
const operatorSuccessDismiss = document.getElementById("operatorSuccessDismiss");

// Formulario de nueva orden
const createOrderForm = document.getElementById("createOrderForm");
const inputCliente = document.getElementById("inputCliente");
const selectServicio = document.getElementById("selectServicio");
const prendaContainer = document.getElementById("prendaContainer");
const selectPrenda = document.getElementById("selectPrenda");
const inputCantidad = document.getElementById("inputCantidad");
const checkExpres = document.getElementById("checkExpres");
const checkDomicilio = document.getElementById("checkDomicilio");
const btnCrearOrden = document.getElementById("btnCrearOrden");

// Elementos de cotización en vivo
const liveQuoteLines = document.getElementById("liveQuoteLines");
const liveQuoteDescuento = document.getElementById("liveQuoteDescuento");
const liveQuoteDomicilio = document.getElementById("liveQuoteDomicilio");
const liveQuoteTotalVal = document.getElementById("liveQuoteTotalVal");
const liveQuoteWarning = document.getElementById("liveQuoteWarning");

// Tablas y feeds
const ordersTableBody = document.getElementById("ordersTableBody");
const btnRecargarOrdenes = document.getElementById("btnRecargarOrdenes");
const avisosFeed = document.getElementById("avisosFeed");
const btnSimularLunes = document.getElementById("btnSimularLunes");
const quejasContainer = document.getElementById("quejasContainer");
const btnRecargarQuejas = document.getElementById("btnRecargarQuejas");

// Modal de entrega
const deliverModal = document.getElementById("deliverModal");
const deliverForm = document.getElementById("deliverForm");
const modalFolioText = document.getElementById("modalFolioText");
const modalInputNombre = document.getElementById("modalInputNombre");
const modalBtnCancel = document.getElementById("modalBtnCancel");

// ==========================================================================
// Gestión de Alertas y Notificaciones
// ==========================================================================
function showError(message) {
  if (!operatorAlert || !operatorAlertText) return;
  operatorAlertText.textContent = message;
  operatorAlert.classList.remove("hidden");
  hideSuccess();
}

function hideError() {
  if (!operatorAlert) return;
  operatorAlert.classList.add("hidden");
}

function showSuccess(message) {
  if (!operatorSuccess || !operatorSuccessText) return;
  operatorSuccessText.textContent = message;
  operatorSuccess.classList.remove("hidden");
  hideError();
}

function hideSuccess() {
  if (!operatorSuccess) return;
  operatorSuccess.classList.add("hidden");
}

// ==========================================================================
// Carga y Renderizado de Órdenes (GET /api/ordenes)
// ==========================================================================
async function loadOrders() {
  try {
    const res = await fetch("/api/ordenes");
    if (!res.ok) {
      throw new Error(`Error al consultar órdenes: código HTTP ${res.status}`);
    }
    const orders = await res.json();
    renderOrdersTable(orders);
  } catch (err) {
    showError(`No se pudieron cargar las órdenes: ${err.message}`);
  }
}

function renderOrdersTable(orders) {
  if (!ordersTableBody) return;

  // Limpiar filas anteriores
  while (ordersTableBody.firstChild) {
    ordersTableBody.removeChild(ordersTableBody.firstChild);
  }

  if (!Array.isArray(orders) || orders.length === 0) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = 6;
    emptyCell.className = "empty-state";
    emptyCell.textContent = "No hay órdenes registradas en el sistema.";
    emptyRow.appendChild(emptyCell);
    ordersTableBody.appendChild(emptyRow);
    return;
  }

  for (const orden of orders) {
    const tr = document.createElement("tr");

    // Folio
    const tdFolio = document.createElement("td");
    const strongFolio = document.createElement("strong");
    strongFolio.textContent = orden.folio || "S/F";
    tdFolio.appendChild(strongFolio);
    tr.appendChild(tdFolio);

    // Cliente
    const tdCliente = document.createElement("td");
    tdCliente.textContent = orden.clienteNombre || orden.clienteId || orden.cliente || "Anónimo";
    tr.appendChild(tdCliente);

    // Items y modificaciones
    const tdItems = document.createElement("td");
    const itemsText = formatOrderItems(orden.items);
    const extras = [];
    if (orden.expres) extras.push("⚡ Exprés");
    if (orden.domicilio) extras.push("🚚 Domicilio");
    const details = extras.length > 0 ? `${itemsText} (${extras.join(", ")})` : itemsText;
    tdItems.textContent = details;
    tr.appendChild(tdItems);

    // Total
    const tdTotal = document.createElement("td");
    const totalNum = typeof orden.total === "number" ? orden.total : 0;
    tdTotal.textContent = `$${totalNum.toFixed(2)} MXN`;
    tr.appendChild(tdTotal);

    // Estado con badge coloreado
    const tdEstado = document.createElement("td");
    const badge = document.createElement("span");
    const estadoLimpio = (orden.estado || "").toLowerCase().replace(/\s+/g, "_");
    badge.className = `status-badge ${estadoLimpio}`;
    badge.textContent = orden.estado || "desconocido";
    tdEstado.appendChild(badge);
    tr.appendChild(tdEstado);

    // Botones de acción según el estado
    const tdAcciones = document.createElement("td");
    const actionContainer = document.createElement("div");
    actionContainer.className = "action-buttons";

    renderActionButtons(actionContainer, orden);

    tdAcciones.appendChild(actionContainer);
    tr.appendChild(tdAcciones);

    ordersTableBody.appendChild(tr);
  }
}

function formatOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) return "Sin items";
  return items
    .map((item) => {
      const nombre = item.servicio || "servicio";
      const cant = item.cantidad ?? 1;
      const prenda = item.prenda ? ` (${item.prenda})` : "";
      return `${nombre}${prenda}: ${cant}`;
    })
    .join(", ");
}

/**
 * Renderiza los botones de transición de estado en la fila de la orden.
 * Ciclo: cotizada -> recibida -> en_proceso -> lista -> entregada (+ abandono).
 */
function renderActionButtons(container, orden) {
  const folio = orden.folio;
  const estado = orden.estado;

  if (estado === "cotizada") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-action";
    btn.textContent = "📥 Recibir";
    btn.title = "Pasar a estado 'recibida'";
    btn.addEventListener("click", () => patchOrderStatus(folio, "recibida"));
    container.appendChild(btn);
  } else if (estado === "recibida") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-action";
    btn.textContent = "⚙️ En proceso";
    btn.title = "Iniciar lavado o planchado";
    btn.addEventListener("click", () => patchOrderStatus(folio, "en_proceso"));
    container.appendChild(btn);
  } else if (estado === "en_proceso") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-action btn-marcar-lista";
    btn.textContent = "✅ Marcar lista";
    btn.title = "Notificar al cliente que sus prendas están listas";
    btn.addEventListener("click", () => patchOrderStatus(folio, "lista"));
    container.appendChild(btn);
  } else if (estado === "lista") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-action btn-entregar";
    btn.textContent = "🤝 Entregar";
    btn.title = "Verificar nombre y entregar al cliente";
    btn.addEventListener("click", () => openDeliverModal(folio));
    container.appendChild(btn);
  } else if (estado === "entregada") {
    const span = document.createElement("span");
    span.textContent = "Completada ✓";
    span.className = "brand-subtitle";
    container.appendChild(span);
  } else if (estado === "abandono") {
    const span = document.createElement("span");
    span.textContent = "En almacén ⚠️";
    span.className = "brand-subtitle";
    container.appendChild(span);
  }
}

/**
 * Avanza el estado de una orden vía PATCH /api/ordenes/:folio
 */
async function patchOrderStatus(folio, nuevoEstado) {
  hideError();
  try {
    const res = await fetch(`/api/ordenes/${encodeURIComponent(folio)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nuevoEstado }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      showSuccess(`Orden ${folio} actualizada a '${nuevoEstado}'.`);
      await refreshAll();
    } else {
      const msg = data.error || `Error (${res.status}) al cambiar estado.`;
      showError(`No se pudo actualizar la orden ${folio}: ${msg}`);
    }
  } catch (err) {
    showError(`Error de conexión al actualizar la orden: ${err.message}`);
  }
}

// ==========================================================================
// Modal y Flujo de Entrega (POST /api/ordenes/:folio/entregar)
// ==========================================================================
function openDeliverModal(folio) {
  activeDeliverFolio = folio;
  modalFolioText.textContent = folio;
  modalInputNombre.value = "";
  deliverModal.classList.remove("hidden");
  modalInputNombre.focus();
}

function closeDeliverModal() {
  deliverModal.classList.add("hidden");
  activeDeliverFolio = null;
  modalInputNombre.value = "";
}

async function handleDeliverSubmit(e) {
  e.preventDefault();
  const nombre = modalInputNombre.value.trim();
  if (!nombre || !activeDeliverFolio) return;

  hideError();
  try {
    const res = await fetch(`/api/ordenes/${encodeURIComponent(activeDeliverFolio)}/entregar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      showSuccess(`Orden ${activeDeliverFolio} entregada con éxito a ${nombre}.`);
      closeDeliverModal();
      await refreshAll();
    } else {
      if (res.status === 403) {
        showError(`Error 403 al entregar: El nombre '${nombre}' no coincide con el cliente registrado para la orden ${activeDeliverFolio}.`);
      } else {
        showError(`No fue posible entregar la orden: ${data.error || "Error desconocido"}`);
      }
    }
  } catch (err) {
    showError(`Error al procesar la entrega: ${err.message}`);
  }
}

// ==========================================================================
// Cotización en Vivo (POST /api/cotizar) y Creación de Órdenes
// ==========================================================================
function setupLiveQuoteListeners() {
  const triggerQuote = () => {
    clearTimeout(liveQuoteDebounceTimer);
    liveQuoteDebounceTimer = setTimeout(fetchLiveQuote, 250);
  };

  selectServicio.addEventListener("change", () => {
    // Si el servicio es tintorería, mostrar selector de prenda
    if (selectServicio.value === "tintoreria") {
      prendaContainer.classList.remove("hidden");
    } else {
      prendaContainer.classList.add("hidden");
    }
    triggerQuote();
  });

  selectPrenda.addEventListener("change", triggerQuote);
  inputCantidad.addEventListener("input", triggerQuote);
  checkExpres.addEventListener("change", triggerQuote);
  checkDomicilio.addEventListener("change", triggerQuote);

  // Primera cotización en vivo inicial
  fetchLiveQuote();
}

function buildCurrentQuotePayload() {
  const servicio = selectServicio.value;
  const cantidad = Math.max(1, parseInt(inputCantidad.value, 10) || 1);
  const item = { servicio, cantidad };

  if (servicio === "tintoreria") {
    item.prenda = selectPrenda.value;
  }

  return {
    items: [item],
    expres: checkExpres.checked,
    domicilio: checkDomicilio.checked,
  };
}

async function fetchLiveQuote() {
  const payload = buildCurrentQuotePayload();

  try {
    const res = await fetch("/api/cotizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return;
    }

    const data = await res.json();
    renderLiveQuote(data);
  } catch {
    // Si la cotización en vivo falla silenciosamente, el usuario aún puede formular
  }
}

function renderLiveQuote(quote) {
  // Limpiar líneas anteriores
  while (liveQuoteLines.firstChild) {
    liveQuoteLines.removeChild(liveQuoteLines.firstChild);
  }

  if (Array.isArray(quote.lineas)) {
    for (const linea of quote.lineas) {
      const div = document.createElement("div");
      div.className = "quote-line";

      const conceptoSpan = document.createElement("span");
      conceptoSpan.textContent = `${linea.concepto || "Servicio"} (${linea.cantidad} ${linea.unidad || ""})`;

      const importeSpan = document.createElement("span");
      const imp = typeof linea.importe === "number" ? linea.importe : 0;
      importeSpan.textContent = `$${imp.toFixed(2)}`;

      div.appendChild(conceptoSpan);
      div.appendChild(importeSpan);
      liveQuoteLines.appendChild(div);
    }
  }

  // Descuento
  if (quote.descuento && quote.descuento > 0) {
    liveQuoteDescuento.textContent = "";
    const label = document.createElement("span");
    label.textContent = "Descuento por volumen (10%):";
    const val = document.createElement("span");
    val.textContent = `-$${Number(quote.descuento).toFixed(2)}`;
    liveQuoteDescuento.appendChild(label);
    liveQuoteDescuento.appendChild(val);
    liveQuoteDescuento.classList.remove("hidden");
  } else {
    liveQuoteDescuento.classList.add("hidden");
  }

  // Domicilio
  if (checkDomicilio.checked) {
    liveQuoteDomicilio.textContent = "";
    const label = document.createElement("span");
    label.textContent = "Envío a domicilio:";
    const val = document.createElement("span");
    const domCost = typeof quote.domicilio === "number" ? quote.domicilio : 40;
    val.textContent = domCost === 0 ? "Gratis" : `$${domCost.toFixed(2)}`;
    liveQuoteDomicilio.appendChild(label);
    liveQuoteDomicilio.appendChild(val);
    liveQuoteDomicilio.classList.remove("hidden");
  } else {
    liveQuoteDomicilio.classList.add("hidden");
  }

  // Total
  const total = typeof quote.total === "number" ? quote.total : 0;
  liveQuoteTotalVal.textContent = `$${total.toFixed(2)} MXN`;

  // Advertencia de cotización humana
  if (quote.requierePersona) {
    liveQuoteWarning.classList.remove("hidden");
  } else {
    liveQuoteWarning.classList.add("hidden");
  }
}

/**
 * Registra una nueva orden vía POST /api/ordenes
 */
async function handleCreateOrderSubmit(e) {
  e.preventDefault();
  const cliente = inputCliente.value.trim();
  if (!cliente) {
    showError("Por favor ingresa el nombre o ID del cliente.");
    inputCliente.focus();
    return;
  }

  const payload = buildCurrentQuotePayload();
  const orderBody = {
    cliente,
    items: payload.items,
    expres: payload.expres,
    domicilio: payload.domicilio,
  };

  hideError();
  btnCrearOrden.disabled = true;

  try {
    const res = await fetch("/api/ordenes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderBody),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      showSuccess(`Orden creada exitosamente con folio: ${data.folio || "Generado"}`);
      inputCliente.value = "";
      inputCantidad.value = "4";
      checkExpres.checked = false;
      checkDomicilio.checked = false;
      selectServicio.value = "lavado";
      prendaContainer.classList.add("hidden");
      await fetchLiveQuote();
      await refreshAll();
    } else {
      showError(`Error al crear la orden: ${data.error || "No se pudo registrar"}`);
    }
  } catch (err) {
    showError(`Error de red al crear orden: ${err.message}`);
  } finally {
    btnCrearOrden.disabled = false;
  }
}

// ==========================================================================
// Bandeja de Avisos estilo WhatsApp (GET /api/avisos y POST /api/recordatorios)
// ==========================================================================
async function loadAvisos() {
  try {
    const res = await fetch("/api/avisos");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const avisos = await res.json();
    renderAvisosFeed(avisos);
  } catch (err) {
    // Si falla avisos, no interrumpir todo el panel
  }
}

function renderAvisosFeed(avisos) {
  if (!avisosFeed) return;

  while (avisosFeed.firstChild) {
    avisosFeed.removeChild(avisosFeed.firstChild);
  }

  if (!Array.isArray(avisos) || avisos.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No hay mensajes o avisos registrados todavía.";
    avisosFeed.appendChild(empty);
    return;
  }

  // Mostrar los más recientes primero
  for (const aviso of avisos) {
    const card = document.createElement("article");
    const tipoClass = aviso.tipo === "recordatorio" ? "recordatorio" : "lista";
    card.className = `wa-card ${tipoClass}`;

    // Header del mensaje
    const header = document.createElement("div");
    header.className = "wa-card-header";

    const titleSpan = document.createElement("span");
    const cliente = aviso.clienteNombre || aviso.clienteId || "Cliente";
    titleSpan.textContent = `📱 ${cliente} (${aviso.telefono || "Teléfono protegido"})`;

    const badge = document.createElement("span");
    badge.className = `wa-badge ${tipoClass}`;
    badge.textContent = aviso.tipo === "recordatorio" ? "Recordatorio" : "Ropa Lista";

    header.appendChild(titleSpan);
    header.appendChild(badge);
    card.appendChild(header);

    // Cuerpo del mensaje
    const body = document.createElement("div");
    body.className = "wa-card-body";
    body.textContent = aviso.texto || "";
    card.appendChild(body);

    // Footer con hora formateada
    const footer = document.createElement("div");
    footer.className = "wa-card-footer";
    let formattedTime = "";
    if (aviso.fecha) {
      try {
        const d = new Date(aviso.fecha);
        formattedTime = d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
      } catch {
        formattedTime = aviso.fecha;
      }
    }
    footer.textContent = `${formattedTime} ✓✓`;
    card.appendChild(footer);

    avisosFeed.appendChild(card);
  }
}

async function handleSimularLunes() {
  hideError();
  btnSimularLunes.disabled = true;

  try {
    const res = await fetch("/api/recordatorios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      const enviados = data.enviados ?? 0;
      showSuccess(`Simulación de lunes ejecutada: Se enviaron ${enviados} recordatorios.`);
      await loadAvisos();
    } else {
      showError(`Error al simular lunes: ${data.error || "No se pudo ejecutar"}`);
    }
  } catch (err) {
    showError(`Error de red al simular recordatorios: ${err.message}`);
  } finally {
    btnSimularLunes.disabled = false;
  }
}

// ==========================================================================
// Lista de Quejas (GET /api/quejas)
// ==========================================================================
async function loadQuejas() {
  try {
    const res = await fetch("/api/quejas");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const quejas = await res.json();
    renderQuejasList(quejas);
  } catch (err) {
    // Silencioso o informativo
  }
}

function renderQuejasList(quejas) {
  if (!quejasContainer) return;

  while (quejasContainer.firstChild) {
    quejasContainer.removeChild(quejasContainer.firstChild);
  }

  if (!Array.isArray(quejas) || quejas.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No hay quejas abiertas registradas. ¡Excelente servicio!";
    quejasContainer.appendChild(empty);
    return;
  }

  for (const queja of quejas) {
    const card = document.createElement("article");
    card.className = "queja-card";

    const header = document.createElement("div");
    header.className = "queja-header";

    const folioSpan = document.createElement("span");
    folioSpan.className = "queja-folio";
    folioSpan.textContent = queja.folio ? `Folio: ${queja.folio}` : "Reporte General";

    const estadoSpan = document.createElement("span");
    estadoSpan.className = "status-badge cotizada";
    estadoSpan.textContent = queja.estado || "abierta";

    header.appendChild(folioSpan);
    header.appendChild(estadoSpan);
    card.appendChild(header);

    const desc = document.createElement("div");
    desc.className = "queja-body";
    desc.textContent = queja.descripcion || "Sin descripción proporcionada.";
    card.appendChild(desc);

    quejasContainer.appendChild(card);
  }
}

// ==========================================================================
// Actualización Periódica y Coordinación
// ==========================================================================
async function refreshAll() {
  if (isUpdating) return;
  isUpdating = true;
  try {
    await Promise.allSettled([loadOrders(), loadAvisos(), loadQuejas()]);
  } finally {
    isUpdating = false;
  }
}

// ==========================================================================
// Inicialización del DOM y Eventos
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  setupLiveQuoteListeners();
  refreshAll();

  // Actualización automática cada 5 segundos
  setInterval(() => {
    refreshAll();
  }, 5000);

  // Botones de recarga manual
  if (btnRecargarOrdenes) {
    btnRecargarOrdenes.addEventListener("click", () => {
      loadOrders();
    });
  }

  if (btnRecargarQuejas) {
    btnRecargarQuejas.addEventListener("click", () => {
      loadQuejas();
    });
  }

  // Simulación de lunes
  if (btnSimularLunes) {
    btnSimularLunes.addEventListener("click", handleSimularLunes);
  }

  // Envío del formulario de orden
  if (createOrderForm) {
    createOrderForm.addEventListener("submit", handleCreateOrderSubmit);
  }

  // Modal de entrega
  if (deliverForm) {
    deliverForm.addEventListener("submit", handleDeliverSubmit);
  }

  if (modalBtnCancel) {
    modalBtnCancel.addEventListener("click", closeDeliverModal);
  }

  if (deliverModal) {
    deliverModal.addEventListener("click", (e) => {
      if (e.target === deliverModal) {
        closeDeliverModal();
      }
    });
  }

  // Descartar alertas
  if (operatorAlertDismiss) {
    operatorAlertDismiss.addEventListener("click", hideError);
  }
  if (operatorSuccessDismiss) {
    operatorSuccessDismiss.addEventListener("click", hideSuccess);
  }
});
