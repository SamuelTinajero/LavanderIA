import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const directorioBase = resolve(dirname(fileURLToPath(import.meta.url)), '../datos');
const colas = new Map();

function ruta(archivo) {
  if (!/^[a-z]+\.json$/i.test(archivo)) throw new Error('Archivo de datos inválido');
  return join(resolve(process.env.DATA_DIR || directorioBase), archivo);
}

export async function leer(archivo) {
  try {
    return JSON.parse(await readFile(ruta(archivo), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function guardar(archivo, datos) {
  const destino = ruta(archivo);
  await mkdir(dirname(destino), { recursive: true });
  const temporal = `${destino}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporal, `${JSON.stringify(datos, null, 2)}\n`, 'utf8');
    await rename(temporal, destino);
  } finally {
    await unlink(temporal).catch(() => {});
  }
}

// Serializa cambios sobre un mismo archivo para conservar folios y avisos.
export function modificar(archivo, cambio) {
  const clave = ruta(archivo);
  const previo = colas.get(clave) || Promise.resolve();
  const actual = previo.catch(() => {}).then(async () => {
    const datos = await leer(archivo);
    const resultado = await cambio(datos);
    await guardar(archivo, datos);
    return resultado;
  });
  colas.set(clave, actual);
  actual.finally(() => { if (colas.get(clave) === actual) colas.delete(clave); }).catch(() => {});
  return actual;
}
