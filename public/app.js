// ============================================================
// PUJA — App logic (conectada al backend real)
// ============================================================
const state = { route: 'feed', params: {}, shows: [], exploreFilter: 'todos' };

const $root = () => document.getElementById('view-root');
const money = (n) => '$' + Number(n || 0).toLocaleString('es-MX');
const initialsOf = (name) => (name || '?').replace(/[._@]/g, ' ').trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function toast(msg, icon) {
  const stack = document.getElementById('toast-stack');
  const e = document.createElement('div');
  e.className = 'toast';
  e.innerHTML = `${icon ? `<span>${icon}</span>` : ''}<span>${esc(msg)}</span>`;
  stack.appendChild(e);
  setTimeout(() => e.remove(), 2600);
}

// Placeholder de portada cuando un show no trae imagen
const GRADS = [['#FF3D7F', '#7A1640'], ['#4D5DFF', '#1A2280'], ['#2DD4BF', '#0E5C4E'], ['#FFC23D', '#8A5F0C'], ['#9B5CFF', '#3D1F80'], ['#27D17C', '#0E5C36']];
function coverFor(show) {
  if (show.cover) return show.cover;
  const [c1, c2] = GRADS[(show.seller?.color || 0) % 6];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='520'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></linearGradient></defs><rect width='400' height='520' fill='url(#g)'/><text x='50%' y='50%' font-size='128' text-anchor='middle' dominant-baseline='central' opacity='.5'>🔥</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function navigate(route, params = {}) {
  state.route = route; state.params = params;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.route === route));
  render(); window.scrollTo(0, 0);
}

document.getElementById('tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab'); if (!btn) return;
  navigate(btn.dataset.route);
});

// ============================================================
// BOOT
// ============================================================
async function boot() {
  try { G.config = await API.config(); } catch {}
  try { const r = await API.me(); G.user = r.user; } catch {}
  connectSocket();
  await refreshShows();
  render();
  handleDepositRedirect();
}

async function refreshShows() {
  try { const r = await API.shows(); state.shows = r.shows || []; } catch { state.shows = []; }
}

function handleDepositRedirect() {
  const p = new URLSearchParams(location.search);
  if (p.get('deposit') === 'success') {
    toast('¡Depósito recibido! Tu saldo se actualizará en segundos', '💸');
    setTimeout(refreshMe, 1500);
    history.replaceState({}, '', location.pathname);
  } else if (p.get('deposit') === 'cancel') {
    toast('Depósito cancelado', '↩️'); history.replaceState({}, '', location.pathname);
  }
}

async function refreshMe() { try { const r = await API.me(); G.user = r.user; if (state.route === 'profile') render(); } catch {} }

// ============================================================
// RENDER
// ============================================================
function render() {
  const root = $root(); root.innerHTML = ''; root.classList.remove('view-fade');
  let view;
  switch (state.route) {
    case 'feed': view = renderFeed(); break;
    case 'explore': view = renderExplore(); break;
    case 'sell': view = renderSell(); break;
    case 'activity': view = renderActivity(); break;
    case 'profile': view = renderProfile(); break;
    case 'sellerProfile': view = renderSellerProfile(state.params.id); break;
    default: view = renderFeed();
  }
  root.appendChild(view);
  requestAnimationFrame(() => root.classList.add('view-fade'));
}

// ============================================================
// CARDS
// ============================================================
function showCardHTML(show) {
  const s = show.seller || {};
  const isLive = show.status === 'live';
  return `
    <button class="show-card" data-action="open-show" data-id="${show.id}">
      <img src="${coverFor(show)}" alt="">
      <div class="show-card-gradient"></div>
      ${isLive ? `<div class="show-live-badge"><span class="dot"></span>EN VIVO</div>` : ''}
      <div class="show-card-info">
        ${!isLive ? `<span class="schedule-chip">⏰ ${show.status === 'ended' ? 'Finalizado' : 'Próximo'}</span>` : ''}
        <div class="show-card-title">${esc(show.title)}</div>
        <div class="show-card-seller">
          <span class="av av-c${s.color || 0}">${initialsOf(s.handle)}</span>
          <span>@${esc(s.handle)}</span>
        </div>
      </div>
    </button>`;
}

// ============================================================
// FEED
// ============================================================
function renderFeed() {
  const live = state.shows.filter(s => s.status === 'live');
  const soon = state.shows.filter(s => s.status === 'soon');
  const feat = live[0];
  const wrap = el('<div></div>');
  wrap.innerHTML = `
    <div class="topbar">
      <div class="topbar-logo">PUJA<span class="dot">.</span></div>
      <div class="topbar-actions">
        ${G.user ? `<button class="icon-btn" data-action="open-deposit" title="Depositar">💳</button>` : ''}
        <button class="icon-btn" data-action="goto-activity">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
        </button>
      </div>
    </div>
    <div class="live-ticker">
      <span class="pulse-dot"></span>
      <span class="live-ticker-text"><b>${live.length} shows en vivo</b> · subastas reales en tiempo real${G.config.livekit ? '' : ' · <i>modo demo de video</i>'}</span>
    </div>
    ${feat ? `
    <div class="hero" data-action="open-show" data-id="${feat.id}">
      <img src="${coverFor(feat)}" alt="">
      <div class="hero-overlay">
        <div class="hero-eyebrow">🔥 En vivo ahora</div>
        <div class="hero-title">${esc(feat.title)}</div>
        <div class="hero-sub">@${esc(feat.seller.handle)} · subasta en vivo</div>
        <div class="btn btn-primary" style="width:fit-content; padding:11px 20px;">Entrar al show →</div>
      </div>
    </div>` : `<div class="empty-state" style="margin:20px 18px;"><div class="empty-state-icon">📺</div><div style="font-weight:700;color:var(--bone);">Nadie en vivo ahorita</div><div>Sé el primero: ve a <b>Vender</b> y sal en vivo.</div></div>`}

    <div class="section"><div class="section-head"><div class="section-title">En vivo <span class="count-badge">${live.length}</span></div><button class="section-link" data-action="goto-explore">Ver todos ›</button></div></div>
    <div class="show-rail">${live.map(showCardHTML).join('') || '<div style="padding:0 18px;color:var(--bone-dim);font-size:13px;">—</div>'}</div>

    <div class="section"><div class="section-head"><div class="section-title">Próximos shows</div></div></div>
    <div class="show-grid">${soon.map(showCardHTML).join('') || '<div style="padding:0 18px;color:var(--bone-dim);font-size:13px;">Sin shows programados</div>'}</div>
    <div style="height:30px"></div>`;
  attachCommonHandlers(wrap);
  return wrap;
}

// ============================================================
// EXPLORE
// ============================================================
function renderExplore() {
  const wrap = el('<div></div>');
  const filters = ['todos', 'en vivo', 'próximos'];
  function list() {
    let l = state.shows;
    if (state.exploreFilter === 'en vivo') l = l.filter(s => s.status === 'live');
    else if (state.exploreFilter === 'próximos') l = l.filter(s => s.status === 'soon');
    return l;
  }
  function paint() {
    wrap.innerHTML = `
      <div class="topbar"><div class="topbar-logo" style="font-size:19px;">Explorar</div><button class="icon-btn" data-action="refresh">↻</button></div>
      <div class="pill-row">${filters.map(f => `<button class="pill ${f === state.exploreFilter ? 'active' : ''}" data-filter="${f}">${f}</button>`).join('')}</div>
      <div class="section" style="padding-top:8px;"><div class="section-head"><div class="section-title">${list().length} resultados</div></div></div>
      <div class="show-grid">${list().map(showCardHTML).join('')}</div>
      <div style="height:30px"></div>`;
    attachCommonHandlers(wrap);
    wrap.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { state.exploreFilter = b.dataset.filter; paint(); }));
    const rf = wrap.querySelector('[data-action="refresh"]');
    if (rf) rf.addEventListener('click', async () => { await refreshShows(); paint(); toast('Actualizado', '↻'); });
  }
  paint();
  return wrap;
}

// ============================================================
// STREAM VIEWER (espectador) — socket + LiveKit
// ============================================================
let lk = { room: null, screen: null, showId: null };

async function openStream(showId) {
  const show = state.shows.find(s => s.id === showId) || (await API.show(showId)).show;
  if (!show) return;
  lk.showId = showId;
  const seller = show.seller || {};

  const overlay = el('<div class="stream-screen" id="stream-screen"></div>');
  overlay.innerHTML = streamShellHTML(show, seller, false);
  document.body.appendChild(overlay);
  lk.screen = overlay;
  wireStreamCommon(overlay, show, seller, false);

  // Socket en tiempo real
  G.socket.emit('join_show', { showId });
  bindStreamSocket(overlay, show);

  // Video real (si LiveKit está configurado y el show está en vivo)
  if (G.config.livekit && show.status === 'live') {
    connectViewerVideo(overlay, showId).catch(() => setDemoVideo(overlay, show));
  } else {
    setDemoVideo(overlay, show);
  }
}

function setDemoVideo(overlay, show) {
  const v = overlay.querySelector('.stream-video-media');
  v.innerHTML = `<img src="${coverFor(show)}" alt="">`;
  if (!G.config.livekit) {
    overlay.querySelector('.stream-video-media').insertAdjacentHTML('beforeend',
      `<div class="demo-banner">Modo demo de video · configura LiveKit en .env para video en vivo real</div>`);
  }
}

async function connectViewerVideo(overlay, showId) {
  const { token, url } = await API.livekitToken(showId, 'subscriber');
  const room = new LivekitClient.Room({ adaptiveStream: true, dynacast: true });
  lk.room = room;
  room.on(LivekitClient.RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === 'video') {
      const media = overlay.querySelector('.stream-video-media');
      media.innerHTML = '';
      const elv = track.attach(); elv.classList.add('lk-video'); media.appendChild(elv);
    } else if (track.kind === 'audio') {
      track.attach();
    }
  });
  await room.connect(url, token);
}

function streamShellHTML(show, seller, isBroadcaster) {
  return `
    <div class="stream-video">
      <div class="stream-video-media"></div>
      <div class="stream-video-darken"></div>
      <div class="stream-topbar">
        <button class="stream-seller" ${isBroadcaster ? '' : `data-action="open-seller-from-stream" data-id="${seller.id}"`}>
          <span class="av av-c${seller.color || 0}">${initialsOf(seller.handle)}</span>
          <div><div class="stream-seller-name">@${esc(seller.handle)}</div><div class="stream-seller-followers">${(seller.followers || 0)} seguidores</div></div>
          ${isBroadcaster ? '' : `<button class="stream-follow-btn" data-action="toggle-follow-stream" data-id="${seller.id}">Seguir</button>`}
        </button>
        <div class="stream-top-right">
          <div class="live-pill"><span class="dot"></span>${isBroadcaster ? 'TRANSMITIENDO' : 'VIVO'}</div>
          <div class="viewer-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg><span class="viewer-count">0</span></div>
          <button class="stream-close" data-action="close-stream"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg></button>
        </div>
      </div>
      <div class="float-reactions"></div>

      <div class="auction-hud">
        <div class="auction-card" data-empty="true">
          <div class="auction-info" style="width:100%;">
            <div class="auction-name auction-empty-text">Esperando que el creador inicie una subasta…</div>
            <div class="auction-price-row" style="display:none;">
              <span class="auction-price-label">Puja actual</span>
              <span class="auction-price">$0</span>
              <span class="auction-timer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3" stroke-linecap="round"/></svg><span>—</span></span>
            </div>
            <div class="auction-bidder" style="display:none;">Último postor: <b>—</b></div>
            <div class="bidder-stack" style="display:none;"><span class="bidder-stack-text bs-text">sé el primero en pujar</span></div>
          </div>
        </div>
      </div>

      ${isBroadcaster ? broadcasterControlsHTML() : `
      <div class="bid-button-wrap">
        <button class="bid-button" data-action="place-bid" disabled>
          <span class="bid-button-ripple"></span>
          PUJAR <span class="bid-amount">—</span>
        </button>
      </div>`}

      <div class="stream-chat"></div>

      <div class="stream-bottom-bar">
        <input class="stream-chat-input" placeholder="Escribe algo chido..." data-action="chat-input">
        <button class="stream-side-action" data-action="send-heart"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg></button>
      </div>
    </div>`;
}

// Estilos del panel del creador, autoinyectados con prioridad forzada.
// Viven aquí (y no solo en styles.css) para que el panel se vea bien
// aunque el servidor tenga una hoja de estilos desactualizada en caché.
function ensureBcastStyles() {
  if (document.getElementById('bcast-style-v3')) return;
  const st = document.createElement('style');
  st.id = 'bcast-style-v3';
  st.textContent = `
  .bcast-controls{
    position:absolute !important; left:12px !important; right:12px !important;
    bottom:calc(env(safe-area-inset-bottom, 0px) + 66px) !important;
    top:auto !important; z-index:14 !important;
    display:flex !important; flex-direction:column !important; gap:10px !important;
    padding:12px 14px 14px !important;
    background:rgba(12,9,18,.92) !important; backdrop-filter:blur(12px) !important;
    border:1px solid var(--line) !important; border-radius:18px !important;
    box-shadow:0 8px 32px rgba(0,0,0,.5) !important;
  }
  .bcast-head{
    display:flex !important; align-items:center !important;
    justify-content:space-between !important;
  }
  .bcast-title{
    font-family:var(--f-mono) !important; font-size:10px !important; font-weight:700 !important;
    letter-spacing:.14em !important; text-transform:uppercase !important;
    color:var(--bone-dim) !important;
  }
  .bcast-end{
    padding:5px 12px !important;
    background:transparent !important; color:var(--danger) !important;
    border:1px solid rgba(255,82,82,.45) !important; border-radius:999px !important;
    font-family:var(--f-body) !important; font-size:12px !important; font-weight:600 !important;
    width:auto !important; flex:none !important;
  }
  .bcast-row{ display:flex !important; gap:10px !important; }
  .bcast-field{
    flex:1 1 0 !important; min-width:0 !important;
    display:flex !important; flex-direction:column !important; gap:5px !important;
  }
  .bcast-field > span{
    font-family:var(--f-mono) !important; font-size:9.5px !important; font-weight:700 !important;
    letter-spacing:.1em !important; text-transform:uppercase !important;
    color:var(--bone-dim) !important; padding-left:2px !important;
  }
  .bcast-input{
    display:block !important; width:100% !important; min-width:0 !important;
    height:44px !important; padding:0 12px !important; flex:none !important;
    background:var(--ink-3) !important; color:var(--bone) !important;
    border:1px solid var(--line) !important; border-radius:12px !important;
    font-family:var(--f-body) !important; font-size:14px !important;
  }
  .bcast-input:focus{ outline:none !important; border-color:var(--violet) !important; }
  .bcast-num{
    font-family:var(--f-mono) !important; font-size:18px !important;
    font-weight:700 !important; height:52px !important;
    text-align:center !important; letter-spacing:.02em !important;
  }
  .bcast-num::-webkit-outer-spin-button,
  .bcast-num::-webkit-inner-spin-button{ -webkit-appearance:none !important; margin:0 !important; }
  .bcast-num[type=number]{ -moz-appearance:textfield !important; appearance:textfield !important; }
  .bcast-start{
    width:100% !important; height:48px !important; padding:0 !important;
    flex:none !important; white-space:nowrap !important;
    border-radius:12px !important; font-size:15px !important;
  }
  /* En modo creador: la tarjeta de subasta sube al área superior
     y el chat flota arriba del panel. Nada se encima con los campos. */
  .is-bcast .auction-hud{
    bottom:auto !important;
    top:calc(env(safe-area-inset-top, 0px) + 76px) !important;
    z-index:9 !important;
  }
  .is-bcast .stream-chat{
    bottom:calc(env(safe-area-inset-bottom, 0px) + 310px) !important;
    height:70px !important; padding-bottom:0 !important;
  }
  .is-bcast .float-reactions{ z-index:5 !important; }
  `;
  document.head.appendChild(st);
}

function broadcasterControlsHTML() {
  return `
    <div class="bcast-controls">
      <div class="bcast-head">
        <span class="bcast-title">Nueva subasta</span>
        <button class="bcast-end" data-action="end-live">⏻ Terminar</button>
      </div>
      <input class="bcast-input" id="bc-name" placeholder="Nombre del artículo (ej. Charizard ex)">
      <div class="bcast-row">
        <label class="bcast-field">
          <span>Precio inicial</span>
          <input class="bcast-input bcast-num" id="bc-start" type="number" inputmode="numeric" min="1" value="50">
        </label>
        <label class="bcast-field">
          <span>Incremento</span>
          <input class="bcast-input bcast-num" id="bc-inc" type="number" inputmode="numeric" min="1" value="10">
        </label>
      </div>
      <button class="btn btn-primary bcast-start" data-action="start-item">▶ Subastar</button>
    </div>`;
}

function bindStreamSocket(overlay, show) {
  const s = G.socket;
  const off = [];
  const on = (ev, fn) => { s.on(ev, fn); off.push([ev, fn]); };
  overlay._cleanup = () => off.forEach(([ev, fn]) => s.off(ev, fn));

  on('snapshot', (snap) => {
    setViewers(overlay, snap.viewers);
    if (snap.auction) applyAuction(overlay, snap.auction);
  });
  on('viewers', ({ count }) => setViewers(overlay, count));
  on('item_started', (a) => { applyAuction(overlay, { ...a, open: true }); pushChat(overlay, { type: 'system', text: `🆕 ${a.itemName}` }); });
  on('bid_update', (d) => {
    setPrice(overlay, d.price, true); setTimer(overlay, d.secondsLeft);
    setBidder(overlay, d.highBidderName); setBidders(overlay, d.bidders);
    setBidBtn(overlay, d.price + (overlay._increment || 10));
  });
  on('tick', ({ secondsLeft }) => setTimer(overlay, secondsLeft));
  on('chat_msg', (m) => pushChat(overlay, m));
  on('reaction', () => { spawnHeart(overlay); });
  on('item_sold', (d) => {
    if (d.sold) { toast(`🔨 Vendido en ${money(d.amount)} a ${d.winnerName}`, '🎉'); pushChat(overlay, { type: 'system', text: `🔨 ¡VENDIDO! ${d.winnerName} · ${money(d.amount)}` }); }
    resetAuctionUI(overlay);
  });
  on('balance_maybe_changed', ({ userId }) => { if (G.user && G.user.id === userId) refreshMe(); });
  on('need_auth', () => { toast('Inicia sesión para participar', '🔑'); openAuthSheet(); });
  on('bid_error', (e) => { toast(e.error, '⚠️'); if (e.need) openDepositSheet(); });
  on('live_ended', () => { toast('La transmisión terminó', '👋'); closeStream(); });
}

function wireStreamCommon(overlay, show, seller, isBroadcaster) {
  overlay._increment = 10;
  overlay.querySelector('[data-action="close-stream"]').addEventListener('click', closeStream);

  const heart = overlay.querySelector('[data-action="send-heart"]');
  heart.addEventListener('click', () => { spawnHeart(overlay); G.socket.emit('reaction', { showId: show.id, emoji: '❤️' }); });

  const input = overlay.querySelector('[data-action="chat-input"]');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      if (!G.user) { toast('Inicia sesión para chatear', '🔑'); return openAuthSheet(); }
      G.socket.emit('chat', { showId: show.id, text: input.value.trim() }); input.value = '';
    }
  });

  const bidBtn = overlay.querySelector('[data-action="place-bid"]');
  if (bidBtn) bidBtn.addEventListener('click', () => {
    if (!G.user) { toast('Inicia sesión para pujar', '🔑'); return openAuthSheet(); }
    const ripple = bidBtn.querySelector('.bid-button-ripple');
    ripple.classList.remove('animate'); requestAnimationFrame(() => ripple.classList.add('animate'));
    G.socket.emit('place_bid', { showId: show.id });
    if (navigator.vibrate) navigator.vibrate(15);
  });

  const followBtn = overlay.querySelector('[data-action="toggle-follow-stream"]');
  if (followBtn) followBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!G.user) return openAuthSheet();
    try {
      if (followBtn.textContent === 'Seguir') { await API.follow(seller.id); followBtn.textContent = 'Siguiendo'; toast(`Sigues a @${seller.handle}`, '✅'); }
      else { await API.unfollow(seller.id); followBtn.textContent = 'Seguir'; }
    } catch (err) { toast(err.message, '⚠️'); }
  });

  const sellerBtn = overlay.querySelector('[data-action="open-seller-from-stream"]');
  if (sellerBtn) sellerBtn.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="toggle-follow-stream"]')) return;
    closeStream(); navigate('sellerProfile', { id: seller.id });
  });

  // Controles del creador
  const startBtn = overlay.querySelector('[data-action="start-item"]');
  if (startBtn) startBtn.addEventListener('click', () => {
    const name = overlay.querySelector('#bc-name').value.trim();
    const startPrice = Number(overlay.querySelector('#bc-start').value) || 0;
    const increment = Number(overlay.querySelector('#bc-inc').value) || 10;
    if (!name) return toast('Ponle nombre al artículo', '⚠️');
    overlay._increment = increment;
    G.socket.emit('start_item', { showId: show.id, name, startPrice, increment });
    overlay.querySelector('#bc-name').value = '';
  });
  const endBtn = overlay.querySelector('[data-action="end-live"]');
  if (endBtn) endBtn.addEventListener('click', () => {
    if (confirm('¿Terminar la transmisión?')) { G.socket.emit('end_live', { showId: show.id }); closeStream(); refreshShows(); }
  });
}

// --- helpers de UI del stream ---
function setViewers(o, n) { const e = o.querySelector('.viewer-count'); if (e) e.textContent = n; }
function setPrice(o, p, pop) { const e = o.querySelector('.auction-price'); if (e) { e.textContent = money(p); if (pop) { e.classList.remove('pop'); requestAnimationFrame(() => e.classList.add('pop')); } } }
function setTimer(o, s) { const t = o.querySelector('.auction-timer'); if (!t) return; t.classList.toggle('urgent', s <= 5); t.querySelector('span').textContent = `${s}s`; }
function setBidder(o, name) { const e = o.querySelector('.auction-bidder'); if (e && name) e.innerHTML = `Último postor: <b>${esc(name)}</b>`; }
function setBidders(o, arr) {
  const t = o.querySelector('.bs-text'); if (t) t.textContent = (arr && arr.length) ? `${arr.length} ${arr.length === 1 ? 'persona pujando' : 'personas pujando'}` : 'sé el primero en pujar';
}
function setBidBtn(o, amount) { const e = o.querySelector('.bid-amount'); const b = o.querySelector('[data-action="place-bid"]'); if (e) e.textContent = money(amount); if (b) b.disabled = false; }
function applyAuction(o, a) {
  o._increment = a.increment || 10;
  o.querySelector('.auction-empty-text')?.classList.add('hide');
  o.querySelector('.auction-name').textContent = a.itemName;
  o.querySelector('.auction-name').classList.remove('auction-empty-text');
  o.querySelector('.auction-price-row').style.display = '';
  o.querySelector('.auction-bidder').style.display = '';
  o.querySelector('.bidder-stack').style.display = '';
  setPrice(o, a.price, false); setTimer(o, a.secondsLeft);
  if (a.highBidderName) setBidder(o, a.highBidderName);
  setBidders(o, a.bidders || []);
  setBidBtn(o, a.price + (a.increment || 10));
}
function resetAuctionUI(o) {
  const b = o.querySelector('[data-action="place-bid"]'); if (b) { b.disabled = true; o.querySelector('.bid-amount').textContent = '—'; }
  o.querySelector('.auction-name').textContent = 'Esperando el siguiente artículo…';
  o.querySelector('.auction-price-row').style.display = 'none';
  o.querySelector('.auction-bidder').style.display = 'none';
}
function pushChat(o, msg) {
  const chat = o.querySelector('.stream-chat'); if (!chat) return;
  const row = document.createElement('div');
  if (msg.type === 'bid') { row.className = 'chat-msg is-bid'; row.innerHTML = `<span class="cu">${esc(msg.user)}</span><span>pujó</span><span class="amt">${money(msg.amount)}</span>`; }
  else if (msg.type === 'system') { row.className = 'chat-msg is-system'; row.innerHTML = `<span>${esc(msg.text)}</span>`; }
  else { row.className = 'chat-msg'; row.innerHTML = `<span class="cu">${esc(msg.user)}</span><span>${esc(msg.text)}</span>`; }
  chat.insertBefore(row, chat.firstChild);
  while (chat.children.length > 14) chat.removeChild(chat.lastChild);
}
function spawnHeart(o) {
  const fr = o.querySelector('.float-reactions'); if (!fr) return;
  const h = document.createElement('div'); h.className = 'fr-heart';
  h.textContent = ['❤️', '🔥', '😍', '👏'][Math.floor(Math.random() * 4)];
  h.style.left = (Math.random() * 30) + 'px'; h.style.setProperty('--drift', (Math.random() * 40 - 20) + 'px');
  fr.appendChild(h); setTimeout(() => h.remove(), 2500);
}

function closeStream() {
  const o = lk.screen || document.getElementById('stream-screen');
  if (lk.showId) G.socket.emit('leave_show', { showId: lk.showId });
  if (o && o._cleanup) o._cleanup();
  if (lk.room) { try { lk.room.disconnect(); } catch {} lk.room = null; }
  if (o) o.remove();
  lk = { room: null, screen: null, showId: null };
}

// ============================================================
// BROADCASTER (creador sale en vivo)
// ============================================================
async function openBroadcaster(showId) {
  ensureBcastStyles();
  const r = await API.show(showId); const show = r.show; if (!show) return;
  const seller = show.seller || {};
  lk.showId = showId;

  const overlay = el('<div class="stream-screen is-bcast" id="stream-screen"></div>');
  overlay.innerHTML = streamShellHTML(show, seller, true);
  document.body.appendChild(overlay);
  lk.screen = overlay;
  wireStreamCommon(overlay, show, seller, true);

  G.socket.emit('join_show', { showId });
  bindStreamSocket(overlay, show);

  if (G.config.livekit) {
    try {
      const { token, url } = await API.livekitToken(showId, 'publisher');
      const room = new LivekitClient.Room({ adaptiveStream: true, dynacast: true });
      lk.room = room;
      await room.connect(url, token);
      await room.localParticipant.enableCameraAndMicrophone();
      const media = overlay.querySelector('.stream-video-media');
      const pub = room.localParticipant.getTrackPublication(LivekitClient.Track.Source.Camera);
      if (pub?.track) { const v = pub.track.attach(); v.classList.add('lk-video'); media.appendChild(v); }
      toast('¡Estás en vivo! 🔴', '📹');
    } catch (e) {
      toast('No se pudo acceder a la cámara: ' + e.message, '⚠️');
      setDemoVideo(overlay, show);
    }
  } else {
    setDemoVideo(overlay, show);
    toast('Modo demo: configura LiveKit para transmitir video real', 'ℹ️');
  }
}

// ============================================================
// SELL / CANAL DE CREADOR
// ============================================================
function renderSell() {
  const wrap = el('<div></div>');
  if (!G.user) { wrap.innerHTML = sellGateHTML(); attachCommonHandlers(wrap); wireAuthInline(wrap); return wrap; }
  if (G.user.role !== 'creator' || !G.user.seller) { wrap.innerHTML = sellApplyHTML(); wireSellApply(wrap); attachCommonHandlers(wrap); return wrap; }

  // Es creador → dashboard
  const myShows = state.shows.filter(s => s.seller && s.seller.id === G.user.seller.id);
  wrap.innerHTML = `
    <div class="topbar"><div class="topbar-logo" style="font-size:19px;">Tu canal</div><div style="width:38px"></div></div>
    <div style="padding:0 18px;">
      <div class="creator-banner">
        <div class="av av-c${G.user.seller.color}" style="width:48px;height:48px;font-size:18px;">${initialsOf(G.user.seller.handle)}</div>
        <div><div style="font-family:var(--f-display);font-size:18px;">@${esc(G.user.seller.handle)}</div><div style="color:var(--bone-dim);font-size:12px;">${G.user.seller.followers} seguidores · ${esc(G.user.seller.city)}</div></div>
      </div>
    </div>
    <div class="section"><div class="section-title" style="margin-bottom:12px;">Crear un show</div></div>
    <div style="padding:0 18px;">
      <div class="field"><label class="field-label">Título del show</label><input class="field-input" id="cs-title" placeholder="Ej. Noche de sobres Pokémon 🔥"></div>
      <div class="field"><label class="field-label">Categoría</label><input class="field-input" id="cs-cat" placeholder="Pokémon, tenis, funkos..." value="${esc(G.user.seller.category || '')}"></div>
      <div class="field"><label class="field-label">Pickup (opcional)</label><input class="field-input" id="cs-pickup" placeholder="Zona de entrega en persona"></div>
      <button class="btn btn-primary" data-action="create-show">Crear show</button>
    </div>
    <div class="section"><div class="section-title" style="margin-bottom:6px;">Mis shows <span class="count-badge">${myShows.length}</span></div></div>
    ${myShows.length === 0 ? `<div class="empty-state"><div class="empty-state-icon">🎬</div><div>Aún no tienes shows. Crea uno arriba.</div></div>` :
      myShows.map(s => `
      <div class="list-row">
        <img src="${coverFor(s)}" style="width:42px;height:42px;border-radius:10px;object-fit:cover;">
        <div class="list-row-text"><div class="list-row-title">${esc(s.title)}</div><div class="list-row-sub">${s.status === 'live' ? '🔴 En vivo' : s.status === 'ended' ? 'Finalizado' : '⏰ Próximo'}</div></div>
        ${s.status === 'ended' ? '<span class="badge-gold">Fin</span>' :
          `<button class="btn btn-primary" style="width:auto;padding:9px 14px;font-size:13px;" data-action="go-live-show" data-id="${s.id}">${s.status === 'live' ? 'Reentrar' : '● Salir en vivo'}</button>`}
      </div>`).join('')}
    <div style="height:30px"></div>`;
  attachCommonHandlers(wrap);
  wrap.querySelector('[data-action="create-show"]').addEventListener('click', async () => {
    const title = wrap.querySelector('#cs-title').value.trim();
    if (!title) return toast('Ponle título al show', '⚠️');
    try {
      await API.createShow({ title, category: wrap.querySelector('#cs-cat').value.trim(), pickup: wrap.querySelector('#cs-pickup').value.trim() });
      await refreshShows(); toast('Show creado 🎬', '✅'); render();
    } catch (e) { toast(e.message, '⚠️'); }
  });
  wrap.querySelectorAll('[data-action="go-live-show"]').forEach(b => b.addEventListener('click', async () => {
    try { await API.goLive(b.dataset.id); await refreshShows(); openBroadcaster(b.dataset.id); }
    catch (e) { toast(e.message, '⚠️'); }
  }));
  return wrap;
}

function sellGateHTML() {
  return `
    <div class="topbar"><div class="topbar-logo" style="font-size:19px;">Vender en PUJA</div><div style="width:38px"></div></div>
    <div class="hero" style="aspect-ratio:16/9; background:linear-gradient(135deg, var(--signal), #B8265F);">
      <div class="hero-overlay"><div class="hero-eyebrow" style="background:var(--ink); color:var(--violet);">💰 Empieza hoy</div><div class="hero-title">Transmite y vende en vivo</div><div class="hero-sub">Crea tu cuenta para abrir tu canal de creador.</div></div>
    </div>
    <div id="auth-inline" style="padding:18px;"></div>`;
}

function sellApplyHTML() {
  return `
    <div class="topbar"><div class="topbar-logo" style="font-size:19px;">Abre tu canal</div><div style="width:38px"></div></div>
    <div class="hero" style="aspect-ratio:16/9; background:linear-gradient(135deg, var(--signal), #B8265F);">
      <div class="hero-overlay"><div class="hero-eyebrow" style="background:var(--ink); color:var(--violet);">💰 Canal de creador</div><div class="hero-title">Transmite y vende en vivo</div><div class="hero-sub">Configura tu tienda y sal en vivo en minutos.</div></div>
    </div>
    <div class="list-row"><div class="list-row-icon">⚡</div><div class="list-row-text"><div class="list-row-title">Subastas en tiempo real</div><div class="list-row-sub">Precio y timer sincronizados para todos</div></div></div>
    <div class="list-row"><div class="list-row-icon">📹</div><div class="list-row-text"><div class="list-row-title">Video en vivo</div><div class="list-row-sub">Transmite desde tu cámara (LiveKit)</div></div></div>
    <div class="list-row" style="border-bottom:none;"><div class="list-row-icon">🛡️</div><div class="list-row-text"><div class="list-row-title">Cobros protegidos</div><div class="list-row-sub">El pago se retiene hasta confirmar la entrega</div></div></div>
    <div class="section"><div class="section-title" style="margin-bottom:14px;">Configura tu tienda</div></div>
    <div style="padding:0 18px;">
      <div class="field"><label class="field-label">Nombre de tu tienda</label><input class="field-input" id="sl-name" placeholder="Ej. MikeCardsMTY"></div>
      <div class="field"><label class="field-label">Usuario (@handle)</label><input class="field-input" id="sl-handle" placeholder="mikecardsmty"></div>
      <div class="field"><label class="field-label">Ciudad</label><input class="field-input" id="sl-city" placeholder="Monterrey"></div>
      <div class="field"><label class="field-label">¿Qué vendes?</label><input class="field-input" id="sl-cat" placeholder="Cartas Pokémon, tenis, funkos..."></div>
      <button class="btn btn-primary" data-action="apply-seller">Abrir mi canal</button>
    </div>
    <div style="height:30px"></div>`;
}

function wireSellApply(wrap) {
  wrap.querySelector('[data-action="apply-seller"]').addEventListener('click', async () => {
    const storeName = wrap.querySelector('#sl-name').value.trim();
    if (!storeName) return toast('Pon el nombre de tu tienda', '⚠️');
    try {
      const r = await API.applySeller({
        storeName, handle: wrap.querySelector('#sl-handle').value.trim(),
        city: wrap.querySelector('#sl-city').value.trim(), category: wrap.querySelector('#sl-cat').value.trim(),
      });
      G.user = r.user; toast('¡Canal creado! 🚀', '✅'); render();
    } catch (e) { toast(e.message, '⚠️'); }
  });
}

// ============================================================
// ACTIVITY
// ============================================================
async function loadActivity(wrap) {
  try {
    const r = await API.sales();
    const purchases = r.purchases || [];
    const sales = r.sales || [];
    const box = wrap.querySelector('#activity-body');
    box.innerHTML = `
      <div class="section"><div class="section-title">Mis compras <span class="count-badge">${purchases.length}</span></div></div>
      ${purchases.length === 0 ? `<div class="empty-state"><div class="empty-state-icon">🔨</div><div style="font-weight:700;color:var(--bone);">Aún no ganas subastas</div><div>Entra a un show en vivo y haz tu primera puja.</div><button class="btn btn-primary" style="width:auto;padding:11px 22px;margin-top:8px;" data-action="goto-feed">Ver shows</button></div>` :
        purchases.map(p => `
          <div class="list-row">
            <div class="list-row-icon">📦</div>
            <div class="list-row-text"><div class="list-row-title">${esc(p.itemName)}</div><div class="list-row-sub">${money(p.amount)} · ${saleStatusLabel(p.status)}</div></div>
            ${p.status === 'held' ? `<button class="btn btn-primary" style="width:auto;padding:8px 12px;font-size:12px;" data-action="confirm-sale" data-id="${p.id}">Confirmar recibo</button>` : `<span class="badge-gold">${saleStatusLabel(p.status)}</span>`}
          </div>`).join('')}
      ${sales.length ? `<div class="section"><div class="section-title">Mis ventas <span class="count-badge">${sales.length}</span></div></div>
        ${sales.map(s => `<div class="list-row"><div class="list-row-icon">💰</div><div class="list-row-text"><div class="list-row-title">${esc(s.itemName)}</div><div class="list-row-sub">${money(s.amount)} · ${saleStatusLabel(s.status)}</div></div></div>`).join('')}` : ''}
      <div style="height:30px"></div>`;
    attachCommonHandlers(wrap);
    box.querySelectorAll('[data-action="confirm-sale"]').forEach(b => b.addEventListener('click', async () => {
      try { await API.confirmSale(b.dataset.id); toast('Recibo confirmado — fondos liberados al vendedor', '✅'); loadActivity(wrap); }
      catch (e) { toast(e.message, '⚠️'); }
    }));
  } catch (e) { /* not logged in */ }
}
function saleStatusLabel(s) { return { held: 'En protección', completed: 'Completada', pending_payment: 'Pago pendiente' }[s] || s; }

function renderActivity() {
  const wrap = el('<div></div>');
  wrap.innerHTML = `<div class="topbar"><div class="topbar-logo" style="font-size:19px;">Tu actividad</div><div style="width:38px"></div></div><div id="activity-body"></div>`;
  if (!G.user) { wrap.querySelector('#activity-body').innerHTML = `<div class="empty-state" style="margin-top:30px;"><div class="empty-state-icon">🔑</div><div style="font-weight:700;color:var(--bone);">Inicia sesión</div><div>para ver tus pujas y compras.</div><button class="btn btn-primary" style="width:auto;padding:11px 22px;margin-top:8px;" data-action="open-auth">Entrar</button></div>`; attachCommonHandlers(wrap); }
  else loadActivity(wrap);
  return wrap;
}

// ============================================================
// PROFILE
// ============================================================
function renderProfile() {
  const wrap = el('<div></div>');
  if (!G.user) {
    wrap.innerHTML = `<div class="topbar"><div class="topbar-logo" style="font-size:19px;">Perfil</div><div style="width:38px"></div></div><div id="auth-inline" style="padding:18px;"></div>`;
    wireAuthInline(wrap); return wrap;
  }
  const u = G.user;
  wrap.innerHTML = `
    <div class="topbar"><div class="topbar-logo" style="font-size:19px;">Perfil</div><button class="icon-btn" data-action="logout" title="Salir">⎋</button></div>
    <div style="display:flex; flex-direction:column; align-items:center; padding:24px 18px;">
      <div class="av av-c4" style="width:78px; height:78px; font-size:28px; margin-bottom:12px;">${initialsOf(u.displayName)}</div>
      <div style="font-family:var(--f-display); font-size:20px;">${esc(u.displayName)}</div>
      <div style="color:var(--bone-dim); font-size:13px; margin-top:2px;">${esc(u.email)} · ${u.role === 'creator' ? 'Creador' : 'Comprador'}</div>
      <div style="display:flex; gap:24px; margin-top:18px; align-items:flex-end;">
        <div style="text-align:center;"><div style="font-family:var(--f-mono); font-weight:700; font-size:22px; color:var(--violet);">${money(u.balance)}</div><div style="font-size:11px; color:var(--bone-dim);">Saldo</div></div>
      </div>
      <button class="btn btn-primary" style="width:auto;padding:12px 28px;margin-top:16px;" data-action="open-deposit">💳 Depositar saldo</button>
    </div>
    <div class="divider" style="margin:6px 18px;"></div>
    <div class="list-row" data-action="goto-activity"><div class="list-row-icon">🛍️</div><div class="list-row-text"><div class="list-row-title">Mis compras</div></div><span class="list-row-chevron">›</span></div>
    <div class="list-row" data-action="goto-sell"><div class="list-row-icon">💰</div><div class="list-row-text"><div class="list-row-title">${u.role === 'creator' ? 'Mi canal de creador' : 'Conviértete en vendedor'}</div></div><span class="list-row-chevron">›</span></div>
    <div class="list-row" style="border-bottom:none;" data-action="open-deposit"><div class="list-row-icon">💳</div><div class="list-row-text"><div class="list-row-title">Depositar / métodos de pago</div></div><span class="list-row-chevron">›</span></div>
    <div style="height:30px"></div>`;
  attachCommonHandlers(wrap);
  wrap.querySelector('[data-action="logout"]').addEventListener('click', async () => {
    try { await API.logout(); } catch {} API.setToken(null); G.user = null; connectSocket(); toast('Sesión cerrada', '👋'); navigate('feed');
  });
  return wrap;
}

// ============================================================
// SELLER PROFILE
// ============================================================
function renderSellerProfile(id) {
  const shows = state.shows.filter(s => s.seller && s.seller.id === id);
  const seller = shows[0]?.seller || { handle: 'tienda', color: 0, city: '', followers: 0, verified: false };
  const wrap = el('<div></div>');
  wrap.innerHTML = `
    <div class="topbar"><button class="icon-btn" data-action="go-back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="topbar-logo" style="font-size:17px;">@${esc(seller.handle)}</div><div style="width:38px"></div></div>
    <div style="display:flex; flex-direction:column; align-items:center; padding:22px 18px 16px;">
      <div class="av av-c${seller.color}" style="width:72px; height:72px; font-size:24px; margin-bottom:10px;">${initialsOf(seller.handle)}</div>
      <div style="display:flex; align-items:center; gap:6px;"><div style="font-family:var(--f-display); font-size:19px;">@${esc(seller.handle)}</div>${seller.verified ? '<span style="color:var(--cobalt);">✔️</span>' : ''}</div>
      <div style="color:var(--bone-dim); font-size:12.5px; margin-top:2px;">📍 ${esc(seller.city)} · ${seller.followers} seguidores</div>
    </div>
    <div class="section"><div class="section-title">Shows</div></div>
    ${shows.length === 0 ? `<div class="empty-state"><div class="empty-state-icon">📭</div><div>Sin shows todavía</div></div>` : `<div class="show-grid">${shows.map(showCardHTML).join('')}</div>`}
    <div style="height:30px"></div>`;
  attachCommonHandlers(wrap);
  return wrap;
}

// ============================================================
// AUTH (login / registro)
// ============================================================
function authFormHTML() {
  return `
    <div class="auth-tabs"><button class="auth-tab active" data-mode="login">Entrar</button><button class="auth-tab" data-mode="register">Crear cuenta</button></div>
    <div class="field" data-only="register" style="display:none;"><label class="field-label">Nombre</label><input class="field-input" id="au-name" placeholder="Tu nombre"></div>
    <div class="field"><label class="field-label">Correo</label><input class="field-input" id="au-email" type="email" placeholder="tu@correo.com"></div>
    <div class="field"><label class="field-label">Contraseña</label><input class="field-input" id="au-pass" type="password" placeholder="Mínimo 6 caracteres"></div>
    <button class="btn btn-primary" data-action="auth-submit">Entrar</button>
    <p style="text-align:center;font-size:11.5px;color:var(--bone-dim);margin-top:10px;">Al continuar aceptas las reglas de la comunidad.</p>`;
}

function wireAuthForm(container, onDone) {
  let mode = 'login';
  container.innerHTML = authFormHTML();
  const submit = container.querySelector('[data-action="auth-submit"]');
  container.querySelectorAll('.auth-tab').forEach(t => t.addEventListener('click', () => {
    mode = t.dataset.mode;
    container.querySelectorAll('.auth-tab').forEach(x => x.classList.toggle('active', x === t));
    container.querySelectorAll('[data-only="register"]').forEach(x => x.style.display = mode === 'register' ? '' : 'none');
    submit.textContent = mode === 'register' ? 'Crear cuenta' : 'Entrar';
  }));
  submit.addEventListener('click', async () => {
    const email = container.querySelector('#au-email').value.trim();
    const password = container.querySelector('#au-pass').value;
    const displayName = container.querySelector('#au-name')?.value.trim();
    try {
      const r = mode === 'register' ? await API.register({ email, password, displayName }) : await API.login({ email, password });
      API.setToken(r.token); G.user = r.user; connectSocket();
      toast(mode === 'register' ? '¡Bienvenido a PUJA! 💜' : '¡Hola de nuevo! 👋', '✅');
      onDone && onDone();
    } catch (e) { toast(e.message, '⚠️'); }
  });
}

function wireAuthInline(wrap) {
  const box = wrap.querySelector('#auth-inline'); if (!box) return;
  wireAuthForm(box, () => render());
}

function openAuthSheet() {
  const overlay = el('<div class="sheet-overlay" id="auth-sheet"></div>');
  overlay.innerHTML = `<div class="sheet"><div class="sheet-handle"></div><div style="font-family:var(--f-display);font-size:20px;margin-bottom:14px;">Entra a PUJA</div><div id="auth-box"></div></div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  wireAuthForm(overlay.querySelector('#auth-box'), () => { overlay.remove(); if (state.route === 'profile' || state.route === 'sell' || state.route === 'activity') render(); });
}

// ============================================================
// DEPÓSITO (Stripe / Mercado Pago / demo)
// ============================================================
function openDepositSheet() {
  if (!G.user) return openAuthSheet();
  const overlay = el('<div class="sheet-overlay" id="deposit-sheet"></div>');
  const c = G.config;
  overlay.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div style="font-family:var(--f-display);font-size:20px;margin-bottom:4px;">Depositar saldo</div>
      <div style="color:var(--bone-dim);font-size:12.5px;margin-bottom:14px;">Tu saldo actual: <b style="color:var(--violet);">${money(G.user.balance)}</b></div>
      <div class="amount-row">${[100, 200, 500, 1000].map(a => `<button class="amount-chip" data-amt="${a}">$${a}</button>`).join('')}</div>
      <div class="field"><label class="field-label">Monto (MXN)</label><input class="field-input" id="dep-amt" type="number" inputmode="numeric" placeholder="Ej. 500" value="500"></div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px;">
        ${c.stripe ? `<button class="btn btn-primary pay-btn" data-prov="stripe">Pagar con tarjeta (Stripe)</button>` : ''}
        ${c.mercadopago ? `<button class="btn pay-btn" style="background:#009EE3;color:#fff;" data-prov="mercadopago">Pagar con Mercado Pago</button>` : ''}
        ${c.demoPayments ? `<button class="btn btn-secondary pay-btn" data-prov="demo">Acreditar (modo demo)</button>` : ''}
        ${(!c.stripe && !c.mercadopago && !c.demoPayments) ? `<div class="empty-state" style="padding:16px;"><div>No hay método de pago configurado.</div><div style="font-size:12px;">Agrega claves de Stripe o Mercado Pago en <b>.env</b>.</div></div>` : ''}
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-amt]').forEach(b => b.addEventListener('click', () => {
    overlay.querySelector('#dep-amt').value = b.dataset.amt;
    overlay.querySelectorAll('.amount-chip').forEach(x => x.classList.toggle('active', x === b));
  }));
  overlay.querySelectorAll('.pay-btn').forEach(b => b.addEventListener('click', async () => {
    const amount = Number(overlay.querySelector('#dep-amt').value) || 0;
    if (amount <= 0) return toast('Monto inválido', '⚠️');
    try {
      if (b.dataset.prov === 'demo') {
        const r = await API.depositDemo(amount); G.user.balance = r.balance;
        toast('Saldo acreditado ✅', '💸'); overlay.remove(); if (state.route === 'profile') render();
      } else {
        const r = await API.deposit(b.dataset.prov, amount);
        toast('Redirigiendo al pago seguro…', '🔒');
        location.href = r.url;
      }
    } catch (e) { toast(e.message, '⚠️'); }
  }));
}

// ============================================================
// HANDLERS COMUNES
// ============================================================
function attachCommonHandlers(c) {
  c.querySelectorAll('[data-action="open-show"]').forEach(n => n.addEventListener('click', () => openStream(n.dataset.id)));
  const map = {
    'go-back': () => navigate('feed'),
    'goto-explore': () => navigate('explore'),
    'goto-feed': () => navigate('feed'),
    'goto-sell': () => navigate('sell'),
    'goto-activity': () => navigate('activity'),
    'open-deposit': () => openDepositSheet(),
    'open-auth': () => openAuthSheet(),
  };
  Object.entries(map).forEach(([action, fn]) => {
    c.querySelectorAll(`[data-action="${action}"]`).forEach(n => n.addEventListener('click', fn));
  });
}

// ============================================================
// INIT
// ============================================================
boot();
