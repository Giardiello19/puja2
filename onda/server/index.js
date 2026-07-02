// ============================================================
// index.js — Servidor principal de ONDA.
// Express (API + estáticos) + Socket.io (tiempo real) + webhooks de pago.
// ============================================================
import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { Server as SocketServer } from 'socket.io';

import { authMiddleware } from './auth.js';
import { buildRoutes } from './routes.js';
import { initRealtime } from './auctions.js';
import * as stripePay from './payments/stripe.js';
import * as mpPay from './payments/mercadopago.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: true, credentials: true } });

// --- Webhooks: necesitan el cuerpo RAW, así que van ANTES de express.json() ---
app.post('/api/webhooks/stripe', express.raw({ type: '*/*' }), async (req, res) => {
  try { await stripePay.handleWebhook(req); res.json({ received: true }); }
  catch (e) { console.error('[stripe webhook]', e.message); res.status(400).send(e.message); }
});

app.post('/api/webhooks/mercadopago', express.raw({ type: '*/*' }), async (req, res) => {
  try { await mpPay.handleWebhook(req); res.sendStatus(200); }
  catch (e) { console.error('[mp webhook]', e.message); res.sendStatus(200); }
});

// --- Middleware general ---
app.use(express.json());
app.use(cookieParser());
app.use(authMiddleware);

// --- API ---
app.use('/api', buildRoutes());

// --- Estáticos (la app) ---
app.use(express.static(PUBLIC_DIR));
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// --- Tiempo real ---
initRealtime(io);

server.listen(PORT, () => {
  console.log(`\n  ONDA en vivo → http://localhost:${PORT}\n`);
  console.log('  Integraciones:');
  console.log('   • LiveKit (video):  ', process.env.LIVEKIT_URL ? 'ON' : 'OFF (modo demo)');
  console.log('   • Stripe:           ', stripePay.stripeEnabled() ? 'ON' : 'OFF');
  console.log('   • Mercado Pago:     ', mpPay.mercadopagoEnabled() ? 'ON' : 'OFF');
  console.log('   • Depósito demo:    ', String(process.env.DEMO_PAYMENTS).toLowerCase() === 'true' ? 'ON' : 'OFF');
  console.log('');
});
