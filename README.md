# Armada Pass — Programa de lealtad de Armada Nutrition

Pase digital (sin apps) para los clientes de Armada Nutrition, con validador de caja y panel de administración.
KYTE sigue siendo el punto de venta: aquí se identifica al cliente, se lee qué beneficio aplicar en KYTE y se
registra el total cobrado.

Basado en el módulo "Tarjetas de lealtad" de Symvora (sin Google Wallet), con el motor completo del simulador:

| Dinámica | Cómo funciona |
|---|---|
| Niveles | Descuento por gasto histórico (Principiante 5% / Atleta 10% / Culturista 15%, editables) |
| Cashback | % de lo cobrado vuelve como "Puntos Armada" (1 pt = $1). Canje parcial. Bienvenida al registrarse |
| Sellos | +1 por compra participante (compra mínima opcional); al completar la meta, el premio. El excedente se conserva |
| Promo relámpago | Texto en todos los pases, con fechas opcionales de inicio/fin |
| Cumpleaños | Regalo una vez al año, en el mes del cliente (hora de México) |
| Tarjeta compartida | Si un amigo compra con el pase: el amigo recibe el descuento de nivel y el titular un bono. No cuenta para el gasto, sellos ni cashback del titular |
| Reactivación | El panel marca inactivos (> N días); el admin les emite un cupón de regreso de un solo uso |
| Regla VIP | Texto libre por cliente; tiene prioridad sobre cupón y nivel |

Prioridad del beneficio principal en caja: **VIP > cupón > nivel > promociones vigentes**. Cada dinámica se puede
apagar global o por cliente.

## Pantallas

- `/caja` — Validador: cámara (QR), lector láser o captura (`ARM-101`, código o celular), búsqueda por nombre,
  pase manual con vista en vivo, cierre de la operación con vista previa.
- `/admin` — Resumen (KPIs, gráfica, por atender), Dinámicas (editor + vista previa), Clientes (filtros, edición,
  ajustes con motivo, historial, cupón, WhatsApp), Bitácora, QR de mostrador (cartel PDF), Equipo.
- `/tarjeta/[codigo]` — Pase público del cliente (animado, se puede agregar a la pantalla de inicio).
- `/unirse/[codigoAlta]` — Registro autónomo con el QR del mostrador.

## Desarrollo local

Requiere Node 24 y Docker.

```bash
npm install
npx supabase start          # base local (aplica migraciones y seed con 4 clientes de ejemplo)
# Copia las llaves que imprime `npx supabase status -o env` a .env.local (ver .env.example)
npm run usuario -- tu@correo.mx "contraseña-segura" "Tu Nombre" admin
npm run dev                 # http://localhost:3000
```

## Pruebas

```bash
npm test                    # lógica del motor, API de registro y contratos de seguridad SQL (Vitest)
npx supabase test db        # pgTAP: registrar_compra, permisos por rol, lecturas públicas
npm run lint && npm run build
```

## Producción

1. Crea un proyecto en Supabase y aplica las migraciones: `npx supabase link` y `npx supabase db push`.
   (No ejecutes `seed.sql` en producción: son datos de ejemplo.)
2. Crea el primer admin con `npm run usuario` apuntando a las llaves de producción.
3. Variables en Vercel: las de `.env.example`. `NEXT_PUBLIC_APP_URL=https://pase.armadanutrition.com`.
4. Turnstile (Cloudflare) es **obligatorio en producción**: sin `TURNSTILE_SECRET_KEY` el registro con QR responde 503.
5. En Supabase Auth deja apagado el registro público (los usuarios del equipo los crea el admin).

## Seguridad (heredada de Symvora)

- Todo lo que mueve saldos se escribe solo por RPC `SECURITY DEFINER` con `search_path=''`; no hay políticas de
  escritura directa en tarjetas, visitas, movimientos ni bitácora.
- `registrar_compra` es idempotente (llave por operación) y bloquea la tarjeta (`FOR UPDATE`).
- El pase público solo muestra el primer nombre; nunca el celular. Rate limit de 60 consultas/min por IP.
- El alta pública solo la ejecuta `service_role` a través de `/api/unirse` (rate limit, honeypot, Turnstile,
  tope de 100 altas diarias). Un celular ya registrado nunca recibe su pase por ahí.
