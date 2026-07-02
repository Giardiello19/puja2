// ============================================================
// db.js — Almacén de datos en archivo JSON (cero dependencias nativas).
// Funciona en cualquier Node 18+ sin compilador. Para producción a gran
// escala puedes cambiar esta capa por Postgres/Mongo sin tocar el resto:
// solo conserva la misma API (getUser, createUser, getShow, ...).
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const EMPTY = {
  users: {},        // id -> { id, email, passwordHash, displayName, role, balance, createdAt }
  sellers: {},      // id (=userId) -> { id, userId, storeName, handle, city, category, verified, followers, color }
  shows: {},        // id -> { id, sellerId, title, category, status, cover, shipping, pickup, viewers, createdAt, currentItem }
  sales: {},        // id -> { id, showId, buyerId, sellerId, itemName, amount, status, createdAt }
  payments: {},     // id -> { id, userId, provider, externalId, amount, status, kind, createdAt }
  follows: {},      // `${userId}:${sellerId}` -> true
};

function load() {
  try {
    if (!fs.existsSync(DB_FILE)) return structuredClone(EMPTY);
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return { ...structuredClone(EMPTY), ...JSON.parse(raw) };
  } catch (e) {
    console.error('[db] no se pudo leer, arrancando vacío:', e.message);
    return structuredClone(EMPTY);
  }
}

let cache = load();
let writeTimer = null;

function persist() {
  // Escritura atómica diferida para no bloquear en cada cambio.
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
    fs.renameSync(tmp, DB_FILE);
  }, 50);
}

export function flush() {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

// Guarda al salir para no perder datos.
process.on('SIGINT', () => { try { flush(); } catch {} process.exit(0); });
process.on('SIGTERM', () => { try { flush(); } catch {} process.exit(0); });

// ---------- API genérica ----------
export const db = {
  raw: () => cache,
  save: persist,

  // Users
  getUser: (id) => cache.users[id] || null,
  getUserByEmail: (email) =>
    Object.values(cache.users).find(u => u.email === String(email).toLowerCase()) || null,
  putUser: (u) => { cache.users[u.id] = u; persist(); return u; },

  // Sellers (canal de creador)
  getSeller: (id) => cache.sellers[id] || null,
  getSellerByUser: (userId) =>
    Object.values(cache.sellers).find(s => s.userId === userId) || null,
  listSellers: () => Object.values(cache.sellers),
  putSeller: (s) => { cache.sellers[s.id] = s; persist(); return s; },

  // Shows
  getShow: (id) => cache.shows[id] || null,
  listShows: () => Object.values(cache.shows),
  putShow: (s) => { cache.shows[s.id] = s; persist(); return s; },
  deleteShow: (id) => { delete cache.shows[id]; persist(); },

  // Sales
  putSale: (s) => { cache.sales[s.id] = s; persist(); return s; },
  listSalesByBuyer: (buyerId) =>
    Object.values(cache.sales).filter(s => s.buyerId === buyerId),
  listSalesBySeller: (sellerId) =>
    Object.values(cache.sales).filter(s => s.sellerId === sellerId),
  getSale: (id) => cache.sales[id] || null,

  // Payments
  putPayment: (p) => { cache.payments[p.id] = p; persist(); return p; },
  getPayment: (id) => cache.payments[id] || null,
  getPaymentByExternal: (externalId) =>
    Object.values(cache.payments).find(p => p.externalId === String(externalId)) || null,
  listPaymentsByUser: (userId) =>
    Object.values(cache.payments).filter(p => p.userId === userId),

  // Follows
  follow: (userId, sellerId) => { cache.follows[`${userId}:${sellerId}`] = true; persist(); },
  unfollow: (userId, sellerId) => { delete cache.follows[`${userId}:${sellerId}`]; persist(); },
  isFollowing: (userId, sellerId) => !!cache.follows[`${userId}:${sellerId}`],
  countFollowers: (sellerId) =>
    Object.keys(cache.follows).filter(k => k.endsWith(`:${sellerId}`)).length,
};
