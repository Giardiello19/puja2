// ============================================================
// api.js — Capa de cliente: fetch, sesión, socket y config.
// ============================================================
const API = (() => {
  let token = localStorage.getItem('onda_token') || null;

  async function req(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch('/api' + path, {
      method,
      headers,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data.error || 'Error de red');
    return data;
  }

  return {
    get token() { return token; },
    setToken(t) { token = t; if (t) localStorage.setItem('onda_token', t); else localStorage.removeItem('onda_token'); },

    get: (p) => req('GET', p),
    post: (p, b) => req('POST', p, b),
    del: (p) => req('DELETE', p),

    // Atajos
    config: () => req('GET', '/config'),
    me: () => req('GET', '/me'),
    register: (b) => req('POST', '/auth/register', b),
    login: (b) => req('POST', '/auth/login', b),
    logout: () => req('POST', '/auth/logout'),
    shows: () => req('GET', '/shows'),
    show: (id) => req('GET', '/shows/' + id),
    applySeller: (b) => req('POST', '/seller/apply', b),
    createShow: (b) => req('POST', '/shows', b),
    goLive: (id) => req('POST', `/shows/${id}/go-live`),
    livekitToken: (room, role) => req('GET', `/livekit/token?room=${encodeURIComponent(room)}&role=${role}`),
    deposit: (provider, amount) => req('POST', '/deposit', { provider, amount }),
    depositDemo: (amount) => req('POST', '/deposit/demo', { amount }),
    sales: () => req('GET', '/sales'),
    confirmSale: (id) => req('POST', `/sales/${id}/confirm`),
    follow: (sellerId) => req('POST', '/follow/' + sellerId),
    unfollow: (sellerId) => req('DELETE', '/follow/' + sellerId),
  };
})();

// Estado global del cliente
const G = {
  user: null,
  config: { livekit: false, livekitUrl: '', stripe: false, mercadopago: false, demoPayments: false },
  socket: null,
};

function connectSocket() {
  if (G.socket) { G.socket.disconnect(); }
  G.socket = io({ auth: { token: API.token || '' } });
}
