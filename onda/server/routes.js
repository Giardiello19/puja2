// ============================================================
// routes.js — API REST de ONDA.
// ============================================================
import express from 'express';
import { nanoid } from 'nanoid';
import { db } from './db.js';
import {
  registerUser, loginUser, signToken, publicUser, publicSeller, requireAuth,
} from './auth.js';
import { livekitEnabled, livekitUrl, createToken } from './livekit.js';
import * as stripePay from './payments/stripe.js';
import * as mpPay from './payments/mercadopago.js';
import { releaseEscrow } from './auctions.js';

const DEMO_PAYMENTS = String(process.env.DEMO_PAYMENTS || '').toLowerCase() === 'true';

export function buildRoutes() {
  const r = express.Router();

  // ---- Config pública para el cliente ----
  r.get('/config', (req, res) => {
    res.json({
      livekit: livekitEnabled(),
      livekitUrl: livekitUrl(),
      stripe: stripePay.stripeEnabled(),
      mercadopago: mpPay.mercadopagoEnabled(),
      demoPayments: DEMO_PAYMENTS,
    });
  });

  // ---- Auth ----
  r.post('/auth/register', (req, res) => {
    try {
      const user = registerUser(req.body || {});
      const token = signToken(user);
      setCookie(res, token);
      res.json({ token, user: publicUser(user) });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  r.post('/auth/login', (req, res) => {
    try {
      const user = loginUser(req.body || {});
      const token = signToken(user);
      setCookie(res, token);
      res.json({ token, user: publicUser(user) });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  r.post('/auth/logout', (req, res) => {
    res.clearCookie('onda_token');
    res.json({ ok: true });
  });

  r.get('/me', (req, res) => {
    if (!req.user) return res.json({ user: null });
    res.json({ user: publicUser(req.user) });
  });

  // ---- Shows (catálogo) ----
  r.get('/shows', (req, res) => {
    const shows = db.listShows().map(decorateShow).filter(Boolean);
    // vivos primero, luego por fecha
    shows.sort((a, b) => (b.status === 'live') - (a.status === 'live') || b.createdAt - a.createdAt);
    res.json({ shows });
  });

  r.get('/shows/:id', (req, res) => {
    const show = decorateShow(db.getShow(req.params.id));
    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    res.json({ show });
  });

  // ---- Canal de creador: convertirse en vendedor ----
  r.post('/seller/apply', requireAuth, (req, res) => {
    const { storeName, handle, city, category } = req.body || {};
    if (!storeName) return res.status(400).json({ error: 'Falta el nombre de la tienda' });
    let seller = db.getSellerByUser(req.user.id);
    const cleanHandle = (handle || storeName).toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 24) || 'tienda' + nanoid(4);
    if (seller) {
      seller.storeName = storeName; seller.city = city || seller.city; seller.category = category || seller.category;
      db.putSeller(seller);
    } else {
      seller = db.putSeller({
        id: 'sel_' + nanoid(8),
        userId: req.user.id,
        storeName,
        handle: cleanHandle,
        city: city || 'México',
        category: category || 'Coleccionables',
        verified: false,
        color: Math.floor(Math.random() * 6),
      });
    }
    // Promueve el rol a creador.
    const u = db.getUser(req.user.id);
    u.role = 'creator';
    db.putUser(u);
    res.json({ seller: publicSeller(seller), user: publicUser(u) });
  });

  // ---- Crear un show (solo creador) ----
  r.post('/shows', requireAuth, (req, res) => {
    const seller = db.getSellerByUser(req.user.id);
    if (!seller) return res.status(403).json({ error: 'Primero crea tu canal de creador' });
    const { title, category, shipping, pickup, cover } = req.body || {};
    if (!title) return res.status(400).json({ error: 'Ponle título a tu show' });
    const show = db.putShow({
      id: 'show_' + nanoid(12),
      sellerId: seller.id,
      title: String(title).slice(0, 120),
      category: category || seller.category,
      status: 'soon',           // soon → live (al salir en vivo) → ended
      cover: cover || '',
      shipping: shipping || 'Envío nacional',
      pickup: pickup || '',
      createdAt: Date.now(),
    });
    res.json({ show: decorateShow(show) });
  });

  // ---- Salir / terminar en vivo ----
  r.post('/shows/:id/go-live', requireAuth, (req, res) => {
    const show = db.getShow(req.params.id);
    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    const seller = db.getSellerByUser(req.user.id);
    if (!seller || seller.id !== show.sellerId) return res.status(403).json({ error: 'No es tu show' });
    show.status = 'live';
    db.putShow(show);
    res.json({ show: decorateShow(show) });
  });

  // ---- Token de LiveKit ----
  r.get('/livekit/token', requireAuth, async (req, res) => {
    try {
      const { room, role } = req.query;
      if (!room) return res.status(400).json({ error: 'Falta room' });
      const show = db.getShow(room);
      if (!show) return res.status(404).json({ error: 'Show no encontrado' });
      // Solo el dueño del show puede publicar.
      let grantRole = 'subscriber';
      if (role === 'publisher') {
        const seller = db.getSellerByUser(req.user.id);
        if (seller && seller.id === show.sellerId) grantRole = 'publisher';
        else return res.status(403).json({ error: 'Solo el creador puede transmitir' });
      }
      const token = await createToken({
        room, identity: req.user.id, name: req.user.displayName, role: grantRole,
      });
      res.json({ token, url: livekitUrl(), role: grantRole });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // ---- Depósitos ----
  r.post('/deposit', requireAuth, async (req, res) => {
    try {
      const { provider, amount } = req.body || {};
      const origin = originOf(req);
      if (provider === 'stripe') {
        if (!stripePay.stripeEnabled()) return res.status(400).json({ error: 'Stripe no configurado' });
        const out = await stripePay.createDepositSession({ user: req.user, amount, origin });
        return res.json(out);
      }
      if (provider === 'mercadopago') {
        if (!mpPay.mercadopagoEnabled()) return res.status(400).json({ error: 'Mercado Pago no configurado' });
        const out = await mpPay.createDepositPreference({ user: req.user, amount, origin });
        return res.json(out);
      }
      res.status(400).json({ error: 'Proveedor inválido' });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // ---- Depósito demo (solo si DEMO_PAYMENTS=true): acredita sin pasarela ----
  r.post('/deposit/demo', requireAuth, (req, res) => {
    if (!DEMO_PAYMENTS) return res.status(403).json({ error: 'Depósito demo deshabilitado' });
    const amount = Math.round(Number(req.body?.amount) || 0);
    if (!(amount > 0)) return res.status(400).json({ error: 'Monto inválido' });
    const u = db.getUser(req.user.id);
    u.balance += amount;
    db.putUser(u);
    res.json({ balance: u.balance });
  });

  // ---- Compras y ventas ----
  r.get('/sales', requireAuth, (req, res) => {
    res.json({
      purchases: db.listSalesByBuyer(req.user.id).sort((a, b) => b.createdAt - a.createdAt),
      sales: (() => {
        const s = db.getSellerByUser(req.user.id);
        return s ? db.listSalesBySeller(s.id).sort((a, b) => b.createdAt - a.createdAt) : [];
      })(),
    });
  });

  r.post('/sales/:id/confirm', requireAuth, (req, res) => {
    const out = releaseEscrow(req.params.id, req.user.id);
    if (!out.ok) return res.status(400).json(out);
    res.json(out);
  });

  // ---- Seguir / dejar de seguir ----
  r.post('/follow/:sellerId', requireAuth, (req, res) => {
    db.follow(req.user.id, req.params.sellerId);
    res.json({ following: true, followers: db.countFollowers(req.params.sellerId) });
  });
  r.delete('/follow/:sellerId', requireAuth, (req, res) => {
    db.unfollow(req.user.id, req.params.sellerId);
    res.json({ following: false, followers: db.countFollowers(req.params.sellerId) });
  });

  return r;
}

// ---------- helpers ----------
function setCookie(res, token) {
  res.cookie('onda_token', token, {
    httpOnly: true, sameSite: 'lax',
    maxAge: 30 * 24 * 3600 * 1000,
    secure: process.env.NODE_ENV === 'production',
  });
}

function originOf(req) {
  return process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
}

function decorateShow(show) {
  if (!show) return null;
  const seller = db.getSeller(show.sellerId);
  return {
    ...show,
    seller: seller ? publicSeller(seller) : { handle: 'desconocido', color: 0, storeName: '', city: '', verified: false, followers: 0 },
  };
}
