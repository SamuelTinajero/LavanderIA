import { cotizar } from './cotizar.js';
import { verOrden } from './ordenes.js';
import { randomUUID } from 'node:crypto';

export async function respuestaSimulada(mensaje, conversationId) {
  const texto = mensaje.toLocaleLowerCase('es');
  let answer = '¡Hola! 👋 Puedo ayudarte a cotizar lavado o consultar el estado de una orden. ¿Qué necesitas?';
  const folio = mensaje.match(/LAV-\d{4}-\d{4}/i)?.[0]?.toUpperCase();
  if (folio && /estado|orden|pedido|folio/.test(texto)) {
    const orden = await verOrden(folio);
    answer = orden ? `La orden ${folio} está ${orden.estado.replace('_', ' ')}.` : `No encontré la orden ${folio}.`;
  } else if (/cu[aá]nto|costo|precio|cotiz/.test(texto)) {
    const kg = Number(texto.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?)/)?.[1]?.replace(',', '.'));
    if (kg > 0) {
      const resultado = cotizar({ items: [{ servicio: 'lavado', cantidad: kg }], expres: /expr[eé]s/.test(texto), domicilio: /domicilio/.test(texto) });
      answer = `Lavar ${kg} kg cuesta $${resultado.total.toFixed(2)} MXN. Se cobra un mínimo de 4 kg; ${resultado.descuento ? 'incluye el descuento por 10 kg o más. ' : ''}Entrega normal en 48 h o exprés en 24 h.`;
    } else answer = 'El lavado cuesta $30 por kg, con mínimo de 4 kg. Dime cuántos kg para darte el total exacto.';
  }
  return { answer, conversationId: conversationId || randomUUID(), sources: [], modo: 'simulado' };
}
