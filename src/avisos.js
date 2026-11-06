import { leer, modificar } from './datos.js';

export async function avisar(cliente, texto, tipo = 'lista') {
  return modificar('avisos.json', avisos => {
    const aviso = { id: `a${Date.now()}-${avisos.length + 1}`, fecha: new Date().toISOString(), clienteId: cliente.id, clienteNombre: cliente.nombre, telefono: cliente.telefono, tipo, texto };
    avisos.push(aviso);
    return aviso;
  });
}

export async function avisarLista(folio) {
  const orden = (await leer('ordenes.json')).find(item => item.folio === folio);
  if (!orden) throw Object.assign(new Error('Orden no encontrada'), { status: 404 });
  const cliente = (await leer('clientes.json')).find(item => item.id === orden.clienteId);
  return avisar(cliente, `¡Hola, ${cliente.nombre}! 👋 Tu ropa de la orden ${folio} ya está lista para recoger. 🧺✨`);
}

export async function recordatorioSemanal() {
  const [clientes, ordenes] = await Promise.all([leer('clientes.json'), leer('ordenes.json')]);
  const limite = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const avisos = [];
  for (const cliente of clientes) {
    if (!cliente.aceptaRecordatorios) continue;
    const fechas = [cliente.ultimaOrden, ...ordenes.filter(o => o.clienteId === cliente.id).map(o => o.creada)].filter(Boolean);
    if (fechas.some(fecha => new Date(fecha).getTime() > limite)) continue;
    avisos.push(await avisar(cliente, `¡Hola, ${cliente.nombre}! 👋 ¡Estamos listos para lavar tu ropa! 🧺✨ Cuando gustes, te esperamos.`, 'recordatorio'));
  }
  return { enviados: avisos.length, avisos };
}
