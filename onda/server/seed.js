// ============================================================
// seed.js — Crea creadores y shows de demostración.
// Uso: npm run seed
// Login de prueba de los creadores: <handle>@onda.demo  /  demo1234
// ============================================================
import { nanoid } from 'nanoid';
import { db } from './db.js';
import { hashPassword } from './auth.js';

const GRADIENTS = [
  ['#FF3D7F', '#7A1640'], ['#4D5DFF', '#1A2280'], ['#C8FF3D', '#5C7A12'],
  ['#FFC23D', '#8A5F0C'], ['#9B5CFF', '#3D1F80'], ['#27D17C', '#0E5C36'],
];
function hashCode(str) { let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; } return h; }
function cover(seed, idx, w = 400, h = 520) {
  const [c1, c2] = GRADIENTS[idx % GRADIENTS.length];
  const emojis = ['🃏', '⚡', '🎴', '🏀', '👟', '🧸', '💎', '🔥', '⭐', '🎲'];
  const emoji = emojis[Math.abs(hashCode(seed)) % emojis.length];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></linearGradient></defs><rect width='${w}' height='${h}' fill='url(#g)'/><text x='50%' y='50%' font-size='${Math.round(w * 0.32)}' text-anchor='middle' dominant-baseline='central' opacity='0.5'>${emoji}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const DEMO = [
  { handle: 'lapolleriatcg', store: 'LaPolleriaTCG', city: 'CDMX', cat: 'Pokémon', verified: true, color: 0,
    show: { title: 'UPC 151 GRATIS + Bubble Mew desde $20', status: 'live', pickup: 'Teatro Blanquita, CDMX' } },
  { handle: 'sideline', store: 'Sideline', city: 'Guadalajara', cat: 'Deportivas', verified: true, color: 1,
    show: { title: "NOCHE DE RC'S", status: 'live', pickup: 'Centro, Guadalajara' } },
  { handle: 'collectorreserve', store: 'Collector.Reserve', city: 'Monterrey', cat: 'Pokémon', verified: true, color: 2,
    show: { title: 'Full case series 2 blaster ⚡️🌶️', status: 'live', pickup: 'Sur, Monterrey' } },
  { handle: 'sportscardsmty', store: 'sportscards.mty', city: 'Monterrey', cat: 'Deportivas', verified: false, color: 3,
    show: { title: 'LAMINE YAMAL ROOKIE 1/1 EN 100 PESOS', status: 'live', pickup: 'Tec, Monterrey' } },
  { handle: 'reuniclus', store: 'TPM_Reuniclus', city: 'CDMX', cat: 'Pokémon', verified: true, color: 4,
    show: { title: 'Acrílico ETB Gratis 🔥 Duelo de Sobres', status: 'soon', pickup: 'Blanquita, CDMX' } },
  { handle: 'arcubia29', store: 'arcubia29', city: 'Querétaro', cat: 'Pokémon', verified: false, color: 5,
    show: { title: 'Un bonito marco para tu carta fav', status: 'soon', pickup: 'Centro, Querétaro' } },
];

let n = 0;
for (const d of DEMO) {
  const email = `${d.handle}@onda.demo`;
  if (db.getUserByEmail(email)) continue;
  const user = db.putUser({
    id: 'usr_' + nanoid(10), email, passwordHash: hashPassword('demo1234'),
    displayName: d.store, role: 'creator', balance: 0, createdAt: Date.now(),
  });
  const seller = db.putSeller({
    id: 'sel_' + nanoid(8), userId: user.id, storeName: d.store, handle: d.handle,
    city: d.city, category: d.cat, verified: d.verified, color: d.color,
  });
  db.putShow({
    id: 'show_' + nanoid(12), sellerId: seller.id, title: d.show.title, category: d.cat,
    status: d.show.status, cover: cover(d.handle, d.color), shipping: 'Envío nacional',
    pickup: d.show.pickup, createdAt: Date.now() - n * 1000,
  });
  n++;
}

db.save();
console.log(`Seed listo: ${n} creadores/shows demo creados.`);
console.log('Login de creador de prueba:  lapolleriatcg@onda.demo  /  demo1234');
setTimeout(() => process.exit(0), 200);
