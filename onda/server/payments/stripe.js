// ============================================================
// payments/stripe.js — Depósitos al monedero vía Stripe Checkout (alojado).
//
// No tocamos datos de tarjeta: redirigimos al checkout de Stripe y, cuando
// el webhook confirma el pago, acreditamos el saldo del usuario.
//
// .env:
//   STRIPE_SECRET_KEY=sk_test_...        (https://dashboard.stripe.com/apikeys)
//   STRIPE_WEBHOOK_SECRET=whsec_...      (al crear el endpoint de webhook)
//   STRIPE_CURRENCY=mxn                  (opcional, default mxn)
// ============================================================
import Stripe from 'stripe';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { creditWallet } from '../wallet.js';

const KEY = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const CURRENCY = (process.env.STRIPE_CURRENCY || 'mxn').toLowerCase();

let stripe = null;
if (KEY) stripe = new Stripe(KEY);

export function stripeEnabled() { return Boolean(stripe); }

// Crea una sesión de checkout para depositar `amount` (MXN) al monedero.
export async function createDepositSession({ user, amount, origin }) {
  if (!stripe) throw new Error('Stripe no está configurado');
  amount = Math.round(Number(amount));
  if (!(amount > 0)) throw new Error('Monto inválido');

  const payment = db.putPayment({
    id: 'pay_' + nanoid(12),
    userId: user.id,
    provider: 'stripe',
    externalId: null,
    amount,
    status: 'pending',
    kind: 'deposit',
    createdAt: Date.now(),
  });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: CURRENCY,
        product_data: { name: `Depósito a tu saldo ONDA` },
        unit_amount: amount * 100, // centavos
      },
      quantity: 1,
    }],
    metadata: { paymentId: payment.id, userId: user.id },
    success_url: `${origin}/?deposit=success&provider=stripe`,
    cancel_url: `${origin}/?deposit=cancel`,
  });

  payment.externalId = session.id;
  db.putPayment(payment);
  return { url: session.url, paymentId: payment.id };
}

// Maneja el webhook de Stripe. Devuelve true si procesó un pago.
export async function handleWebhook(req) {
  if (!stripe) return false;
  let event;
  if (WEBHOOK_SECRET) {
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } else {
    // Sin secreto configurado (solo dev): confiamos en el cuerpo.
    event = JSON.parse(req.body.toString());
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const paymentId = session.metadata?.paymentId;
    const payment = db.getPayment(paymentId);
    if (payment && payment.status === 'pending') {
      payment.status = 'paid';
      db.putPayment(payment);
      creditWallet(payment.userId, payment.amount, `Depósito Stripe`);
    }
    return true;
  }
  return false;
}
