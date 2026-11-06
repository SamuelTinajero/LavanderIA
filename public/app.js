/**
 * public/app.js
 *
 * Lógica del cliente para el Chat con IA de "Lavandería Burbuja".
 * - Manejo de conversación en memoria (conversationId).
 * - Renderizado seguro sin innerHTML para datos del servidor (CSP estricta).
 * - Mini-markdown seguro para negritas, listas y saltos de línea.
 * - Manejo amigable de errores HTTP 422 y 502.
 * - Soporte para chips de ejemplo, fuentes de consulta e indicador de escritura.
 */

// Estado en memoria
let currentConversationId = null;
let isSubmitting = false;

// Referencias del DOM
const modeBadge = document.getElementById("modeBadge");
const modeText = document.getElementById("modeText");
const chatAlert = document.getElementById("chatAlert");
const chatAlertText = document.getElementById("chatAlertText");
const chatAlertDismiss = document.getElementById("chatAlertDismiss");
const btnNewChat = document.getElementById("btnNewChat");
const chatMessages = document.getElementById("chatMessages");
const typingIndicator = document.getElementById("typingIndicator");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const btnSend = document.getElementById("btnSend");
const charCounter = document.getElementById("charCounter");
const chipButtons = document.querySelectorAll(".chip-btn");

/**
 * Muestra u oculta la alerta amigable de error en la parte superior.
 */
function showAlert(message) {
  if (!chatAlert || !chatAlertText) return;
  chatAlertText.textContent = message;
  chatAlert.classList.remove("hidden");
}

function hideAlert() {
  if (!chatAlert) return;
  chatAlert.classList.add("hidden");
}

/**
 * Actualiza la etiqueta de modo de ejecución (Foundry vs Simulado).
 */
function setModeLabel(mode) {
  if (!modeBadge || !modeText) return;

  modeBadge.classList.remove("foundry", "simulado");
  if (mode === "foundry") {
    modeBadge.classList.add("foundry");
    modeText.textContent = "IA Foundry";
  } else {
    modeBadge.classList.add("simulado");
    modeText.textContent = "Modo simulado";
  }
}

/**
 * Consulta inicial a /health para detectar disponibilidad y modo base.
 */
async function checkHealth() {
  try {
    const res = await fetch("/health");
    if (res.ok) {
      const data = await res.json();
      setModeLabel(data.foundry ? "foundry" : "simulado");
    } else {
      setModeLabel("simulado");
    }
  } catch {
    setModeLabel("simulado");
  }
}

/**
 * Procesa texto con soporte seguro de **negritas**, insertando nodos DOM.
 * NUNCA utiliza innerHTML.
 */
function renderInlineFormatted(targetElement, text) {
  if (!text) return;
  // Divide por tokens delimitados por **...**
  const tokens = text.split(/(\*\*[^*]+\*\*)/g);
  for (const token of tokens) {
    if (token.startsWith("**") && token.endsWith("**") && token.length >= 4) {
      const strong = document.createElement("strong");
      strong.textContent = token.slice(2, -2);
      targetElement.appendChild(strong);
    } else if (token.length > 0) {
      targetElement.appendChild(document.createTextNode(token));
    }
  }
}

/**
 * Renderiza mini-markdown de forma segura mediante nodos del DOM:
 * - Párrafos
 * - Listas con viñetas (- o *) y numeradas (1. )
 * - **Negritas** en líneas y elementos
 */
function renderSafeMarkdown(container, markdownText) {
  if (!markdownText) return;
  const lines = markdownText.split(/\r?\n/);
  let currentList = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      currentList = null;
      continue;
    }

    const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
    const numMatch = line.match(/^(\d+)[.)]\s+(.*)$/);

    if (bulletMatch) {
      if (!currentList || currentList.tagName !== "UL") {
        currentList = document.createElement("ul");
        currentList.className = "chat-list";
        container.appendChild(currentList);
      }
      const li = document.createElement("li");
      renderInlineFormatted(li, bulletMatch[1]);
      currentList.appendChild(li);
    } else if (numMatch) {
      if (!currentList || currentList.tagName !== "OL") {
        currentList = document.createElement("ol");
        currentList.className = "chat-list";
        container.appendChild(currentList);
      }
      const li = document.createElement("li");
      renderInlineFormatted(li, numMatch[2]);
      currentList.appendChild(li);
    } else {
      currentList = null;
      const p = document.createElement("p");
      p.className = "chat-paragraph";
      renderInlineFormatted(p, line);
      container.appendChild(p);
    }
  }
}

/**
 * Agrega una burbuja de mensaje en la conversación.
 */
function appendMessage(role, text, sources = null) {
  const row = document.createElement("div");
  row.className = `chat-row ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";

  // En mensajes del usuario el texto se coloca como texto plano seguro
  if (role === "user") {
    bubble.textContent = text;
  } else {
    // Para el asistente usamos el mini-markdown seguro
    renderSafeMarkdown(bubble, text);
  }

  row.appendChild(bubble);

  // Si el asistente incluye fuentes de información citadas
  if (role === "assistant" && Array.isArray(sources) && sources.length > 0) {
    const sourcesContainer = document.createElement("div");
    sourcesContainer.className = "sources-container";

    const label = document.createElement("span");
    label.textContent = "Fuentes:";
    sourcesContainer.appendChild(label);

    for (const src of sources) {
      const tag = document.createElement("span");
      tag.className = "source-tag";
      tag.textContent = `📄 ${src}`;
      sourcesContainer.appendChild(tag);
    }

    row.appendChild(sourcesContainer);
  }

  // Insertar antes del indicador de escritura para que quede siempre al final
  chatMessages.insertBefore(row, typingIndicator);
  scrollChatToBottom();
}

/**
 * Desplaza suavemente el scroll hacia el mensaje más reciente.
 */
function scrollChatToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Muestra u oculta el indicador animado de escritura.
 */
function setTyping(isTyping) {
  if (!typingIndicator) return;
  if (isTyping) {
    typingIndicator.classList.remove("hidden");
    chatMessages.appendChild(typingIndicator);
    scrollChatToBottom();
  } else {
    typingIndicator.classList.add("hidden");
  }
}

/**
 * Inicializa o resetea el historial de chat con el saludo oficial.
 */
function resetConversation() {
  currentConversationId = null;
  hideAlert();

  // Limpiar mensajes anteriores manteniendo solo el typingIndicator
  const rows = chatMessages.querySelectorAll(".chat-row");
  rows.forEach((row) => row.remove());

  // Saludo inicial del bot
  appendMessage(
    "assistant",
    "¡Hola! 👋 Soy el asistente virtual de **Lavandería Burbuja**.\n\nPuedo ayudarte con:\n* Cotizar lavado, planchado o tintorería según tus prendas o kilos.\n* Consultar el estado de tu pedido con tu número de folio (ej. `LAV-2026-0001`).\n* Proporcionarte horarios y detalles de recolección a domicilio.\n* Registrar cualquier reporte o queja para nuestro personal encargado.\n\n¿En qué te puedo apoyar el día de hoy?"
  );

  if (chatInput) {
    chatInput.value = "";
    updateCharCounter();
    chatInput.focus();
  }
}

/**
 * Envía el mensaje del usuario a la API de backend.
 */
async function sendMessage(messageText) {
  const text = (messageText || "").trim();
  if (!text || isSubmitting) return;

  // Validación de longitud (1 a 2000 caracteres conforme al contrato)
  if (text.length > 2000) {
    showAlert("Tu mensaje excede el límite permitido de 2000 caracteres.");
    return;
  }

  hideAlert();
  isSubmitting = true;
  btnSend.disabled = true;
  chatInput.disabled = true;

  // Insertar burbuja de usuario
  appendMessage("user", text);

  // Limpiar campo de entrada
  chatInput.value = "";
  updateCharCounter();

  setTyping(true);

  try {
    const payload = { message: text };
    if (currentConversationId) {
      payload.conversationId = currentConversationId;
    }

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      if (data.conversationId) {
        currentConversationId = data.conversationId;
      }
      if (data.modo) {
        setModeLabel(data.modo);
      }

      const answerText = data.answer || "Disculpa, no pude procesar una respuesta adecuada.";
      appendMessage("assistant", answerText, data.sources);
    } else {
      // Manejo específico de errores HTTP del contrato
      if (res.status === 422) {
        const errorMsg = data.error || "Por favor escribe un mensaje válido de entre 1 y 2000 caracteres.";
        showAlert(`Error en el mensaje: ${errorMsg}`);
        appendMessage("assistant", `⚠️ ${errorMsg}`);
      } else if (res.status === 502) {
        const errorMsg = data.error || "Servicio no disponible.";
        showAlert("El servicio de IA no está disponible temporalmente. Por favor intenta de nuevo en un momento.");
        appendMessage("assistant", `⚠️ Disculpa los inconvenientes: ${errorMsg}. Por favor intenta de nuevo en unos instantes.`);
      } else {
        const errorMsg = data.error || "Ocurrió un error inesperado al procesar tu solicitud.";
        showAlert(`Error (${res.status}): ${errorMsg}`);
        appendMessage("assistant", `⚠️ No pudimos conectar con el servidor: ${errorMsg}`);
      }
    }
  } catch (netError) {
    showAlert("No fue posible comunicarse con el servidor de Lavandería Burbuja. Verifica tu conexión de red.");
    appendMessage(
      "assistant",
      "⚠️ No pude contactar con el servidor. Revisa tu conexión a internet o verifica que el servicio esté activo."
    );
  } finally {
    setTyping(false);
    isSubmitting = false;
    btnSend.disabled = false;
    chatInput.disabled = false;
    chatInput.focus();
  }
}

/**
 * Actualiza el contador de caracteres del textarea.
 */
function updateCharCounter() {
  if (!charCounter || !chatInput) return;
  const count = chatInput.value.length;
  charCounter.textContent = `${count} / 2000`;
  if (count > 2000) {
    charCounter.classList.add("counter-overflow");
  } else {
    charCounter.classList.remove("counter-overflow");
  }
}

/**
 * Event Listeners e inicialización
 */
document.addEventListener("DOMContentLoaded", () => {
  checkHealth();
  resetConversation();

  // Envío del formulario
  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage(chatInput.value);
  });

  // Manejo de Enter
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(chatInput.value);
    }
  });

  chatInput.addEventListener("input", () => {
    updateCharCounter();
  });

  // Botón nueva conversación
  btnNewChat.addEventListener("click", () => {
    resetConversation();
  });

  // Descartar alerta
  if (chatAlertDismiss) {
    chatAlertDismiss.addEventListener("click", () => {
      hideAlert();
    });
  }

  // Chips de preguntas sugeridas
  chipButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const prompt = btn.getAttribute("data-prompt");
      if (prompt) {
        sendMessage(prompt);
      }
    });
  });
});
