import { leer, modificar } from './datos.js';
import { cotizar } from './cotizar.js';
import { avisarLista } from './avisos.js';

const estados = ['cotizada', 'recibida', 'en_proceso', 'lista', 'entregada'];
const errorHttp = (mensaje, status) => Object.assign(new Error(mensaje), { status });

export async function crearOrden(cliente, items, opciones = {}) {
  const clientes = await leer('clientes.json');
  let encontrado = clientes.find(c => c.id === cliente || c.nombre.toLocaleLowerCase('es') === String(cliente || '').toLocaleLowerCase('es'));
  if (!encontrado) {
    // Demo: un cliente nuevo se registra solo con su nombre (sin teléfono ni recordatorios).
    const nombre = String(cliente || '').trim();
    if (nombre.length < 2 || nombre.length > 60) throw errorHttp('Cliente no encontrado', 404);
    encontrado = await modificar('clientes.json', lista => {
      const nuevo = { id: `c${lista.length + 1}`, nombre, telefono: '', aceptaRecordatorios: false, ultimaOrden: null };
      lista.push(nuevo);
      return nuevo;
    });
  }
  const { total } = cotizar({ items, ...opciones });
  const ahora = new Date().toISOString();
  const orden = await modificar('ordenes.json', ordenes => {
    const anio = new Date().getFullYear();
    const numeros = ordenes.map(o => new RegExp(`^LAV-${anio}-(\\d{4})$`).exec(o.folio)?.[1]).filter(Boolean).map(Number);
    const folio = `LAV-${anio}-${String(Math.max(0, ...numeros) + 1).padStart(4, '0')}`;
    const nueva = { folio, clienteId: encontrado.id, clienteNombre: encontrado.nombre, items, expres: opciones.expres ?? false, domicilio: opciones.domicilio ?? false, total, estado: 'recibida', creada: ahora, actualizada: ahora };
    ordenes.push(nueva);
    return nueva;
  });
  await modificar('clientes.json', lista => { const c = lista.find(item => item.id === encontrado.id); c.ultimaOrden = ahora; });
  return orden;
}

export async function verOrden(folio) {
  return (await leer('ordenes.json')).find(o => o.folio === folio) || null;
}

export async function cambiarEstado(folio, estado) {
  if (!estados.includes(estado) && estado !== 'abandono') throw errorHttp('Estado no válido', 422);
  const orden = await modificar('ordenes.json', ordenes => {
    const actual = ordenes.find(o => o.folio === folio);
    if (!actual) throw errorHttp('Orden no encontrada', 404);
    const siguiente = estados[estados.indexOf(actual.estado) + 1];
    if (estado !== siguiente && !(estado === 'abandono' && actual.estado === 'lista')) throw errorHttp('Transición de estado no permitida', 409);
    actual.estado = estado;
    actual.actualizada = new Date().toISOString();
    return actual;
  });
  if (estado === 'lista') await avisarLista(folio);
  return orden;
}

export async function entregar(folio, nombre) {
  const orden = await verOrden(folio);
  if (!orden) throw errorHttp('Orden no encontrada', 404);
  if (typeof nombre !== 'string' || nombre.trim().toLocaleLowerCase('es') !== orden.clienteNombre.trim().toLocaleLowerCase('es')) throw errorHttp('El nombre no coincide con el cliente', 403);
  return cambiarEstado(folio, 'entregada');
}
