# ONDA · App de subastas en vivo (full-stack, lista para correr)

ONDA es una app de **streaming con subastas en vivo** para coleccionables (cartas, sneakers, funkos, etc.), al estilo Whatnot. Esta versión ya **no es un prototipo**: trae backend real, video en vivo, subastas en tiempo real sincronizadas entre todos los espectadores, cuentas de usuario, canal de creador y pagos/depósitos con **Stripe** y **Mercado Pago**.

Funciona en **dos modos**:

- **Modo demo (de fábrica):** arranca con `npm install && npm start` sin configurar nada. Puedes registrarte, abrir un canal de creador, salir en vivo, correr subastas y "depositar" saldo de prueba. El video usa una portada estática y los pagos se simulan.
- **Modo real:** en cuanto pegas tus llaves en `.env`, se activan el video en vivo real (LiveKit), los cobros con Stripe y Mercado Pago, y los webhooks que acreditan el saldo.

---

## 1. Arranque rápido (modo demo)

Necesitas **Node.js 18 o superior** (no requiere compiladores ni dependencias nativas; corre en Windows, macOS y Linux).

```bash
npm install
cp .env.example .env      # en Windows: copy .env.example .env
npm run seed              # crea 6 creadores y shows de demostración
npm start
```

Abre **http://localhost:3000**.

Cuenta de creador de demo ya lista:

```
usuario:    lapolleriatcg@onda.demo
contraseña: demo1234
```

(Los demás creadores demo siguen el mismo patrón: `<handle>@onda.demo` / `demo1234`.)

También puedes crear tu propia cuenta desde la pestaña **Perfil → Crear cuenta**, depositar saldo de prueba y abrir tu canal en **Vender**.

---

## 2. Cómo se usa

**Como comprador:** entra al Feed, toca un show en vivo, deposita saldo y puja. El precio, el cronómetro y las pujas se sincronizan en tiempo real entre todos los espectadores. Cuando cierra la subasta, el monto se descuenta de tu saldo y queda en garantía (escrow). Cuando recibes el artículo, confirmas la recepción en **Actividad** y el dinero se libera al vendedor.

**Como creador:** ve a **Vender → Abrir canal de creador**, crea un show, y toca **Salir en vivo**. Desde la transmisión escribes el nombre del artículo, su precio inicial y el incremento, y tocas **Subastar**. El servidor maneja el cronómetro, las pujas y el cierre de forma autoritativa (incluye anti-sniping: si alguien puja en los últimos segundos, el reloj se extiende).

---

## 3. Activar el modo real (tus llaves en `.env`)

Edita el archivo `.env`. Cada bloque es independiente: puedes activar solo video, solo pagos, o todo.

### Video en vivo — LiveKit (open source, gratis para empezar)

LiveKit es open source (Apache-2.0). La forma más rápida es **LiveKit Cloud** (tiene capa gratuita); también puedes auto-hospedarlo.

1. Crea un proyecto en https://cloud.livekit.io
2. En *Settings → Keys* genera una API Key y su Secret.
3. Copia la URL del proyecto (algo como `wss://tu-proyecto.livekit.cloud`).

```env
LIVEKIT_URL=wss://tu-proyecto.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=tu_secreto_largo
```

El servidor firma los tokens de acceso; **las llaves nunca llegan al navegador**. El creador publica cámara y micrófono; los espectadores se suscriben automáticamente.

### Stripe (tarjetas)

1. Crea una cuenta en https://dashboard.stripe.com
2. En *Developers → API keys* copia tu **Secret key** (`sk_test_...` para pruebas).
3. Para que los depósitos acrediten saldo, configura un webhook en *Developers → Webhooks → Add endpoint*:
   - URL: `https://TU-DOMINIO/api/webhooks/stripe`
   - Evento: `checkout.session.completed`
   - Copia el **Signing secret** (`whsec_...`).

```env
STRIPE_SECRET_KEY=sk_test_xxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx
CURRENCY=mxn
```

Para probar webhooks en local puedes usar el [Stripe CLI](https://stripe.com/docs/stripe-cli):
`stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

### Mercado Pago

1. Entra a https://www.mercadopago.com.mx/developers
2. Crea una aplicación y copia el **Access Token** (`APP_USR-...`, o de prueba `TEST-...`).

```env
MP_ACCESS_TOKEN=APP_USR-xxxxxxxx
```

El `notification_url` (webhook) de Mercado Pago se manda automáticamente en cada pago apuntando a `https://TU-DOMINIO/api/webhooks/mercadopago`, así que no necesitas configurarlo a mano. Solo asegúrate de que `PUBLIC_URL` esté bien puesto en producción.

### Apagar el modo demo de pagos

Cuando ya tengas Stripe y/o Mercado Pago, pon:

```env
DEMO_PAYMENTS=false
```

Así desaparece el botón de "depósito de prueba" y solo quedan los cobros reales.

---

## 4. Variables de entorno (resumen)

| Variable | Para qué sirve |
|---|---|
| `PORT` | Puerto del servidor (default 3000). |
| `PUBLIC_URL` | URL pública en producción (p. ej. `https://onda.tudominio.com`). Se usa para los `return_url` y webhooks. |
| `JWT_SECRET` | **Cámbialo** por una cadena larga y aleatoria. Firma las sesiones. |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Video en vivo. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `CURRENCY` | Cobros con tarjeta. |
| `MP_ACCESS_TOKEN` | Cobros con Mercado Pago. |
| `DEMO_PAYMENTS` | `true` = depósitos simulados; `false` = solo pagos reales. |

---

## 5. Despliegue

Funciona en cualquier servicio que corra Node (Render, Railway, Fly.io, una VPS, etc.):

1. Sube el proyecto al servicio y define las variables de entorno del panel (no subas tu `.env`).
2. Comando de build: `npm install`. Comando de inicio: `npm start`.
3. Pon `PUBLIC_URL` con tu dominio real y `NODE_ENV=production` (esto hace que las cookies de sesión sean `secure`).
4. Para el video, usa LiveKit Cloud o tu propio servidor LiveKit.
5. Registra el webhook de Stripe apuntando a `https://TU-DOMINIO/api/webhooks/stripe`.

**Nota sobre datos:** por simplicidad el almacenamiento es un archivo JSON en `data/db.json` (cero dependencias nativas, ideal para arrancar). Para producción con tráfico real conviene migrar a una base de datos (Postgres, etc.); la capa de acceso está aislada en `server/db.js`, así que el cambio queda contenido en ese archivo.

---

## 6. Estructura del proyecto

```
onda/
├── server/
│   ├── index.js            Servidor Express + Socket.io + webhooks + estáticos
│   ├── routes.js           API REST (auth, shows, creador, depósitos, ventas)
│   ├── auth.js             Registro/login, hash de contraseña, JWT
│   ├── auctions.js         Motor de subastas en tiempo real (Socket.io)
│   ├── wallet.js           Saldo/monedero (créditos y débitos)
│   ├── livekit.js          Firma de tokens de video
│   ├── db.js               Almacenamiento JSON (capa aislada)
│   ├── seed.js             Crea creadores/shows de demostración
│   └── payments/
│       ├── stripe.js       Checkout + webhook de Stripe
│       └── mercadopago.js  Preference + webhook de Mercado Pago
├── public/
│   ├── index.html          App (carga socket.io, LiveKit, api.js, app.js)
│   ├── app.js              Toda la UI y la lógica de cliente
│   ├── api.js              Cliente del API + conexión de socket
│   └── styles.css          Estilos
├── .env.example            Plantilla de configuración
├── package.json
└── README.md
```

---

## 7. Cómo funciona el dinero (escrow)

1. El usuario **deposita** saldo (Stripe o Mercado Pago). El webhook confirma el pago y acredita el monedero.
2. Al **ganar una subasta**, el monto se **descuenta** del saldo y queda **en garantía** (`held`).
3. Cuando el comprador **confirma recepción** del artículo, el dinero se **libera al vendedor** (`completed`).

Esto refleja la "compra protegida" que tenía el diseño original.

---

## 8. Seguridad (importante para producción)

- Cambia `JWT_SECRET` por una cadena larga y única.
- Pon `NODE_ENV=production` para que las cookies de sesión viajen solo por HTTPS.
- Nunca subas tu archivo `.env` al repositorio (ya está en `.gitignore`).
- Las llaves secretas (Stripe, Mercado Pago, LiveKit) viven **solo en el servidor**; el navegador nunca las ve.
- Los pagos usan **checkout alojado** de Stripe y Mercado Pago: tu servidor (y esta app) **nunca tocan los datos de tarjeta**.

---

¡Listo! En modo demo lo puedes probar de inmediato, y en cuanto pongas tus llaves en `.env` queda 100% funcional para vender de verdad.
