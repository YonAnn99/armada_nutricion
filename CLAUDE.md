# Armada Nutrition — Programa de lealtad (Armada Pass)

Lee también `AGENTS.md` (reglas de Next.js 16) y `README.md` (funcionamiento, despliegue, seguridad).

## ⛔ Regla #1: NO tocar Symvora ni su base de datos

- `/home/yonann/Documentos/symvora-saas` es OTRO proyecto (otro cliente). Solo se puede LEER como referencia.
  Nunca editar, commitear, instalar dependencias ni correr comandos que lo modifiquen.
- El proyecto de Supabase de Symvora (ref `ffswcgrahxsczvydngrd`, organización "SYMVORA_SaaS") está PROHIBIDO
  para Armada: nada de `supabase link`, `db push`, migraciones, SQL, seeds, usuarios ni llaves contra él, ni por
  CLI, MCP o dashboard.
- Antes de cualquier `supabase link`, `db push` o cambio remoto: comprobar `supabase/.temp/project-ref` y
  `NEXT_PUBLIC_SUPABASE_URL` en `.env.local`. Si no son del proyecto de Armada, o hay duda, DETENERSE y preguntar.
- Las cuentas de Supabase (y Vercel) de Armada son del nuevo cliente y las proporciona el usuario. Nunca reutilizar
  credenciales, tokens ni proyectos de Symvora.
- Mientras no haya credenciales de Armada, todo corre en Supabase LOCAL (Docker: `npx supabase start`,
  API `127.0.0.1:54321`, DB `127.0.0.1:54322`).
- `seed.sql` son datos de ejemplo: nunca se ejecuta en producción.

## Stack y estructura

- Next.js 16 (App Router, `src/proxy.ts` en vez de middleware) + Supabase (Postgres, Auth, RLS) + Tailwind v4 / shadcn
  (base-nova). Solo español, un solo negocio (sin multi-tenant). KYTE es el POS externo: aquí no se cobra.
- Motor de reglas puro: `src/features/lealtad/motor.ts`. `calcularCompra` es espejo de la RPC `registrar_compra`:
  si cambia una, cambia la otra.
- Migraciones: `supabase/migrations/`. Todo lo que mueve saldos se escribe SOLO por RPC `SECURITY DEFINER` con
  `search_path = ''`; no hay políticas de escritura en tarjetas, visitas, movimientos ni bitácora.
- Pantallas: `/caja` (validador), `/admin` (panel), `/tarjeta/[codigo]` (pase público), `/unirse/[codigo]` (registro QR).
- Sin Google Wallet (decisión del usuario).

## Marca

- Logo oficial en `public/marca/`: `logo-armada.png` (completo con "Fuerza para tu vida"), `isotipo.png` ("AV"),
  `wordmark.png` (nombre) y `icono-192/512.png` (íconos de la app/PWA). Todos con fondo transparente, sacados del
  logo original con fondo negro. Úsalos con el componente `src/components/marca.tsx`.
- Paleta: negro `#050507`, paneles `#0e0b16`, morado (escala purple de Tailwind) y blanco. Montserrat + Inter.
- La guía de uso para el cliente está en `DOCS/Guia_de_uso_Armada_Pass.pdf`.

## Comandos

`npm run dev` · `npm test` · `npx supabase test db` · `npm run lint` · `npm run build` ·
`npm run usuario -- correo "contraseña" "Nombre" admin|cajero`
