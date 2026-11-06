// Restaura los datos de ejemplo (clientes, órdenes, avisos y quejas) a su estado inicial.
// Uso: npm run reset-demo
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const destino = process.env.DATA_DIR || join(raiz, 'datos');
await mkdir(destino, { recursive: true });
for (const archivo of ['clientes.json', 'ordenes.json', 'avisos.json', 'quejas.json']) {
  await copyFile(join(raiz, 'datos', 'seed', archivo), join(destino, archivo));
  console.log('Restaurado:', archivo);
}
console.log('Datos de demostración listos.');
