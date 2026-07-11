# El Profesor Carlos — Plataforma de cursos

Sitio de venta de cursos con pasarela de pago, entrega segura de PDFs y agendamiento de sesiones en vivo.

## Cómo funciona

1. **Compra**: el visitante da clic en *Comprar* en un curso y elige entre:
   - **Tarjeta / Yape (Culqi)** — pago inmediato, acceso al instante.
   - **Zelle · Pago Móvil · Binance** — reporta su referencia de pago; el acceso se libera cuando el administrador lo aprueba en `/admin`.
2. **Acceso**: al confirmarse el pago se genera un enlace único (`/acceso.html?token=…`) y se envía por correo (Resend). Desde ahí el comprador descarga el PDF (nunca hay URL pública al archivo) y agenda sus sesiones.
3. **Sesiones en vivo**: el profesor publica horarios por curso en `/admin`. Cada horario solo puede reservarlo una persona (reserva atómica en Postgres). Al reservar, el comprador recibe correo con invitación de calendario (.ics) y enlace de la videollamada.

## Despliegue en Railway

1. Crear un proyecto nuevo en Railway y conectar este repositorio.
2. Añadir el plugin **PostgreSQL** (genera `DATABASE_URL` automáticamente).
3. Añadir un **Volume** al servicio, montado en `/data` (los PDFs viven en `/data/pdfs`).
4. Configurar las variables de entorno (ver `.env.example`):
   - `CULQI_PUBLIC_KEY` / `CULQI_SECRET_KEY` — desde el panel de Culqi (usar llaves `_test_` hasta pasar la validación comercial de Culqi).
   - `RESEND_API_KEY` y `EMAIL_FROM` — desde Resend (verificar el dominio para buena entregabilidad).
   - `ADMIN_PASSWORD` — contraseña larga y única para `/admin`.
   - `APP_BASE_URL` — la URL pública del servicio (se usa en los correos).
   - `PDF_DIR=/data/pdfs`
   - `ZELLE_INFO`, `PAGOMOVIL_INFO`, `BINANCE_INFO` — los datos de cobro que ve el comprador en el pago manual.
5. Deploy. El comando de arranque (`railway.json`) crea las tablas y siembra los 3 cursos automáticamente.
6. Entrar a `/admin`, poner precios reales, subir los PDFs y publicar los primeros horarios.

### Cuando compren el dominio

En Railway: *Settings → Networking → Custom Domain*, agregar el dominio y crear el registro CNAME que Railway indique en el proveedor DNS. Actualizar `APP_BASE_URL`.

## Desarrollo local

```bash
npm install
cp .env.example .env   # completar valores
npm run db:setup       # crea tablas y siembra cursos
npm run dev            # http://localhost:3000
```
