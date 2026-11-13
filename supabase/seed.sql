-- Datos de ejemplo SOLO para desarrollo local (`supabase db reset`).
-- Son los 4 clientes del simulador. El usuario admin se crea con
-- `npm run usuario -- correo contraseña "Nombre" admin`.
--
-- Usuarios de prueba creados en el Supabase LOCAL (no existen en producción):
--   Admin:  admin@armada.test  /  armada-admin-2026
--   Cajero: caja@armada.test   /  armada-caja-2026
--   Admin:  pruebas@armada.test  /  armada-1f173fda
-- Si haces `supabase db reset` se borran: vuelve a crearlos con `npm run usuario`.

DO $$
DECLARE
  v_anio integer := extract(year FROM now() AT TIME ZONE 'America/Mexico_City');
  v_mes  integer := extract(month FROM now() AT TIME ZONE 'America/Mexico_City');
  r record;
  v_cliente uuid;
  v_tarjeta uuid;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Alejandro Guzmán',       '+525541239876', v_mes,                      12500::numeric, 150, 4,  8, NULL::text, false, NULL::integer, true),
    ('Carlos ''Coach'' Mendoza','+525588776655', 5,                          6400,           80,  5,  4, '15% Descuento Permanente Mayorista / Entrenador', false, NULL, false),
    ('Sofía Ramírez',          '+525533441122', v_mes,                      3800,           45,  2, 52, NULL, false, v_anio, true),
    ('Marco Antonio Solís',    '+525599002211', 8,                          1500,           20,  1, 61, NULL, true,  NULL, true)
  ) AS x(nombre, telefono, mes, gasto, puntos, sellos, dias, vip, cupon, cumple_anio, niveles)
  LOOP
    INSERT INTO public.clientes (nombre, telefono, mes_cumple, origen)
    VALUES (r.nombre, r.telefono, r.mes, 'equipo') RETURNING id INTO v_cliente;
    INSERT INTO public.tarjetas (cliente_id, codigo, gasto_historico, puntos, sellos, ultima_visita, regla_vip,
                                 cupon_reactivacion, cupon_emitido_en, cumple_canjeado_anio, permite_niveles, creado_en)
    VALUES (v_cliente, public._codigo_aleatorio(12), r.gasto, r.puntos, r.sellos, now() - make_interval(days => r.dias),
            r.vip, r.cupon, CASE WHEN r.cupon THEN now() - interval '2 days' END, r.cumple_anio, r.niveles,
            now() - interval '120 days')
    RETURNING id INTO v_tarjeta;

    -- Historia: una visita cada ~9 días hasta la última, para el panel y la gráfica.
    INSERT INTO public.visitas (tarjeta_id, total_ticket, beneficio_tipo, beneficio_aplicado, puntos_ganados,
                                sello_sumado, idempotency_key, creado_en)
    SELECT v_tarjeta, (450 + (g * 137) % 900)::numeric, 'nivel', 'Datos de ejemplo', 25, true, gen_random_uuid(),
           now() - make_interval(days => r.dias + g * 9)
    FROM generate_series(0, 6) g;
    INSERT INTO public.movimientos (tarjeta_id, tipo, cantidad, visita_id, creado_en)
    SELECT v.tarjeta_id, 'sello', 1, v.id, v.creado_en FROM public.visitas v WHERE v.tarjeta_id = v_tarjeta;

    INSERT INTO public.bitacora (tipo, actor, descripcion, tarjeta_id, creado_en)
    VALUES ('registro', 'Datos de ejemplo', format('Cliente de ejemplo: %s', r.nombre), v_tarjeta, now() - interval '120 days');
  END LOOP;
END $$;
