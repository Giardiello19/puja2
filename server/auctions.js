// ============================================================
// auctions.js — Motor de subastas y chat en tiempo real (Socket.io).
//
// El SERVIDOR es la autoridad: mantiene precio, timer y mejor postor, y los
// sincroniza a TODOS los espectadores. Incluye anti-sniping (extiende el
// tiempo si alguien puja en los últimos segundos) y liquidación contra el
// monedero al cerrar cada artículo (escrow simple).
// ============================================================
import { nanoid } from 'nanoid';
import { verifyToken } from './auth.js';
import { db } from './db.js';
import { debitWallet, creditWallet } from './wallet.js';

const auctions = new Map(); // showId -> auction state
const viewers = new Map();  // showId -> Set(socketId)

function roomName(showId) { return `show:${showId}`; }

function snapshot(showId) {
  const a = auctions.get(showId);
  const show = db.getShow(showId);
  return {
    showId,
    status: show?.status || 'offline',
    auction: a ? {
      itemName: a.itemName,
      itemImg: a.itemImg,
      price: a.price,
      increment: a.increment,
      secondsLeft: a.secondsLeft,
      highBidderName: a.highBidderName,
      bidders: a.bidders.slice(0, 5).map(b => b.name),
      open: a.open,
    } : null,
    viewers: viewers.get(showId)?.size || 0,
  };
}

export function initRealtime(io) {
  // --- Autenticación opcional del socket ---
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      const payload = verifyToken(token);
      if (payload) {
        const u = db.getUser(payload.uid);
        if (u) socket.data.user = u;
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    let currentShow = null;

    socket.on('join_show', ({ showId }) => {
      if (!showId) return;
      currentShow = showId;
      socket.join(roomName(showId));
      if (!viewers.has(showId)) viewers.set(showId, new Set());
      viewers.get(showId).add(socket.id);
      socket.emit('snapshot', snapshot(showId));
      io.to(roomName(showId)).emit('viewers', { count: viewers.get(showId).size });
    });

    socket.on('leave_show', ({ showId }) => leave(showId));
    function leave(showId) {
      if (!showId) return;
      socket.leave(roomName(showId));
      viewers.get(showId)?.delete(socket.id);
      io.to(roomName(showId)).emit('viewers', { count: viewers.get(showId)?.size || 0 });
    }

    // --- Chat ---
    socket.on('chat', ({ showId, text }) => {
      const user = socket.data.user;
      if (!user) return socket.emit('need_auth');
      text = String(text || '').slice(0, 200).trim();
      if (!text) return;
      io.to(roomName(showId)).emit('chat_msg', {
        type: 'chat', user: user.displayName, text,
      });
    });

    // --- Reacciones (corazones flotantes) ---
    socket.on('reaction', ({ showId, emoji }) => {
      io.to(roomName(showId)).emit('reaction', { emoji: emoji || '❤️' });
    });

    // --- Puja ---
    socket.on('place_bid', ({ showId }) => {
      const user = socket.data.user;
      if (!user) return socket.emit('need_auth');
      const a = auctions.get(showId);
      if (!a || !a.open) return socket.emit('bid_error', { error: 'No hay subasta activa' });

      const nextPrice = a.price + a.increment;
      // Verifica que el comprador tenga saldo para cubrir su puja.
      const fresh = db.getUser(user.id);
      if (fresh.balance < nextPrice) {
        return socket.emit('bid_error', { error: 'Saldo insuficiente — deposita para pujar', need: nextPrice });
      }
      a.price = nextPrice;
      a.highBidderId = user.id;
      a.highBidderName = user.displayName;
      if (!a.bidders.find(b => b.id === user.id)) a.bidders.unshift({ id: user.id, name: user.displayName });
      a.bidders = a.bidders.slice(0, 8);
      // Anti-sniping: si quedan pocos segundos, extiende.
      if (a.secondsLeft < 6) a.secondsLeft = 8;

      io.to(roomName(showId)).emit('bid_update', {
        price: a.price,
        highBidderName: a.highBidderName,
        secondsLeft: a.secondsLeft,
        bidders: a.bidders.slice(0, 5).map(b => b.name),
      });
      io.to(roomName(showId)).emit('chat_msg', { type: 'bid', user: user.displayName, amount: a.price });
    });

    // --- Controles del CREADOR ---
    socket.on('start_item', ({ showId, name, img, startPrice, increment }) => {
      const user = socket.data.user;
      const show = db.getShow(showId);
      if (!user || !show) return;
      const seller = db.getSellerByUser(user.id);
      if (!seller || seller.id !== show.sellerId) return socket.emit('not_owner');

      auctions.set(showId, {
        showId,
        itemName: String(name || 'Artículo').slice(0, 80),
        itemImg: img || show.cover,
        price: Math.max(0, Math.round(Number(startPrice) || 0)),
        increment: Math.max(1, Math.round(Number(increment) || 10)),
        secondsLeft: 20,
        highBidderId: null,
        highBidderName: null,
        bidders: [],
        open: true,
      });
      io.to(roomName(showId)).emit('item_started', snapshot(showId).auction);
      io.to(roomName(showId)).emit('chat_msg', { type: 'system', text: `🆕 Nuevo artículo: ${name}` });
    });

    socket.on('end_live', ({ showId }) => {
      const user = socket.data.user;
      const show = db.getShow(showId);
      if (!user || !show) return;
      const seller = db.getSellerByUser(user.id);
      if (!seller || seller.id !== show.sellerId) return;
      show.status = 'ended';
      db.putShow(show);
      auctions.delete(showId);
      io.to(roomName(showId)).emit('live_ended');
    });

    socket.on('disconnect', () => { if (currentShow) leave(currentShow); });
  });

  // --- Loop autoritativo de 1 segundo: corre los timers y cierra artículos ---
  setInterval(() => {
    for (const [showId, a] of auctions) {
      if (!a.open) continue;
      a.secondsLeft -= 1;
      if (a.secondsLeft > 0) {
        io.to(roomName(showId)).emit('tick', { secondsLeft: a.secondsLeft });
        continue;
      }
      // Cierre del artículo
      a.open = false;
      const show = db.getShow(showId);
      if (a.highBidderId) {
        closeSale(io, showId, show, a);
      } else {
        io.to(roomName(showId)).emit('item_sold', { sold: false });
        io.to(roomName(showId)).emit('chat_msg', { type: 'system', text: '⏱️ Sin pujas — artículo retirado' });
      }
    }
  }, 1000);
}

function closeSale(io, showId, show, a) {
  // Liquidación: debita al ganador hacia escrow; registra la venta.
  const debit = debitWallet(a.highBidderId, a.price, `Compra: ${a.itemName}`);
  let status = 'held';
  if (!debit.ok) status = 'pending_payment';

  const sale = db.putSale({
    id: 'sale_' + nanoid(10),
    showId,
    buyerId: a.highBidderId,
    sellerId: show.sellerId,
    itemName: a.itemName,
    amount: a.price,
    status, // held → liberado al seller cuando el comprador confirma recepción
    createdAt: Date.now(),
  });

  io.to(roomName(showId)).emit('item_sold', {
    sold: true,
    winnerName: a.highBidderName,
    amount: a.price,
    saleId: sale.id,
  });
  io.to(roomName(showId)).emit('chat_msg', {
    type: 'system',
    text: `🔨 ¡VENDIDO! ${a.highBidderName} ganó por $${a.price.toLocaleString('es-MX')}`,
  });
  // Notifica al socket del ganador si está conectado (para refrescar saldo).
  io.to(roomName(showId)).emit('balance_maybe_changed', { userId: a.highBidderId });
}

// Llamado cuando el comprador confirma recepción → libera fondos al vendedor.
export function releaseEscrow(saleId, buyerId) {
  const sale = db.getSale(saleId);
  if (!sale || sale.buyerId !== buyerId) return { ok: false, error: 'Venta no encontrada' };
  if (sale.status !== 'held') return { ok: false, error: 'Esta venta no está en escrow' };
  const seller = db.getSeller(sale.sellerId);
  if (seller) creditWallet(seller.userId, sale.amount, `Venta liberada: ${sale.itemName}`);
  sale.status = 'completed';
  db.putSale(sale);
  return { ok: true };
}
