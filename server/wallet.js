// ============================================================
// wallet.js — Saldo del monedero. Los depósitos lo acreditan (Stripe/MP),
// las pujas ganadas lo debitan (escrow simple comprador → vendedor).
// ============================================================
import { db } from './db.js';

export function creditWallet(userId, amount, reason = '') {
  const u = db.getUser(userId);
  if (!u) return null;
  u.balance = Math.round((u.balance + Number(amount)) * 100) / 100;
  db.putUser(u);
  console.log(`[wallet] +${amount} → ${u.email} (${reason}) saldo=${u.balance}`);
  return u.balance;
}

export function debitWallet(userId, amount, reason = '') {
  const u = db.getUser(userId);
  if (!u) return { ok: false, error: 'Usuario no encontrado' };
  if (u.balance < amount) return { ok: false, error: 'Saldo insuficiente' };
  u.balance = Math.round((u.balance - Number(amount)) * 100) / 100;
  db.putUser(u);
  console.log(`[wallet] -${amount} → ${u.email} (${reason}) saldo=${u.balance}`);
  return { ok: true, balance: u.balance };
}

export function getBalance(userId) {
  const u = db.getUser(userId);
  return u ? u.balance : 0;
}
