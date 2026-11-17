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
  p_tarjeta_id uuid,
  p_total numeric,
  p_folio_kyte text DEFAULT NULL,
  p_prestada boolean DEFAULT false,
  p_sumar_sello boolean DEFAULT true,
  p_canjear_puntos integer DEFAULT 0,
  p_canjear_sellos boolean DEFAULT false,
  p_entregar_cumple boolean DEFAULT false,
  p_usar_cupon boolean DEFAULT false,
  p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_config public.config_lealtad%ROWTYPE;
  v_tarjeta public.tarjetas%ROWTYPE;
  v_cliente public.clientes%ROWTYPE;
  v_visita public.visitas%ROWTYPE;
  v_existente public.visitas%ROWTYPE;
  v_total numeric := p_total;
  v_canje integer := p_canjear_puntos;
  v_canjear_sellos boolean := p_canjear_sellos;
  v_entregar_cumple boolean := p_entregar_cumple;
  v_usar_cupon boolean := p_usar_cupon;
  v_prestada boolean := p_prestada;
  v_sumar_sello boolean := p_sumar_sello;
  v_hoy date := now() AT TIME ZONE 'America/Mexico_City';
  v_mes_cumple smallint;
  v_es_mes_cumple boolean := false;
  v_cumple_entregado boolean := false;
  v_cupon_activo boolean := false;
  v_usa_niveles boolean := false;
  v_usa_cashback boolean := false;
  v_usa_sellos boolean := false;
  v_usa_promo boolean := false;
  v_usa_cumple boolean := false;
  v_usa_compartida boolean := false;
  v_vip boolean := false;
  v_nivel_antes public.niveles%ROWTYPE;
  v_nivel_despues public.niveles%ROWTYPE;
  v_subio_nivel boolean := false;
  v_ganados integer := 0;
  v_bono_compartida integer := 0;
  v_sello boolean := false;
  v_premio boolean := false;
  v_cupon boolean := false;
  v_cumple boolean := false;
  v_gasto_final numeric;
  v_puntos_finales integer;
  v_sellos_finales integer;
  v_nivel_final public.niveles%ROWTYPE;
  v_resumen text[] := ARRAY[]::text[];
  v_errores text[] := ARRAY[]::text[];
  v_aviso_sello text;
BEGIN
  -- Idempotencia: si ya existe una visita con esta llave, devolverla.
  SELECT * INTO v_existente FROM public.visitas WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'visita', to_jsonb(v_existente),
      'tarjeta', public._estado_tarjeta(v_existente.tarjeta_id),
      'reintento', true,
      'resumen', v_resumen,
      'subio_nivel', false,
      'nivel', null
    );
  END IF;

  IF NOT public.es_staff() THEN RAISE EXCEPTION 'No autorizado'; END IF;

  SELECT * INTO v_config FROM public.config_lealtad FOR SHARE;
  SELECT * INTO v_tarjeta FROM public.tarjetas WHERE id = p_tarjeta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarjeta no encontrada'; END IF;
  IF NOT v_tarjeta.activa THEN RAISE EXCEPTION 'La tarjeta está desactivada'; END IF;

  SELECT * INTO v_cliente FROM public.clientes WHERE id = v_tarjeta.cliente_id;
  v_mes_cumple := v_cliente.mes_cumple;
  IF v_mes_cumple IS NOT NULL AND v_mes_cumple = extract(month FROM v_hoy) THEN
    v_es_mes_cumple := true;
  END IF;
  IF v_es_mes_cumple AND v_tarjeta.cumple_canjeado_anio = extract(year FROM v_hoy)::int THEN
    v_cumple_entregado := true;
  END IF;
  IF v_tarjeta.cupon_reactivacion AND NOT v_tarjeta.regla_vip THEN
    v_cupon_activo := true;
  END IF;

  -- Dinámicas activas para esta tarjeta (config global ∧ permiso tarjeta)
  v_usa_niveles   := v_config.niveles_activos   AND v_tarjeta.permite_niveles;
  v_usa_cashback  := v_config.cashback_activo  AND v_tarjeta.permite_cashback;
  v_usa_sellos    := v_config.sellos_activos   AND v_tarjeta.permite_sellos;
  v_usa_promo     := v_config.promo_activa     AND v_tarjeta.permite_promo
                     AND (v_config.promo_inicio IS NULL OR v_config.promo_inicio <= v_hoy)
                     AND (v_config.promo_fin IS NULL OR v_config.promo_fin >= v_hoy);
  v_usa_cumple    := v_config.cumple_activo    AND v_tarjeta.permite_cumple;
  v_usa_compartida:= v_config.compartida_activa AND v_tarjeta.permite_compartida;

  -- VIP tiene prioridad absoluta
  IF v_tarjeta.regla_vip IS NOT NULL AND v_tarjeta.regla_vip <> '' THEN
    v_vip := true;
  END IF;

  -- Nivel actual
  IF v_usa_niveles THEN
    SELECT * INTO v_nivel_antes
    FROM public.niveles
    WHERE gasto_minimo <= v_tarjeta.gasto_historico
    ORDER BY gasto_minimo DESC
    LIMIT 1;
  END IF;

  -- Validaciones y cálculos
  IF v_vip THEN
    -- VIP: solo su regla, nada más
    IF v_usar_cupon THEN v_errores := v_errores || 'Al cliente VIP se le aplica su regla, no el cupón.'; END IF;
    v_canje := 0; v_canjear_sellos := false; v_entregar_cumple := false; v_sumar_sello := false; v_usar_cupon := false;
  ELSE
    IF v_usar_cupon AND NOT v_cupon_activo THEN v_errores := v_errores || 'Este cliente no tiene cupón de regreso.'; END IF;

    -- Canje de puntos: parcial, hasta el saldo.
    IF v_canje > v_tarjeta.puntos THEN RAISE EXCEPTION 'El cliente solo tiene % puntos', v_tarjeta.puntos; END IF;
    IF v_canje > 0 THEN v_resumen := v_resumen || format('Canjeó $%s %s', v_canje, v_config.nombre_puntos); END IF;

    -- Cashback sobre lo cobrado.
    IF v_usa_cashback THEN
      v_ganados := floor(v_total * v_config.cashback_pct / 100) * v_config.cashback_puntos_por_peso;
      IF v_ganados > 0 THEN v_resumen := v_resumen || format('+%s %s', v_ganados, v_config.nombre_puntos); END IF;
    END IF;

    -- Sellos: el canje descuenta la meta (el excedente se queda) y esa compra
    -- no suma sello (Symvora 115).
    IF v_canjear_sellos THEN
      IF NOT v_usa_sellos THEN RAISE EXCEPTION 'Los sellos no están activos para este cliente'; END IF;
      IF v_tarjeta.sellos < v_config.sellos_meta THEN RAISE EXCEPTION 'Aún no completa sus % sellos', v_config.sells_meta; END IF;
      v_premio := true;
      v_resumen := v_resumen || format('Premio de sellos: %s', v_config.sellos_premio);
    ELSIF v_sumar_sello AND v_usa_sellos AND v_total >= v_config.compra_minima_sello THEN
      v_sello := true;
    ELSIF v_sumar_sello AND v_usa_sellos AND v_total < v_config.compra_minima_sello THEN
      v_aviso_sello := format('La compra mínima para sumar sello es de $%s', v_config.compra_minima_sello);
    END IF;

    -- Cumpleaños
    IF v_entregar_cumple THEN
      IF NOT v_usa_cumple THEN v_errores := v_errores || 'El regalo de cumpleaños no está activo.'; END IF;
      IF NOT v_es_mes_cumple THEN v_errores := v_errores || 'No es el mes de cumpleaños del cliente.'; END IF;
      IF v_cumple_entregado THEN v_errores := v_errores || 'El regalo de cumpleaños ya se entregó este año.'; END IF;
      IF v_usa_cumple AND v_es_mes_cumple AND NOT v_cumple_entregado THEN
        v_cumple := true;
      END IF;
    END IF;
  END IF;

  IF cardinality(v_errores) > 0 THEN RAISE EXCEPTION '%', array_to_string(v_errores, '; '); END IF;

  -- Gasto final (si es prestada no suma al gasto histórico del titular)
  v_gasto_final := v_tarjeta.gasto_historico + CASE WHEN v_prestada THEN 0 ELSE v_total END;
  -- Nivel final
  IF v_usa_niveles THEN
    SELECT * INTO v_nivel_despues
    FROM public.niveles
    WHERE gasto_minimo <= v_gasto_final
    ORDER BY gasto_minimo DESC
    LIMIT 1;
    IF v_nivel_despues.id IS DISTINCT FROM v_nivel_antes.id THEN v_subio_nivel := true; END IF;
    v_nivel_final := v_nivel_despues;
  END IF;

  -- Sellos finales
  v_sellos_finales := v_tarjeta.sellos + CASE WHEN v_sello THEN 1 ELSE 0 END - CASE WHEN v_premio THEN v_config.sells_meta ELSE 0 END;
  -- Puntos finales
  v_puntos_finales := v_tarjeta.puntos - CASE WHEN v_prestada THEN 0 ELSE v_canje END + v_ganados + v_bono_compartida;

  -- Insertar visita con bloqueo en tarjeta (ya tenemos FOR UPDATE)
  INSERT INTO public.visitas (
    tarjeta_id, cajero_id, total_ticket, folio_kyte, tarjeta_prestada,
    beneficio_tipo, beneficio_aplicado, descuento_pct, puntos_ganados, puntos_canjeados,
    sello_sumado, premio_sellos, regalo_cumple, cupon_usado, idempotency_key
  ) VALUES (
    v_tarjeta.id, auth.uid(), v_total, p_folio_kyte, v_prestada,
    CASE
      WHEN v_vip THEN 'vip'
      WHEN v_usar_cupon THEN 'cupon'
      WHEN v_usa_niveles AND v_nivel_antes.id IS NOT NULL THEN 'nivel'
      ELSE 'ninguno'
    END,
    CASE
      WHEN v_vip THEN v_tarjeta.regla_vip
      WHEN v_usar_cupon THEN v_config.reactivacion_texto
      WHEN v_usa_niveles AND v_nivel_antes.id IS NOT NULL
        THEN format('%s (%s%%)', v_nivel_antes.nombre, v_nivel_antes.descuento_pct)
      ELSE 'Promociones vigentes'
    END,
    CASE
      WHEN v_vip THEN NULL
      WHEN v_usar_cupon THEN NULL
      WHEN v_usa_niveles AND v_nivel_antes.id IS NOT NULL THEN v_nivel_antes.descuento_pct
      ELSE NULL
    END,
    v_ganados, v_canje,
    v_sello, v_premio, v_cumple, v_usar_cupon, p_idempotency_key
  ) RETURNING * INTO v_visita;

  -- Actualizar tarjeta
  UPDATE public.tarjetas SET
    gasto_historico = v_gasto_final,
    puntos = v_puntos_finales,
    sellos = v_sellos_finales,
    premios_canjeados = v_tarjeta.premios_canjeados + CASE WHEN v_premio THEN 1 ELSE 0 END,
    ultima_visita = v_visita.creado_en,
    cumple_canjeado_anio = CASE WHEN v_cumple THEN extract(year FROM v_hoy)::int ELSE v_tarjeta.cumple_canjeado_anio END,
    cupon_reactivacion = CASE WHEN v_usar_cupon THEN false ELSE v_tarjeta.cupon_reactivacion END
  WHERE id = v_tarjeta.id;

  -- Movimientos
  IF v_ganados > 0 THEN
    INSERT INTO public.movimientos (tarjeta_id, tipo, cantidad, visita_id, usuario_id, nota)
    VALUES (v_tarjeta.id, 'cashback', v_ganados, v_visita.id, auth.uid(), 'Cashback');
  END IF;
  IF v_bono_compartida > 0 THEN
    INSERT INTO public.movimientos (tarjeta_id, tipo, cantidad, visita_id, usuario_id, nota)
    VALUES (v_tarjeta.id, 'bono_compartida', v_bono_compartida, v_visita.id, auth.uid(), 'Bono de embajador');
  END IF;
  IF v_canje > 0 THEN
    INSERT INTO public.movimientos (tarjeta_id, tipo, cantidad, visita_id, usuario_id, nota)
    VALUES (v_tarjeta.id, 'canje_puntos', -v_canje, v_visita.id, auth.uid(), 'Canje de puntos');
  END IF;
  IF v_sello THEN
    INSERT INTO public.movimientos (tarjeta_id, tipo, cantidad, visita_id, usuario_id, nota)
    VALUES (v_tarjeta.id, 'sello', 1, v_visita.id, auth.uid(), 'Sello');
  END IF;
  IF v_premio THEN
    INSERT INTO public.movimientos (tarjeta_id, tipo, cantidad, visita_id, usuario_id, nota)
    VALUES (v_tarjeta.id, 'canje_sellos', v_config.sells_meta, v_visita.id, auth.uid(), 'Premio de sellos');
  END IF;
  IF v_cumple THEN
    INSERT INTO public.movimientos (tarjeta_id, tipo, cantidad, visita_id, usuario_id, nota)
    VALUES (v_tarjeta.id, 'cumple', v_config.puntos_bienvenida, v_visita.id, auth.uid(), 'Regalo de cumpleaños');
  END IF;
  IF v_usar_cupon THEN
    INSERT INTO public.movimientos (tarjeta_id, tipo, cantidad, visita_id, usuario_id, nota)
    VALUES (v_tarjeta.id, 'cupon', v_config.puntos_bienvenida, v_visita.id, auth.uid(), 'Cupón usado');
  END IF;

  -- Bitácora
  PERFORM public._bitacora('venta', format('Compra %s registrada (#%s)', v_visita.id, v_visita.folio_kyte),
                           v_tarjeta.id, jsonb_build_object(
                             'total', v_total, 'folio_kyte', v_folio_kyte, 'prestada', v_prestada,
                             'beneficio', CASE WHEN v_vip THEN 'vip' WHEN v_usar_cupon THEN 'cupon' WHEN v_usa_niveles AND v_nivel_antes.id IS NOT NULL THEN 'nivel' ELSE 'ninguno' END,
                             'puntos_ganados', v_ganados, 'puntos_canjeados', v_canje,
                             'sello', v_sello, 'premio', v_premio, 'cumple', v_cumple, 'cupon', v_usar_cupon
                           ));

  RETURN jsonb_build_object(
    'visita', to_jsonb(v_visita),
    'tarjeta', public._estado_tarjeta(v_tarjeta.id),
    'reintento', false,
    'resumen', v_resumen,
    'subio_nivel', v_subio_nivel,
    'nivel', CASE WHEN v_nivel_final.id IS NOT NULL THEN jsonb_build_object('nombre', v_nivel_final.nombre, 'descuento_pct', v_nivel_final.descuento_pct) ELSE null END
  );
END; $$;