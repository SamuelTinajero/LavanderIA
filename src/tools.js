import { cotizar } from './cotizar.js';
import { crearOrden, verOrden } from './ordenes.js';
import { registrarQueja } from './quejas.js';

// El enum obliga al modelo a usar solo ids válidos (lavado = por kilo; el exprés se pide con expres=true).
const IDS_SERVICIO = ['lavado', 'planchado', 'tintoreria', 'colchonetas', 'desmanchado', 'tenis', 'cobijas', 'edredon', 'peluches', 'uniformes', 'manteleria', 'toallas_spa', 'blancos_hotel'];
const item = { type: 'object', properties: { servicio: { type: 'string', enum: IDS_SERVICIO, description: 'Id del servicio. "lavado" es el lavado por kilo (también para exprés: usa expres=true).' }, cantidad: { type: 'number' }, prenda: { type: ['string', 'null'] } }, required: ['servicio', 'cantidad', 'prenda'], additionalProperties: false };
const listaItems = { type: 'array', items: item, minItems: 1 };
const definicion = (name, description, properties, required) => ({ type: 'function', name, description, strict: true, parameters: { type: 'object', properties, required, additionalProperties: false } });

export const TOOL_DEFINITIONS = [
  definicion('cotizar', 'Calcula el precio de servicios de lavandería.', { items: listaItems, expres: { type: ['boolean', 'null'] }, domicilio: { type: ['boolean', 'null'] } }, ['items', 'expres', 'domicilio']),
  definicion('crear_orden', 'Crea una orden para un cliente existente.', { cliente: { type: 'string' }, items: listaItems, expres: { type: ['boolean', 'null'] }, domicilio: { type: ['boolean', 'null'] } }, ['cliente', 'items', 'expres', 'domicilio']),
  definicion('estado_orden', 'Consulta el estado de una orden por folio.', { folio: { type: 'string' } }, ['folio']),
  definicion('registrar_queja', 'Registra una queja para revisión humana.', { descripcion: { type: 'string' }, folio: { type: ['string', 'null'] } }, ['descripcion', 'folio'])
];

function validarItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('Se requieren servicios');
  for (const item of items) {
    if (!item || typeof item.servicio !== 'string' || typeof item.cantidad !== 'number') throw new Error('Servicio o cantidad no válidos');
    if (item.prenda != null && typeof item.prenda !== 'string') throw new Error('Prenda no válida');
  }
}

export async function ejecutarHerramienta(nombre, args) {
  const datos = typeof args === 'string' ? JSON.parse(args) : args;
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new Error('Argumentos no válidos');
  let resultado;
  switch (nombre) {
    case 'cotizar':
    case 'crear_orden': {
      validarItems(datos.items);
      if (datos.expres != null && typeof datos.expres !== 'boolean') throw new Error('Exprés debe ser booleano');
      if (datos.domicilio != null && typeof datos.domicilio !== 'boolean') throw new Error('Domicilio debe ser booleano');
      const opciones = { expres: datos.expres ?? false, domicilio: datos.domicilio ?? false };
      if (nombre === 'crear_orden') {
        if (typeof datos.cliente !== 'string' || !datos.cliente.trim()) throw new Error('Cliente obligatorio');
        resultado = await crearOrden(datos.cliente, datos.items, opciones);
      } else resultado = cotizar({ items: datos.items, ...opciones });
      break;
    }
    case 'estado_orden':
      if (typeof datos.folio !== 'string' || !/^LAV-\d{4}-\d{4}$/.test(datos.folio)) throw new Error('Folio no válido');
      resultado = await verOrden(datos.folio);
      break;
    case 'registrar_queja':
      resultado = await registrarQueja(datos.descripcion, datos.folio ?? undefined);
      break;
    default: throw new Error(`Herramienta desconocida: ${nombre}`);
  }
  return JSON.stringify(resultado);
}
