// ============================================================
// auth.js — Registro, login, JWT y middleware de autenticación.
// ============================================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { db } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-cambia-esto-en-produccion';
const TOKEN_DAYS = 30;

export function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

export function signToken(user) {
  return jwt.sign(
    { uid: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: `${TOKEN_DAYS}d` }
  );
}

export function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

// Vista pública de un usuario (sin hash de contraseña).
export function publicUser(u) {
  if (!u) return null;
  const seller = db.getSellerByUser(u.id);
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    balance: u.balance,
    createdAt: u.createdAt,
    seller: seller ? publicSeller(seller) : null,
  };
}

export function publicSeller(s) {
  if (!s) return null;
  return {
    id: s.id,
    handle: s.handle,
    storeName: s.storeName,
    city: s.city,
    category: s.category,
    verified: s.verified,
    color: s.color,
    followers: db.countFollowers(s.id),
  };
}

export function registerUser({ email, password, displayName }) {
  email = String(email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Correo inválido');
  if (!password || password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
  if (db.getUserByEmail(email)) throw new Error('Ya existe una cuenta con ese correo');

  const user = {
    id: 'usr_' + nanoid(10),
    email,
    passwordHash: hashPassword(password),
    displayName: (displayName || email.split('@')[0]).slice(0, 40),
    role: 'buyer',
    balance: 0,
    createdAt: Date.now(),
  };
  db.putUser(user);
  return user;
}

export function loginUser({ email, password }) {
  email = String(email || '').trim().toLowerCase();
  const user = db.getUserByEmail(email);
  if (!user) throw new Error('Correo o contraseña incorrectos');
  if (!bcrypt.compareSync(password || '', user.passwordHash)) {
    throw new Error('Correo o contraseña incorrectos');
  }
  return user;
}

// Middleware Express: adjunta req.user si hay token válido (header o cookie).
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || req.cookies?.onda_token;
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const u = db.getUser(payload.uid);
      if (u) req.user = u;
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Debes iniciar sesión' });
  next();
}
