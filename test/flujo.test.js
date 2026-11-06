import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearOrden, cambiarEstado, entregar } from '../src/ordenes.js';
import { leer } from '../src/datos.js';
import { recordatorioSemanal } from '../src/avisos.js';
import { createApp } from '../server.js';

const origen = resolve(fileURLToPath(new URL('../datos/', import.meta.url)));
async function conDatos(fn) {
  const temporal = await mkdtemp(join(tmpdir(), 'lavanderia-'));
  const anterior = process.env.DATA_DIR;
  await cp(origen, temporal, { recursive: true });
  process.env.DATA_DIR = temporal;
  try { await fn(); }
  finally { if (anterior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = anterior; await rm(temporal, { recursive: true, force: true }); }
}

test('orden respeta estados y valida nombre al entregar', async () => conDatos(async () => {
  const orden = await crearOrden('Ana', [{ servicio: 'lavado', cantidad: 5 }]);
  assert.match(orden.folio, /^LAV-\d{4}-\d{4}$/);
  await assert.rejects(cambiarEstado(orden.folio, 'lista'), e => e.status === 409);
  await cambiarEstado(orden.folio, 'en_proceso');
  await cambiarEstado(orden.folio, 'lista');
  await assert.rejects(entregar(orden.folio, 'Luis'), e => e.status === 403);
  assert.equal((await entregar(orden.folio, 'Ana')).estado, 'entregada');
  assert.equal((await leer('avisos.json')).at(-1).tipo, 'lista');
}));

test('recordatorios solo para clientes elegibles', async () => conDatos(async () => {
  const resultado = await recordatorioSemanal();
  const nombres = resultado.avisos.map(a => a.clienteNombre);
  assert.deepEqual(nombres.sort(), ['Ana', 'Diego', 'Luis']);
  assert.ok(resultado.avisos.every(a => a.tipo === 'recordatorio'));
}));

test('servidor responde health, cotización, flujo y chat simulado', async () => conDatos(async () => {
  const servidor = createApp().listen(0);
  await new Promise(resolve => servidor.once('listening', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const json = async (ruta, method = 'GET', body) => {
    const respuesta = await fetch(base + ruta, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: respuesta.status, data: await respuesta.json() };
  };
  try {
    assert.deepEqual((await json('/health')).data, { status: 'ok', foundry: false });
    assert.equal((await json('/api/cotizar', 'POST', { items: [{ servicio: 'lavado', cantidad: 6 }], expres: true })).data.total, 270);
    const creada = await json('/api/ordenes', 'POST', { cliente: 'Ana', items: [{ servicio: 'lavado', cantidad: 6 }] });
    assert.equal(creada.status, 201);
    const folio = creada.data.folio;
    assert.equal((await json(`/api/ordenes/${folio}`, 'PATCH', { estado: 'en_proceso' })).data.estado, 'en_proceso');
    assert.equal((await json(`/api/ordenes/${folio}`, 'PATCH', { estado: 'lista' })).data.estado, 'lista');
    assert.ok((await json('/api/avisos')).data.some(a => a.tipo === 'lista' && a.texto.includes(folio)));
    assert.equal((await json('/api/chat', 'POST', { message: '' })).status, 422);
    assert.equal((await json('/api/chat', 'POST', { message: '¿Cuánto cuesta lavar 6 kg?' })).data.modo, 'simulado');
  } finally { await new Promise((resolve, reject) => servidor.close(e => e ? reject(e) : resolve())); }
}));
