import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { leer } from './src/datos.js';
import { cotizar } from './src/cotizar.js';
import { crearOrden, cambiarEstado, entregar } from './src/ordenes.js';
import { recordatorioSemanal } from './src/avisos.js';
import { preguntar, foundryConfigurado } from './src/foundry.js';

const raiz = dirname(fileURLToPath(import.meta.url));
const ruta = (funcion) => async (req, res, next) => { try { await funcion(req, res); } catch (error) { next(error); } };

export function createApp() {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"] } } }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(join(raiz, 'public')));

  app.get('/health', (req, res) => res.json({ status: 'ok', foundry: foundryConfigurado() }));
  app.get('/api/tarifas', ruta(async (req, res) => res.json({ servicios: await leer('tarifas.json') })));
  app.post('/api/cotizar', ruta(async (req, res) => res.json(cotizar(req.body))));
  app.get('/api/clientes', ruta(async (req, res) => res.json(await leer('clientes.json'))));
  app.get('/api/ordenes', ruta(async (req, res) => res.json((await leer('ordenes.json')).sort((a, b) => b.creada.localeCompare(a.creada)))));
  app.post('/api/ordenes', ruta(async (req, res) => {
    const { cliente, items, expres, domicilio } = req.body || {};
    res.status(201).json(await crearOrden(cliente, items, { expres, domicilio }));
  }));
  app.patch('/api/ordenes/:folio', ruta(async (req, res) => res.json(await cambiarEstado(req.params.folio, req.body?.estado))));
  app.post('/api/ordenes/:folio/entregar', ruta(async (req, res) => res.json(await entregar(req.params.folio, req.body?.nombre))));
  app.get('/api/avisos', ruta(async (req, res) => res.json(await leer('avisos.json'))));
  app.post('/api/recordatorios', ruta(async (req, res) => res.json(await recordatorioSemanal())));
  app.get('/api/quejas', ruta(async (req, res) => res.json(await leer('quejas.json'))));
  app.post('/api/chat', rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, handler: (req, res) => res.status(429).json({ error: 'Demasiados mensajes; inténtalo en un minuto' }) }), ruta(async (req, res) => {
    const { message, conversationId } = req.body || {};
    if (typeof message !== 'string' || message.trim().length < 1 || message.length > 2000) return res.status(422).json({ error: 'El mensaje debe tener entre 1 y 2000 caracteres' });
    if (conversationId != null && typeof conversationId !== 'string') return res.status(422).json({ error: 'conversationId debe ser texto' });
    try { res.json(await preguntar(message, conversationId)); }
    catch (error) {
      // Solo en la terminal del servidor (nunca al navegador): tipo, código y mensaje recortado.
      console.error('Fallo al llamar a Foundry:', error?.name, error?.code ?? error?.status ?? '', String(error?.message ?? error).slice(0, 400));
      // El filtro de contenido de Azure bloqueó el mensaje (p. ej. intento de saltarse las reglas): respuesta amable, no un error.
      if (error?.code === 'content_filter') {
        return res.json({ answer: 'No puedo procesar ese mensaje. Solo puedo ayudarte con cotizaciones, órdenes, horarios y quejas de la lavandería. ¿Con cuál te apoyo?', conversationId: conversationId ?? null, sources: [], modo: 'foundry' });
      }
      res.status(502).json({ error: 'Servicio no disponible' });
    }
  }));
  app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: 'JSON no válido' });
    const status = error.status || (error instanceof TypeError ? 502 : 400);
    res.status(status).json({ error: status >= 500 ? 'Servicio no disponible' : error.message || 'Solicitud no válida' });
  });
  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createApp().listen(process.env.PORT || 3000, () => console.log(`LavanderIA escuchando en ${process.env.PORT || 3000}`));
}
