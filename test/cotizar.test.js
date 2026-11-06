import test from 'node:test';
import assert from 'node:assert/strict';
import { cotizar } from '../src/cotizar.js';

test('lavado cobra mínimo de cuatro kg', () => {
  const resultado = cotizar({ items: [{ servicio: 'lavado', cantidad: 2 }] });
  assert.equal(resultado.lineas[0].cantidad, 4);
  assert.equal(resultado.total, 120);
});

test('seis kg exprés cuestan 270', () => {
  assert.equal(cotizar({ items: [{ servicio: 'lavado', cantidad: 6 }], expres: true }).total, 270);
});

test('trece piezas de planchado cobran dos docenas', () => {
  assert.equal(cotizar({ items: [{ servicio: 'planchado', cantidad: 13 }] }).total, 220);
});

test('colchonetas requieren cotización personal', () => {
  const resultado = cotizar({ items: [{ servicio: 'colchonetas', cantidad: 1 }] });
  assert.equal(resultado.requierePersona, true);
  assert.ok(resultado.notas.length);
});

test('diez kg aplican descuento al lavado', () => {
  const resultado = cotizar({ items: [{ servicio: 'lavado', cantidad: 10 }] });
  assert.equal(resultado.descuento, 30);
  assert.equal(resultado.total, 270);
});
