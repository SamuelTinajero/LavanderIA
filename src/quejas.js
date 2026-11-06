import { modificar } from './datos.js';

export async function registrarQueja(descripcion, folio) {
  if (typeof descripcion !== 'string' || !descripcion.trim()) throw new Error('La descripción de la queja es obligatoria');
  if (folio !== undefined && (typeof folio !== 'string' || !/^LAV-\d{4}-\d{4}$/.test(folio))) throw new Error('Folio no válido');
  return modificar('quejas.json', quejas => {
    const queja = { id: `q${Date.now()}-${quejas.length + 1}`, fecha: new Date().toISOString(), descripcion: descripcion.trim(), ...(folio ? { folio } : {}), estado: 'abierta' };
    quejas.push(queja);
    return queja;
  });
}
