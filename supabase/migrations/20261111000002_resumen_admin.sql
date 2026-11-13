-- =============================================================================
-- Resumen del panel admin, calculado en la base.
-- PostgREST corta las lecturas en 1000 filas: sumar visitas en el navegador
-- dejaría de cuadrar en cuanto la tienda pase de mil compras registradas.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resumen_admin(p_desde timestamptz DEFAULT NULL, p_hasta timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_totales jsonb;
  v_semanas jsonb;
  v_frecuencia numeric;
  v_semana_actual date := date_trunc('week', now() AT TIME ZONE 'America/Mexico_City')::date;
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;

  SELECT jsonb_build_object(
    'visitas',            count(*),
    'ventas',             coalesce(sum(v.total_ticket), 0),
    'clientes_atendidos', count(DISTINCT v.tarjeta_id),
    'ticket_promedio',    coalesce(round(avg(v.total_ticket), 2), 0),
    'puntos_ganados',     coalesce(sum(v.puntos_ganados), 0),
    'puntos_canjeados',   coalesce(sum(v.puntos_canjeados), 0),
    'sellos',             count(*) FILTER (WHERE v.sello_sumado),
    'premios',            count(*) FILTER (WHERE v.premio_sellos),
    'cumples',            count(*) FILTER (WHERE v.regalo_cumple),
    'cupones',            count(*) FILTER (WHERE v.cupon_usado),
    'prestadas',          count(*) FILTER (WHERE v.tarjeta_prestada),
    'clientes_nuevos',    (SELECT count(*) FROM public.clientes c
                           WHERE (p_desde IS NULL OR c.creado_en >= p_desde) AND (p_hasta IS NULL OR c.creado_en < p_hasta)),
    'altas_qr',           (SELECT count(*) FROM public.clientes c WHERE c.origen = 'qr'
                           AND (p_desde IS NULL OR c.creado_en >= p_desde) AND (p_hasta IS NULL OR c.creado_en < p_hasta)),
    'clientes_total',     (SELECT count(*) FROM public.clientes)
  ) INTO v_totales
  FROM public.visitas v
  WHERE (p_desde IS NULL OR v.creado_en >= p_desde) AND (p_hasta IS NULL OR v.creado_en < p_hasta);

  -- Últimas 8 semanas (lunes a domingo, hora de México), siempre las 8.
  SELECT jsonb_agg(jsonb_build_object('inicio', s.inicio, 'visitas', coalesce(x.visitas, 0), 'ventas', coalesce(x.ventas, 0))
                   ORDER BY s.inicio)
  INTO v_semanas
  FROM generate_series(v_semana_actual - 49, v_semana_actual, interval '7 days') AS s(inicio)
  LEFT JOIN (
    SELECT date_trunc('week', v.creado_en AT TIME ZONE 'America/Mexico_City')::date AS inicio,
           count(*) AS visitas, sum(v.total_ticket) AS ventas
    FROM public.visitas v
    WHERE v.creado_en >= (v_semana_actual - 49)::timestamp AT TIME ZONE 'America/Mexico_City'
    GROUP BY 1
  ) x ON x.inicio = s.inicio::date;

  -- Días promedio entre dos visitas del mismo cliente (últimos 180 días).
  SELECT round(avg(extract(epoch FROM g.hueco) / 86400)::numeric, 1) INTO v_frecuencia
  FROM (
    SELECT v.creado_en - lag(v.creado_en) OVER (PARTITION BY v.tarjeta_id ORDER BY v.creado_en) AS hueco
    FROM public.visitas v
    WHERE v.creado_en >= now() - interval '180 days' AND NOT v.tarjeta_prestada
  ) g
  WHERE g.hueco IS NOT NULL;

  RETURN v_totales || jsonb_build_object('semanas', coalesce(v_semanas, '[]'::jsonb), 'dias_entre_visitas', v_frecuencia);
END; $$;

REVOKE ALL ON FUNCTION public.resumen_admin(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resumen_admin(timestamptz, timestamptz) TO authenticated;
