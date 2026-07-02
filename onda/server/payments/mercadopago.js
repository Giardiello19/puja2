// ============================================================
// payments/mercadopago.js — Depósitos al monedero vía Mercado Pago (Checkout Pro).
//
// Creamos una "preferencia" de pago y redirigimos al checkout alojado de
// Mercado Pago. El webhook confirma y acreditamos el saldo.
//
// .env:
//   MP_ACCESS_TOKEN=APP_USR-...   (https://www.mercadopago.com.mx/developers → tus credenciales)
//   MP_WEBHOOK_SECRET=...         (opcional pero recomendado, para validar firma)
// ============================================================
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { creditWallet } from '../wallet.js';

const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';

let client = null;
if (ACCESS_TOKEN) client = new MercadoPagoConfig({ accessToken: ACCESS_TOKEN });

export function mercadopagoEnabled() { return Boolean(client); }

export async function createDepositPreference({ user, amount, origin }) {
  if (!client) throw new Error('Mercado Pago no está configurado');
  amount = Math.round(Number(amount));
  if (!(amount > 0)) throw new Error('Monto inválido');

  const payment = db.putPayment({
    id: 'pay_' + nanoid(12),
    userId: user.id,
    provider: 'mercadopago',
    externalId: null,
    amount,
    status: 'pending',
    kind: 'deposit',
    createdAt: Date.now(),
  });

  const pref = new Preference(client);
  const result = await pref.create({
    body: {
      items: [{
        id: payment.id,
        title: 'Depósito a tu saldo ONDA',
        quantity: 1,
        unit_price: amount,
        currency_id: 'MXN',
      }],
      external_reference: payment.id,
      metadata: { paymentId: payment.id, userId: user.id },
      back_urls: {
        success: `${origin}/?deposit=success&provider=mercadopago`,
        failure: `${origin}/?deposit=cancel`,
        pending: `${origin}/?deposit=pending`,
      },
      auto_return: 'approved',
      notification_url: `${origin}/api/webhooks/mercadopago`,
    },
  });

  payment.externalId = String(result.id);
  db.putPayment(payment);
  return { url: result.init_point, paymentId: payment.id };
}

// Webhook de Mercado Pago: notifica un id de pago; consultamos su estado real.
export async function handleWebhook(req) {
  if (!client) return false;
  const body = req.body ? JSON.parse(req.body.toString() || '{}') : {};
  const topic = body.type || req.query.type || req.query.topic;
  const paymentId = body.data?.id || req.query['data.id'] || req.query.id;
  if (topic !== 'payment' || !paymentId) return false;

  const mpPayment = new Payment(client);
  const info = await mpPayment.get({ id: paymentId });
  if (info.status !== 'approved') return false;

  const ref = info.external_reference;
  const payment = db.getPayment(ref);
  if (payment && payment.status === 'pending') {
    payment.status = 'paid';
    db.putPayment(payment);
    creditWallet(payment.userId, payment.amount, 'Depósito Mercado Pago');
  }
  return true;
}
