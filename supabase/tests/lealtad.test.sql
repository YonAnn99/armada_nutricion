-- Pruebas de la base (pgTAP): `npx supabase test db`.
-- Todo corre en una transacción que se deshace al final.
BEGIN;
SELECT plan(24);

-- Equipo de prueba
INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin@prueba.mx', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c1', 'caja@prueba.mx', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f1', 'fuera@prueba.mx', 'authenticated', 'authenticated');
INSERT INTO public.perfiles (user_id, nombre, rol) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Admin Prueba', 'admin'),
  ('00000000-0000-0000-0000-0000000000c1', 'Caja Prueba', 'cajero');

-- Cliente de prueba (como postgres)
UPDATE public.config_lealtad SET sellos_meta = 3, cashback_pct = 5, compra_minima_sello = 100, compartida_bono_pts = 50;
INSERT INTO public.clientes (id, nombre, telefono, mes_cumple)
VALUES ('00000000-0000-0000-0000-00000000c001', 'Prueba Uno', '+525500000001',
        extract(month FROM now() AT TIME ZONE 'America/Mexico_City'));
INSERT INTO public.tarjetas (id, cliente_id, codigo, puntos, sellos, gasto_historico)
VALUES ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000c001', 'PRVEBA234567', 0, 2, 2900);

-- ---------------------------------------------------------------- anon
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT * FROM public.tarjetas $$, '42501', NULL, 'anon no lee tarjetas');
SELECT ok((SELECT public.tarjeta_publica('PRVEBA234567') IS NOT NULL), 'anon lee el pase público');
SELECT ok(NOT (public.tarjeta_publica('PRVEBA234567')::text ~ '5500000001'), 'el pase público no trae el celular');
SELECT is(public.tarjeta_publica('PRVEBA234567')->'tarjeta'->>'cliente', 'Prueba', 'solo el primer nombre');
SELECT throws_ok($$ SELECT public.alta_publica('XXXXXXXXXX', 'Hacker', '+525511111111') $$, '42501', NULL, 'anon no da altas directo');
SELECT throws_ok($$ SELECT public.registrar_compra('00000000-0000-0000-0000-00000000d001', 100) $$, '42501', NULL, 'anon no registra compras');
RESET ROLE;

-- ---------------------------------------------------------------- usuario sin perfil
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
SELECT is((SELECT count(*) FROM public.tarjetas), 0::bigint, 'sin perfil no ve tarjetas');
SELECT throws_ok($$ SELECT public.registrar_compra('00000000-0000-0000-0000-00000000d001', 100, NULL, false, true, 0, false, false, false, gen_random_uuid()) $$,
                 'P0001', 'No autorizado', 'sin perfil no registra');

-- ---------------------------------------------------------------- cajero
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
SELECT is((SELECT count(*) FROM public.tarjetas WHERE id = '00000000-0000-0000-0000-00000000d001'), 1::bigint, 'el cajero ve tarjetas');

SELECT is(
  (public.registrar_compra('00000000-0000-0000-0000-00000000d001', 1000, 'K-1', false, true, 0, false, false, false,
                           '11111111-1111-1111-1111-111111111111')->>'subio_nivel')::boolean,
  true, 'compra de $1,000 sube de Principiante a Atleta');
SELECT results_eq(
  $$ SELECT puntos, sellos, gasto_historico FROM public.tarjetas WHERE id = '00000000-0000-0000-0000-00000000d001' $$,
  $$ VALUES (50, 3, 3900.00::numeric(12,2)) $$, '5% de cashback, +1 sello y gasto acumulado');

-- Reintento con la misma llave: misma visita, sin duplicar saldos.
SELECT is(
  (public.registrar_compra('00000000-0000-0000-0000-00000000d001', 1000, 'K-1', false, true, 0, false, false, false,
                           '11111111-1111-1111-1111-111111111111')->>'reintento')::boolean,
  true, 'la misma llave es un reintento');
SELECT is((SELECT puntos FROM public.tarjetas WHERE id = '00000000-0000-0000-0000-00000000d001'), 50, 'el reintento no duplica puntos');

-- Canje de puntos parcial + premio de sellos (3/3): sin sello nuevo, excedente conservado.
SELECT lives_ok($$ SELECT public.registrar_compra('00000000-0000-0000-0000-00000000d001', 500, NULL, false, true, 20, true, false, false, gen_random_uuid()) $$,
                'canje parcial de puntos y premio de sellos');
SELECT results_eq(
  $$ SELECT puntos, sellos, premios_canjeados FROM public.tarjetas WHERE id = '00000000-0000-0000-0000-00000000d001' $$,
  $$ VALUES (55, 0, 1) $$, '50 − 20 + 25 de cashback; sellos 3 − 3 y sin sello en la compra del premio');

SELECT throws_ok($$ SELECT public.registrar_compra('00000000-0000-0000-0000-00000000d001', 500, NULL, false, true, 0, true, false, false, gen_random_uuid()) $$,
                 'P0001', 'Aún no completa sus 3 sellos', 'no se canjea sin completar');
SELECT throws_ok($$ SELECT public.registrar_compra('00000000-0000-0000-0000-00000000d001', 500, NULL, false, true, 999, false, false, false, gen_random_uuid()) $$,
                 'P0001', NULL, 'no se canjean más puntos de los que tiene');

-- Compra mínima: $50 no suma sello.
SELECT is((public.registrar_compra('00000000-0000-0000-0000-00000000d001', 50, NULL, false, true, 0, false, false, false, gen_random_uuid())
           ->'visita'->>'sello_sumado')::boolean, false, 'debajo de la compra mínima no hay sello');

-- Cumpleaños: una vez por año.
SELECT lives_ok($$ SELECT public.registrar_compra('00000000-0000-0000-0000-00000000d001', 200, NULL, false, false, 0, false, true, false, gen_random_uuid()) $$,
                'regalo de cumpleaños en su mes');
SELECT throws_ok($$ SELECT public.registrar_compra('00000000-0000-0000-0000-00000000d001', 200, NULL, false, false, 0, false, true, false, gen_random_uuid()) $$,
                 'P0001', 'El regalo de cumpleaños ya se entregó este año', 'el regalo no se repite');

-- Tarjeta prestada: bono al titular, no cuenta su gasto.
SELECT lives_ok($$ SELECT public.registrar_compra('00000000-0000-0000-0000-00000000d001', 800, NULL, true, true, 0, false, false, false, gen_random_uuid()) $$,
                'compra con tarjeta prestada');
SELECT results_eq(
  $$ SELECT m.tipo, m.cantidad FROM public.movimientos m JOIN public.visitas v ON v.id = m.visita_id
     WHERE v.tarjeta_prestada ORDER BY m.tipo $$,
  $$ VALUES ('bono_compartida'::text, 50::numeric(12,2)) $$, 'la prestada solo da el bono de embajador');

-- El cajero no ajusta saldos.
SELECT throws_ok($$ SELECT public.ajustar_tarjeta('00000000-0000-0000-0000-00000000d001', 5, 0, 0, 'regalo') $$,
                 'P0001', 'No autorizado', 'el cajero no hace ajustes');

-- ---------------------------------------------------------------- admin
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
SELECT lives_ok($$ SELECT public.ajustar_tarjeta('00000000-0000-0000-0000-00000000d001', 1, 10, 0, 'Compras anteriores') $$,
                'el admin ajusta con motivo');

SELECT * FROM finish();
ROLLBACK;
