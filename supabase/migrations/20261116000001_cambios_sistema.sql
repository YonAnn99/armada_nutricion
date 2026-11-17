-- Cambios al sistema - 16 nov 2026
-- 1. cashback_puntos_por_peso en config_lealtad (tasa de conversión: puntos por $)
-- 2. crear_pase_manual acepta permisos para asignar dinámicas al crear pase en caja

-- -----------------------------------------------------------------------------
-- 1. Agregar cashback_puntos_por_peso a config_lealtad
-- -----------------------------------------------------------------------------
ALTER TABLE public.config_lealtad
  ADD COLUMN IF NOT EXISTS cashback_puntos_por_peso numeric(5,2) NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.config_lealtad.cashback_puntos_por_peso IS
  'Cuántos puntos equivalen a 1 MXN de cashback. Default 1 (1 punto = $1). Ej: 50 = 50 puntos por $1.';

-- Constraint: debe ser positivo
ALTER TABLE public.config_lealtad
  ADD CONSTRAINT config_cashback_puntos_por_peso_ck CHECK (cashback_puntos_por_peso > 0);

-- -----------------------------------------------------------------------------
-- 2. Modificar crear_pase_manual para aceptar permisos
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_pase_manual(
  p_nombre text,
  p_telefono text,
  p_mes_cumple smallint DEFAULT NULL,
  p_permisos jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_telefono text := btrim(coalesce(p_telefono, ''));
  v_digitos text := right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 10);
  v_cliente_id uuid;
  v_tarjeta public.tarjetas%ROWTYPE;
  v_permisos jsonb := coalesce(p_permisos, '{}'::jsonb);
BEGIN
  IF NOT public.es_staff() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF length(v_nombre) NOT BETWEEN 2 AND 60 OR v_nombre ~* '(https?:|www\.|[<>/@])' THEN
    RAISE EXCEPTION 'Escribe el nombre (de 2 a 60 letras)';
  END IF;
  IF v_telefono !~ '^\+[0-9]{8,15}$' OR length(v_digitos) < 10 THEN
    RAISE EXCEPTION 'Revisa el número de celular';
  END IF;
  IF p_mes_cumple IS NOT NULL AND p_mes_cumple NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Mes de cumpleaños inválido';
  END IF;

  -- Al equipo sí se le devuelve la tarjeta existente: está frente al cliente.
  SELECT c.id INTO v_cliente_id FROM public.clientes c WHERE c.telefono_10 = v_digitos;
  IF v_cliente_id IS NOT NULL THEN
    RETURN jsonb_build_object('estado', 'existente',
      'tarjeta', public._estado_tarjeta((SELECT t.id FROM public.tarjetas t WHERE t.cliente_id = v_cliente_id)));
  END IF;

  INSERT INTO public.clientes (nombre, telefono, mes_cumple, origen)
  VALUES (v_nombre, v_telefono, p_mes_cumple, 'equipo') RETURNING id INTO v_cliente_id;
  v_tarjeta := public._crear_tarjeta(v_cliente_id);

  -- Aplicar permisos si se pasaron
  IF v_permisos <> '{}'::jsonb THEN
    UPDATE public.tarjetas SET
      permite_niveles    = coalesce((v_permisos->>'niveles')::boolean, permite_niveles),
      permite_cashback   = coalesce((v_permisos->>'cashback')::boolean, permite_cashback),
      permite_sellos     = coalesce((v_permisos->>'sellos')::boolean, permite_sellos),
      permite_promo      = coalesce((v_permisos->>'promo')::boolean, permite_promo),
      permite_cumple     = coalesce((v_permisos->>'cumple')::boolean, permite_cumple),
      permite_compartida = coalesce((v_permisos->>'compartida')::boolean, permite_compartida)
    WHERE id = v_tarjeta.id;
    -- Refrescar v_tarjeta
    SELECT * INTO v_tarjeta FROM public.tarjetas WHERE id = v_tarjeta.id;
  END IF;

  PERFORM public._bitacora('registro', format('Pase creado en caja para %s (#%s)', v_nombre, v_tarjeta.folio),
                           v_tarjeta.id, jsonb_build_object('origen', 'equipo', 'puntos_bienvenida', v_tarjeta.puntos, 'permisos', v_permisos));
  RETURN jsonb_build_object('estado', 'creada', 'tarjeta', public._estado_tarjeta(v_tarjeta.id));
END; $$;

-- Grant actualizado
REVOKE EXECUTE ON FUNCTION public.crear_pase_manual(text, text, smallint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.crear_pase_manual(text, text, smallint, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Actualizar registrar_compra para usar cashback_puntos_por_peso
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_compra(
  p_tarjeta_id      uuid,
  p_total           numeric,
  p_folio_kyte      text    DEFAULT NULL,
  p_prestada        boolean DEFAULT false,
  p_sumar_sello     boolean DEFAULT true,
  p_canjear_puntos  integer DEFAULT 0,
  p_canjear_sellos  boolean DEFAULT false,
  p_entregar_cumple boolean DEFAULT false,
  p_usar_cupon      boolean DEFAULT false,
  p_idempotency_key uuid    DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existente public.visitas%ROWTYPE;
  v_config public.config_lealtad%ROWTYPE;
  t public.tarjetas%ROWTYPE;
  v_cliente public.clientes%ROWTYPE;
  v_nivel_antes public.niveles%ROWTYPE;
  v_nivel_despues public.niveles%ROWTYPE;
  v_usa_niveles boolean;
  v_mes integer := extract(month FROM now() AT TIME ZONE 'America/Mexico_City');
  v_anio integer := extract(year FROM now() AT TIME ZONE 'America/Mexico_City');
  v_total numeric(12,2) := round(coalesce(p_total, -1), 2);
  v_canje integer := greatest(coalesce(p_canjear_puntos, 0), 0);
  v_beneficio_tipo text := 'ninguno';
  v_beneficio text := 'Pase activo — aplicar promociones vigentes';
  v_descuento numeric(5,2);
  v_ganados integer := 0;
  v_bono integer := 0;
  v_sello boolean := false;
  v_premio boolean := false;
  v_cumple boolean := false;
  v_cupon boolean := false;
  v_visita public.visitas%ROWTYPE;
  v_resumen text[] := ARRAY[]::text[];
  v_prestada boolean := coalesce(p_prestada, false);
  v_sumar_sello boolean := coalesce(p_sumar_sello, false);
  v_canjear_sellos boolean := coalesce(p_canjear_sellos, false);
  v_entregar_cumple boolean := coalesce(p_entregar_cumple, false);
  v_usar_cupon boolean := coalesce(p_usar_cupon, false);
BEGIN
  IF v_uid IS NULL OR NOT public.es_staff() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Falta la llave de la operación'; END IF;

  -- Reintento (doble clic, red que se cayó): se devuelve lo ya registrado.
  SELECT * INTO v_existente FROM public.visitas WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('visita', to_jsonb(v_existente), 'tarjeta', public._estado_tarjeta(v_existente.tarjeta_id),
                              'reintento', true, 'subio_nivel', false);
  END IF;

  IF v_total < 0 OR v_total > 1000000 THEN RAISE EXCEPTION 'Revisa el total del ticket'; END IF;
  IF p_folio_kyte IS NOT NULL AND length(btrim(p_folio_kyte)) > 40 THEN RAISE EXCEPTION 'El folio de KYTE es muy largo'; END IF;

  SELECT * INTO v_config FROM public.config_lealtad LIMIT 1;
  SELECT * INTO t FROM public.tarjetas WHERE id = p_tarjeta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró la tarjeta'; END IF;
  IF NOT t.activa THEN RAISE EXCEPTION 'Esta tarjeta está desactivada'; END IF;
  SELECT * INTO v_cliente FROM public.clientes WHERE id = t.cliente_id;

  v_usa_niveles := v_config.niveles_activos AND t.permite_niveles;
  IF v_usa_niveles THEN v_nivel_antes := public._nivel_de(t.gasto_historico); END IF;

  IF v_prestada THEN
    -- Tarjeta prestada a un amigo: el amigo recibe el descuento de nivel del
    -- titular como bienvenida y el titular gana el bono de embajador. La compra
    -- no es del titular: no suma a su gasto, sellos ni cashback, y no se canjea
    -- nada suyo.
    IF v_canje > 0 OR v_canjear_sellos OR v_entregar_cumple OR v_usar_cupon THEN
      RAISE EXCEPTION 'Con tarjeta prestada no se canjean los beneficios del titular';
    END IF;
    IF v_usa_niveles AND v_nivel_antes.id IS NOT NULL THEN
      v_beneficio_tipo := 'nivel';
      v_descuento := v_nivel_antes.descuento_pct;
      v_beneficio := format('%s (%s%% OFF) por invitación de %s', v_nivel_antes.nombre,
                            trim_scale(v_nivel_antes.descuento_pct), split_part(v_cliente.nombre, ' ', 1));
    END IF;
    IF v_config.compartida_activa AND t.permite_compartida AND v_config.compartida_bono_pts > 0 THEN
      v_bono := v_config.compartida_bono_pts;
      v_resumen := v_resumen || format('+%s %s de embajador', v_bono, v_config.nombre_puntos);
    END IF;
  ELSE
    -- Beneficio principal, en el orden del simulador: VIP > cupón > nivel.
    IF t.regla_vip IS NOT NULL THEN
      IF v_usar_cupon THEN RAISE EXCEPTION 'Al cliente VIP se le aplica su regla, no el cupón'; END IF;
      v_beneficio_tipo := 'vip';
      v_beneficio := format('%s: %s', v_config.vip_nombre_regla, t.regla_vip);
    ELSIF v_usar_cupon THEN
      IF NOT t.cupon_reactivacion THEN RAISE EXCEPTION 'Este cliente no tiene cupón de regreso'; END IF;
      v_beneficio_tipo := 'cupon';
      v_beneficio := format('Cupón de regreso: %s', v_config.reactivacion_texto);
      v_cupon := true;
    ELSIF v_usa_niveles AND v_nivel_antes.id IS NOT NULL THEN
      v_beneficio_tipo := 'nivel';
      v_descuento := v_nivel_antes.descuento_pct;
      v_beneficio := format('%s (%s%% OFF)', v_nivel_antes.nombre, trim_scale(v_nivel_antes.descuento_pct));
    END IF;

    -- Canje de puntos: parcial, hasta el saldo.
    IF v_canje > t.puntos THEN RAISE EXCEPTION 'El cliente solo tiene % puntos', t.puntos; END IF;
    IF v_canje > 0 THEN v_resumen := v_resumen || format('Canjeó $%s %s', v_canje, v_config.nombre_puntos); END IF;

    -- Cashback sobre lo cobrado.
    IF v_config.cashback_activo AND t.permite_cashback THEN
      v_ganados := floor(v_total * v_config.cashback_pct / 100) * v_config.cashback_puntos_por_peso;
      IF v_ganados > 0 THEN v_resumen := v_resumen || format('+%s %s', v_ganados, v_config.nombre_puntos); END IF;
    END IF;

    -- Sellos: el canje descuenta la meta (el excedente se queda) y esa compra
    -- no suma sello (Symvora 115).
    IF v_canjear_sellos THEN
      IF NOT (v_config.sellos_activos AND t.permite_sellos) THEN RAISE EXCEPTION 'Los sellos no están activos para este cliente'; END IF;
      IF t.sellos < v_config.sellos_meta THEN RAISE EXCEPTION 'Aún no completa sus % sellos', v_config.sellos_meta; END IF;
      v_premio := true;
      v_resumen := v_resumen || format('Premio de sellos: %s', v_config.sellos_premio);
    ELSIF v_sumar_sello AND v_config.sellos_activos AND t.permite_sellos
          AND v_total >= v_config.compra_minima_sello THEN
      v_sello := true;
      v_resumen := v_resumen || format('+1 sello (%s/%s)', t.sellos + 1, v_config.sellos_meta);
    END IF;

    -- Cumpleaños: una vez por año, en su mes (hora de México).
    IF v_entregar_cumple THEN
      IF NOT (v_config.cumple_activo AND t.permite_cumple) THEN RAISE EXCEPTION 'El regalo de cumpleaños no está activo'; END IF;
      IF v_cliente.mes_cumple IS DISTINCT FROM v_mes THEN RAISE EXCEPTION 'No es el mes de cumpleaños del cliente'; END IF;
      IF t.cumple_canjeado_anio IS NOT DISTINCT FROM v_anio THEN RAISE EXCEPTION 'El regalo de cumpleaños ya se entregó este año'; END IF;
      v_cumple := true;
      v_resumen := v_resumen || format('Regalo de cumpleaños: %s', v_config.cumple_texto);
    END IF;
  END IF;

  INSERT INTO public.visitas (tarjeta_id, cajero_id, total_ticket, folio_kyte, tarjeta_prestada, beneficio_tipo,
                              beneficio_aplicado, descuento_pct, puntos_ganados, puntos_canjeados, sello_sumado,
                              premio_sellos, regalo_cumple, cupon_usado, idempotency_key)
  VALUES (t.id, v_uid, v_total, nullif(btrim(coalesce(p_folio_kyte, '')), ''), v_prestada, v_beneficio_tipo,
          v_beneficio, v_descuento, v_ganados + v_bono, v_canje, v_sello, v_premio, v_cumple, v_cupon, p_idempotency_key)
  RETURNING * INTO v_visita;

  INSERT INTO public.movimientos (tarjeta_id, tipo, cantidad, visita_id, usuario_id, nota)
  SELECT t.id, m.tipo, m.cantidad, v_visita.id, v_uid, m.nota
  FROM (VALUES
    ('bono_compartida', v_bono::numeric,                 'Tarjeta prestada a un amigo'),
    ('canje_puntos',    (-v_canje)::numeric,             NULL),
    ('cashback',        v_ganados::numeric,              NULL),
    ('sello',           CASE WHEN v_sello THEN 1 ELSE 0 END::numeric, NULL),
    ('canje_sellos',    CASE WHEN v_premio THEN -v_config.sellos_meta ELSE 0 END::numeric, v_config.sellos_premio),
    ('cumple',          CASE WHEN v_cumple THEN 1 ELSE 0 END::numeric, v_config.cumple_texto),
    ('cupon',           CASE WHEN v_cupon THEN 1 ELSE 0 END::numeric, v_config.reactivacion_texto)
  ) AS m(tipo, cantidad, nota)
  WHERE m.cantidad <> 0;

  UPDATE public.tarjetas SET
    puntos               = puntos - v_canje + v_ganados + v_bono,
    sellos               = sellos + CASE WHEN v_sello THEN 1 ELSE 0 END - CASE WHEN v_premio THEN v_config.sellos_meta ELSE 0 END,
    premios_canjeados    = premios_canjeados + CASE WHEN v_premio THEN 1 ELSE 0 END,
    gasto_historico      = gasto_historico + CASE WHEN v_prestada THEN 0 ELSE v_total END,
    ultima_visita        = CASE WHEN v_prestada THEN ultima_visita ELSE now() END,
    cupon_reactivacion   = CASE WHEN v_cupon THEN false ELSE cupon_reactivacion END,
    cumple_canjeado_anio = CASE WHEN v_cumple THEN v_anio ELSE cumple_canjeado_anio END
  WHERE id = t.id
  RETURNING * INTO t;

  IF v_usa_niveles THEN v_nivel_despues := public._nivel_de(t.gasto_historico); END IF;

  PERFORM public._bitacora('venta',
    format('%s (#%s) — $%s%s', v_cliente.nombre, t.folio, to_char(v_total, 'FM999,999,990.00'),
           CASE WHEN v_prestada THEN ' · tarjeta prestada' ELSE '' END),
    t.id,
    jsonb_build_object('visita_id', v_visita.id, 'total', v_total, 'beneficio', v_beneficio,
                       'resumen', to_jsonb(v_resumen), 'tarjeta_prestada', v_prestada,
                       'folio_kyte', v_visita.folio_kyte));

  RETURN jsonb_build_object(
    'visita', to_jsonb(v_visita),
    'tarjeta', public._estado_tarjeta(t.id),
    'reintento', false,
    'resumen', to_jsonb(v_resumen),
    'subio_nivel', v_usa_niveles AND v_nivel_despues.id IS DISTINCT FROM v_nivel_antes.id AND v_nivel_despues.id IS NOT NULL,
    'nivel', CASE WHEN v_nivel_despues.id IS NULL THEN NULL
                  ELSE jsonb_build_object('nombre', v_nivel_despues.nombre, 'descuento_pct', v_nivel_despues.descuento_pct) END
  );
END; $$;