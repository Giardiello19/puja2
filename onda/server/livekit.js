// ============================================================
// livekit.js — Video en vivo real con LiveKit (open source, Apache-2.0).
//
// El creador transmite (publisher) y los espectadores ven (subscriber).
// El servidor firma tokens de acceso; las claves NUNCA llegan al navegador.
//
// Para activarlo, define en .env:
//   LIVEKIT_URL=wss://tu-proyecto.livekit.cloud   (o tu servidor self-hosted)
//   LIVEKIT_API_KEY=...
//   LIVEKIT_API_SECRET=...
// Consíguelas gratis en https://cloud.livekit.io  (o corre el binario open
// source: https://github.com/livekit/livekit).
//
// Si no hay claves, la app sigue funcionando en "modo demo" (sin video real).
// ============================================================
import { AccessToken } from 'livekit-server-sdk';

const URL = process.env.LIVEKIT_URL || '';
const KEY = process.env.LIVEKIT_API_KEY || '';
const SECRET = process.env.LIVEKIT_API_SECRET || '';

export function livekitEnabled() {
  return Boolean(URL && KEY && SECRET);
}

export function livekitUrl() {
  return URL;
}

// role: 'publisher' (creador) | 'subscriber' (espectador)
export async function createToken({ room, identity, name, role }) {
  if (!livekitEnabled()) throw new Error('LiveKit no está configurado');
  const at = new AccessToken(KEY, SECRET, {
    identity,
    name: name || identity,
    ttl: '2h',
  });
  const canPublish = role === 'publisher';
  at.addGrant({
    roomJoin: true,
    room,
    canPublish,
    canPublishData: true,   // permite enviar datos (reacciones, etc.)
    canSubscribe: true,
  });
  return await at.toJwt();
}
