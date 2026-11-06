import tarifas from '../datos/tarifas.json' with { type: 'json' };

const prendas = { camisa: 65, blusa: 65, pantalon: 75, falda: 75, saco: 120, vestido: 140, abrigo: 180, traje: 190 };
const redondear = numero => Math.round((numero + Number.EPSILON) * 100) / 100;

// Acepta el id ("lavado") o el nombre que use el cliente/IA ("Lavado por encargo", "lavandería exprés"...).
const normalizar = texto => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const alias = { 'lavado por encargo': 'lavado', 'lavado por kilo': 'lavado', 'lavado expres': 'lavado', 'lavanderia': 'lavado', 'lavado de ropa': 'lavado', 'servicio de planchado': 'planchado', 'plancha': 'planchado', 'limpieza de tenis': 'tenis', 'colchas': 'cobijas', 'cobertores': 'cobijas', 'toallas a spa': 'toallas_spa', 'toallas spa': 'toallas_spa', 'blancos para hoteles': 'blancos_hotel', 'blancos hotel': 'blancos_hotel' };
function buscarTarifa(lista, servicio) {
  const buscado = normalizar(servicio);
  if (!buscado) return undefined;
  return lista.find(t => t.id === servicio)
    ?? lista.find(t => t.id === alias[buscado])
    ?? lista.find(t => normalizar(t.nombre) === buscado || normalizar(t.id) === buscado.replace(/ /g, '_') || normalizar(t.id) === buscado);
}

export function cobrarLavado(kg) { return Math.max(kg, 4) * 30; }
export function cobrarPlanchado(piezas) { return Math.ceil(piezas / 12) * 110; }
export function cobrarTintoreria(prenda, piezas) {
  const precio = prenda ? prendas[String(prenda).toLowerCase()] : 65;
  if (!precio) throw new Error(`Prenda de tintorería no válida: ${prenda}`);
  return precio * piezas;
}

export function cotizar({ items, expres = false, domicilio = false } = {}) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('Se requiere al menos un servicio');
  if (typeof expres !== 'boolean' || typeof domicilio !== 'boolean') throw new Error('Exprés y domicilio deben ser booleanos');
  const lineas = [];
  const notas = [];
  let lavado = 0;
  let kgLavado = 0;
  let requierePersona = false;
  for (const item of items) {
    const tarifa = buscarTarifa(tarifas, item?.servicio);
    if (!tarifa) throw new Error(`Servicio no válido: ${item?.servicio ?? 'vacío'}`);
    const cantidad = item.cantidad;
    if (typeof cantidad !== 'number' || !Number.isFinite(cantidad) || cantidad <= 0) throw new Error('La cantidad debe ser un número positivo');
    if (tarifa.unidad !== 'kg' && !Number.isInteger(cantidad)) throw new Error('La cantidad de piezas o pares debe ser entera');
    let unidades = cantidad;
    let precio = tarifa.precio;
    let unidad = tarifa.unidad;
    if (tarifa.id === 'lavado') {
      unidades = Math.max(cantidad, 4);
      lavado += cobrarLavado(cantidad);
      kgLavado += cantidad;
    } else if (tarifa.id === 'planchado') unidades = Math.ceil(cantidad / 12);
    else if (tarifa.id === 'tintoreria') precio = cobrarTintoreria(item.prenda, 1);
    if (tarifa.cotizacion) {
      requierePersona = true;
      notas.push(`${tarifa.nombre}: precio orientativo; una persona confirmará la cotización.`);
    }
    const importe = precio === null ? 0 : redondear(unidades * precio);
    lineas.push({ concepto: tarifa.id === 'tintoreria' && item.prenda ? `${tarifa.nombre}: ${item.prenda}` : tarifa.nombre, cantidad: unidades, unidad, precioUnitario: precio, importe });
  }
  const descuento = kgLavado >= 10 ? redondear(lavado * 0.1) : 0;
  if (expres && lavado > 0) lineas.push({ concepto: 'Servicio exprés (24 h)', cantidad: 1, unidad: 'servicio', precioUnitario: redondear(lavado * 0.5), importe: redondear(lavado * 0.5) });
  const subtotal = redondear(lineas.reduce((suma, linea) => suma + linea.importe, 0) - descuento);
  const costoDomicilio = domicilio && subtotal < 300 ? 40 : 0;
  if (domicilio) lineas.push({ concepto: 'Servicio a domicilio', cantidad: 1, unidad: 'envío', precioUnitario: costoDomicilio, importe: costoDomicilio });
  return { lineas, descuento, domicilio: costoDomicilio, total: redondear(subtotal + costoDomicilio), requierePersona, notas };
}
