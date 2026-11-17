-- =============================================================================
-- Armada Nutrition — Programa de lealtad (pase digital)
-- -----------------------------------------------------------------------------
-- Basado en las migraciones 115/120/121/122 de Symvora (tarjetas de lealtad),
-- sin multi-tenant (un solo negocio) y con el motor completo del simulador:
-- niveles, cashback ("Puntos Armada"), sellos, promo relámpago, cumpleaños,
-- tarjeta compartida, cupón de reactivación y regla VIP por cliente.
--
-- Reglas de la casa (iguales a Symvora):
--   * Todo lo que mueve saldos (tarjetas, visitas, movimientos, bitácora) se
--     escribe SOLO por RPC SECURITY DEFINER con `search_path = ''`. No hay
--     políticas de INSERT/UPDATE/DELETE en esas tablas.
--   * Ninguna función queda ejecutable por PUBLIC/anon salvo las dos públicas
--     de lectura (`tarjeta_publica`, `programa_alta_publica`).
--   * El alta pública (`alta_publica`) es solo de service_role: la única puerta
--     es POST /api/unirse, que valida rate limit y Turnstile antes.
--
-- KYTE es el punto de venta: aquí no se cobra. El cajero escanea el pase, lee
-- qué beneficio aplicar en KYTE, cobra allá y registra aquí el TOTAL COBRADO.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Las funciones nuevas no se vuelven ejecutables por nadie hasta que se diga.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. Equipo
-- -----------------------------------------------------------------------------
CREATE TABLE public.perfiles (
  user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre    text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 60),
  rol       text NOT NULL DEFAULT 'cajero' CHECK (rol IN ('admin', 'cajero')),
  activo    boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.es_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfiles p WHERE p.user_id = auth.uid() AND p.activo);
$$;

CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfiles p WHERE p.user_id = auth.uid() AND p.activo AND p.rol = 'admin');
$$;

/** Nombre de quien hace la operación, para la bitácora. */
CREATE OR REPLACE FUNCTION public._actor()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT p.nombre FROM public.perfiles p WHERE p.user_id = auth.uid()), 'Sistema');
$$;

CREATE OR REPLACE FUNCTION public._hoy_mx()
RETURNS date LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (now() AT TIME ZONE 'America/Mexico_City')::date;
$$;

-- -----------------------------------------------------------------------------
-- 2. Configuración (una sola fila) = `globalRules` del simulador
-- -----------------------------------------------------------------------------
CREATE TABLE public.config_lealtad (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),

  -- Niveles por gasto histórico
  niveles_activos       boolean NOT NULL DEFAULT true,
  mostrar_gasto_en_pase boolean NOT NULL DEFAULT true,

  -- Cashback (1 punto = $1 MXN)
  cashback_activo   boolean NOT NULL DEFAULT true,
  nombre_puntos     text    NOT NULL DEFAULT 'Puntos Armada',
  cashback_pct      numeric(5,2) NOT NULL DEFAULT 5,
  puntos_bienvenida integer NOT NULL DEFAULT 50,

  -- Sellos
  sellos_activos      boolean NOT NULL DEFAULT true,
  sellos_titulo       text    NOT NULL DEFAULT 'Sellos de Proteína',
  sellos_meta         integer NOT NULL DEFAULT 5,
  sellos_premio       text    NOT NULL DEFAULT '6ta Proteína con 30% OFF o Shaker de Regalo',
  icono_sello         text    NOT NULL DEFAULT 'pesa',
  compra_minima_sello numeric(10,2) NOT NULL DEFAULT 0,

  -- Promo relámpago
  promo_activa boolean NOT NULL DEFAULT true,
  promo_texto  text    NOT NULL DEFAULT 'Viernes de 20% OFF en Creatinas',
  promo_inicio date,
  promo_fin    date,

  -- Cumpleaños
  cumple_activo boolean NOT NULL DEFAULT true,
  cumple_texto  text    NOT NULL DEFAULT 'Shaker o Muestra de Pre-entreno Gratis',

  -- Tarjeta compartida (embajador)
  compartida_activa   boolean NOT NULL DEFAULT true,
  compartida_bono_pts integer NOT NULL DEFAULT 50,

  -- Reactivación
  reactivacion_dias  integer NOT NULL DEFAULT 45,
  reactivacion_texto text    NOT NULL DEFAULT '25% OFF + Pre-entreno Gratis',

  -- VIP
  vip_nombre_regla text NOT NULL DEFAULT 'Regla VIP Individual',

  -- Alta con el QR del mostrador (Symvora 121)
  alta_publica         boolean NOT NULL DEFAULT false,
  codigo_alta          text,
  aviso_privacidad_url text,

  actualizado_en timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT config_nombre_puntos_ck   CHECK (length(btrim(nombre_puntos)) BETWEEN 1 AND 30),
  CONSTRAINT config_cashback_ck        CHECK (cashback_pct BETWEEN 0 AND 50),
  CONSTRAINT config_bienvenida_ck      CHECK (puntos_bienvenida BETWEEN 0 AND 10000),
  CONSTRAINT config_sellos_titulo_ck   CHECK (length(btrim(sellos_titulo)) BETWEEN 1 AND 40),
  CONSTRAINT config_sellos_meta_ck     CHECK (sellos_meta BETWEEN 2 AND 20),
  CONSTRAINT config_sellos_premio_ck   CHECK (length(btrim(sellos_premio)) BETWEEN 1 AND 80),
  CONSTRAINT config_icono_ck           CHECK (icono_sello IN ('check','cafe','estrella','corazon','huella','hueso','pizza','tijeras','flor','pan','helado','bolsa','pesa','cerveza','frasco','rayo','trofeo','flama')),
  CONSTRAINT config_compra_minima_ck   CHECK (compra_minima_sello >= 0),
  CONSTRAINT config_promo_texto_ck     CHECK (length(promo_texto) <= 80),
  CONSTRAINT config_promo_fechas_ck    CHECK (promo_inicio IS NULL OR promo_fin IS NULL OR promo_inicio <= promo_fin),
  CONSTRAINT config_cumple_texto_ck    CHECK (length(btrim(cumple_texto)) BETWEEN 1 AND 80),
  CONSTRAINT config_bono_ck            CHECK (compartida_bono_pts BETWEEN 0 AND 10000),
  CONSTRAINT config_reactivacion_ck    CHECK (reactivacion_dias BETWEEN 7 AND 365),
  CONSTRAINT config_reactivacion_txt   CHECK (length(btrim(reactivacion_texto)) BETWEEN 1 AND 80),
  CONSTRAINT config_vip_nombre_ck      CHECK (length(btrim(vip_nombre_regla)) BETWEEN 1 AND 40),
  CONSTRAINT config_codigo_alta_ck     CHECK (codigo_alta IS NULL OR codigo_alta ~ '^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$'),
  CONSTRAINT config_aviso_url_ck       CHECK (aviso_privacidad_url IS NULL OR (aviso_privacidad_url ~ '^https://[^\s]+$' AND length(aviso_privacidad_url) <= 300))
);
CREATE UNIQUE INDEX config_codigo_alta_uq ON public.config_lealtad (codigo_alta) WHERE codigo_alta IS NOT NULL;

INSERT INTO public.config_lealtad (id) VALUES (true);

CREATE TABLE public.niveles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 40),
  descuento_pct numeric(5,2) NOT NULL CHECK (descuento_pct BETWEEN 0 AND 50),
  gasto_minimo  numeric(12,2) NOT NULL UNIQUE CHECK (gasto_minimo >= 0),
  creado_en     timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 3. Clientes y tarjetas
-- -----------------------------------------------------------------------------
CREATE TABLE public.clientes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 2 AND 60),
  telefono        text NOT NULL CHECK (telefono ~ '^\+[0-9]{8,15}$'),
  -- Los últimos 10 dígitos: así se detecta el mismo celular escrito distinto.
  telefono_10     text GENERATED ALWAYS AS (right(regexp_replace(telefono, '\D', '', 'g'), 10)) STORED,
  mes_cumple      smallint CHECK (mes_cumple BETWEEN 1 AND 12),
  origen          text NOT NULL DEFAULT 'equipo' CHECK (origen IN ('equipo', 'qr')),
  acepto_aviso_en timestamptz,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX clientes_telefono_10_uq ON public.clientes (telefono_10);
CREATE INDEX clientes_nombre_idx ON public.clientes (lower(nombre));

-- Folio legible para el lector láser o para dictarlo: ARM-101, ARM-102...
CREATE SEQUENCE public.tarjetas_folio_seq START 101;

CREATE TABLE public.tarjetas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL UNIQUE REFERENCES public.clientes(id) ON DELETE CASCADE,
  codigo     text NOT NULL UNIQUE CHECK (codigo ~ '^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{12}$'),
  folio      text NOT NULL UNIQUE DEFAULT ('ARM-' || nextval('public.tarjetas_folio_seq')),

  gasto_historico   numeric(12,2) NOT NULL DEFAULT 0 CHECK (gasto_historico >= 0),
  puntos            integer NOT NULL DEFAULT 0 CHECK (puntos >= 0),
  sellos            integer NOT NULL DEFAULT 0 CHECK (sellos >= 0),
  premios_canjeados integer NOT NULL DEFAULT 0 CHECK (premios_canjeados >= 0),
  ultima_visita     timestamptz,

  regla_vip            text CHECK (regla_vip IS NULL OR length(btrim(regla_vip)) BETWEEN 1 AND 80),
  cupon_reactivacion   boolean NOT NULL DEFAULT false,
  cupon_emitido_en     timestamptz,
  cumple_canjeado_anio integer,

  permite_niveles    boolean NOT NULL DEFAULT true,
  permite_cashback   boolean NOT NULL DEFAULT true,
  permite_sellos     boolean NOT NULL DEFAULT true,
  permite_promo      boolean NOT NULL DEFAULT true,
  permite_cumple     boolean NOT NULL DEFAULT true,
  permite_compartida boolean NOT NULL DEFAULT true,

  activa    boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tarjetas_ultima_visita_idx ON public.tarjetas (ultima_visita);

-- -----------------------------------------------------------------------------
-- 4. Visitas (compras registradas en caja), movimientos y bitácora
-- -----------------------------------------------------------------------------
CREATE TABLE public.visitas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarjeta_id         uuid NOT NULL REFERENCES public.tarjetas(id) ON DELETE CASCADE,
  cajero_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  total_ticket       numeric(12,2) NOT NULL CHECK (total_ticket >= 0),
  folio_kyte         text CHECK (folio_kyte IS NULL OR length(folio_kyte) <= 40),
  tarjeta_prestada   boolean NOT NULL DEFAULT false,
  beneficio_tipo     text NOT NULL CHECK (beneficio_tipo IN ('vip', 'cupon', 'nivel', 'ninguno')),
  beneficio_aplicado text NOT NULL,
  descuento_pct      numeric(5,2),
  puntos_ganados     integer NOT NULL DEFAULT 0,
  puntos_canjeados   integer NOT NULL DEFAULT 0,
  sello_sumado       boolean NOT NULL DEFAULT false,
  premio_sellos      boolean NOT NULL DEFAULT false,
  regalo_cumple      boolean NOT NULL DEFAULT false,
  cupon_usado        boolean NOT NULL DEFAULT false,
  idempotency_key    uuid NOT NULL UNIQUE,
  creado_en          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX visitas_tarjeta_idx ON public.visitas (tarjeta_id, creado_en DESC);
CREATE INDEX visitas_creado_idx ON public.visitas (creado_en DESC);

CREATE TABLE public.movimientos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarjeta_id uuid NOT NULL REFERENCES public.tarjetas(id) ON DELETE CASCADE,
  tipo       text NOT NULL CHECK (tipo IN ('sello', 'canje_sellos', 'cashback', 'bienvenida', 'bono_compartida',
                                           'canje_puntos', 'ajuste_sellos', 'ajuste_puntos', 'ajuste_gasto',
                                           'cumple', 'cupon')),
  cantidad   numeric(12,2) NOT NULL CHECK (cantidad <> 0),
  visita_id  uuid REFERENCES public.visitas(id) ON DELETE SET NULL,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nota       text,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
-- Una visita no puede sumar dos sellos ni canjear dos veces (Symvora 115).
CREATE UNIQUE INDEX movimientos_visita_tipo_uq ON public.movimientos (visita_id, tipo) WHERE visita_id IS NOT NULL;
CREATE INDEX movimientos_tarjeta_idx ON public.movimientos (tarjeta_id, creado_en DESC);
CREATE INDEX movimientos_tipo_idx ON public.movimientos (tipo, creado_en DESC);

CREATE TABLE public.bitacora (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text NOT NULL CHECK (tipo IN ('venta', 'registro', 'config', 'cliente')),
  actor       text NOT NULL,
  descripcion text NOT NULL,
  tarjeta_id  uuid REFERENCES public.tarjetas(id) ON DELETE SET NULL,
  detalle     jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bitacora_creado_idx ON public.bitacora (creado_en DESC);

CREATE OR REPLACE FUNCTION public._bitacora(p_tipo text, p_descripcion text, p_tarjeta uuid, p_detalle jsonb, p_actor text DEFAULT NULL)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.bitacora (tipo, actor, descripcion, tarjeta_id, detalle)
  VALUES (p_tipo, coalesce(p_actor, public._actor()), p_descripcion, p_tarjeta, coalesce(p_detalle, '{}'::jsonb));
$$;

-- -----------------------------------------------------------------------------
-- 5. Rate limit compartido (Symvora 058)
-- -----------------------------------------------------------------------------
CREATE TABLE public.rate_limits (
  clave          text PRIMARY KEY,
  ventana_inicio timestamptz NOT NULL DEFAULT now(),
  contador       integer NOT NULL DEFAULT 0
);
CREATE INDEX rate_limits_ventana_idx ON public.rate_limits (ventana_inicio);

CREATE OR REPLACE FUNCTION public.consumir_rate_limit(p_clave text, p_limite integer, p_ventana_segundos integer)
RETURNS TABLE (permitido boolean, contador_actual integer, reinicia_en timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ventana interval := make_interval(secs => p_ventana_segundos);
  v_inicio timestamptz;
  v_cont integer;
BEGIN
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits WHERE ventana_inicio < now() - interval '1 day';
  END IF;
  INSERT INTO public.rate_limits AS rl (clave, ventana_inicio, contador)
  VALUES (p_clave, now(), 1)
  ON CONFLICT (clave) DO UPDATE
    SET ventana_inicio = CASE WHEN rl.ventana_inicio < now() - v_ventana THEN now() ELSE rl.ventana_inicio END,
        contador       = CASE WHEN rl.ventana_inicio < now() - v_ventana THEN 1 ELSE rl.contador + 1 END
  RETURNING rl.ventana_inicio, rl.contador INTO v_inicio, v_cont;
  RETURN QUERY SELECT (v_cont <= p_limite), v_cont, (v_inicio + v_ventana);
END; $$;

-- -----------------------------------------------------------------------------
-- 6. RLS y privilegios
-- -----------------------------------------------------------------------------
ALTER TABLE public.perfiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_lealtad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.niveles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarjetas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bitacora       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.perfiles, public.config_lealtad, public.niveles, public.clientes, public.tarjetas,
              public.visitas, public.movimientos, public.bitacora, public.rate_limits FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.tarjetas_folio_seq FROM anon, authenticated;

GRANT SELECT ON public.perfiles, public.config_lealtad, public.niveles, public.clientes, public.tarjetas,
                public.visitas, public.movimientos, public.bitacora TO authenticated;
GRANT UPDATE ON public.config_lealtad TO authenticated;

CREATE POLICY perfiles_select ON public.perfiles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.es_admin()));
CREATE POLICY config_select ON public.config_lealtad FOR SELECT TO authenticated USING ((SELECT public.es_staff()));
CREATE POLICY config_update ON public.config_lealtad FOR UPDATE TO authenticated
  USING ((SELECT public.es_admin())) WITH CHECK ((SELECT public.es_admin()));
CREATE POLICY niveles_select     ON public.niveles     FOR SELECT TO authenticated USING ((SELECT public.es_staff()));
CREATE POLICY clientes_select    ON public.clientes    FOR SELECT TO authenticated USING ((SELECT public.es_staff()));
CREATE POLICY tarjetas_select    ON public.tarjetas    FOR SELECT TO authenticated USING ((SELECT public.es_staff()));
CREATE POLICY visitas_select     ON public.visitas     FOR SELECT TO authenticated USING ((SELECT public.es_staff()));
CREATE POLICY movimientos_select ON public.movimientos FOR SELECT TO authenticated USING ((SELECT public.es_staff()));
CREATE POLICY bitacora_select    ON public.bitacora    FOR SELECT TO authenticated USING ((SELECT public.es_admin()));
-- rate_limits: RLS sin políticas a propósito; solo service_role vía el RPC.

-- -----------------------------------------------------------------------------
-- 7. Códigos (Symvora 115/121): alfabeto sin 0/O, 1/I/L ni U
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._codigo_aleatorio(p_largo integer)
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  v_alfabeto CONSTANT text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea := extensions.gen_random_bytes(p_largo);
  v_codigo text := '';
BEGIN
  FOR i IN 0..p_largo - 1 LOOP
    v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) % 30) + 1, 1);
  END LOOP;
  RETURN v_codigo;
END; $$;

-- `codigo_alta` no se escribe a mano: solo lo genera el trigger, o lo cambia
-- `regenerar_codigo_alta` (Symvora 121). SECURITY DEFINER por el fix de la 122.
CREATE OR REPLACE FUNCTION public._config_codigo_alta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF coalesce(current_setting('armada.regenerar_codigo_alta', true), '') <> 'si' THEN
    NEW.codigo_alta := CASE WHEN TG_OP = 'UPDATE' THEN OLD.codigo_alta ELSE NULL END;
  END IF;
  IF NEW.alta_publica AND NEW.codigo_alta IS NULL THEN
    NEW.codigo_alta := public._codigo_aleatorio(10);
  END IF;
  NEW.actualizado_en := now();
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_config_codigo_alta BEFORE INSERT OR UPDATE ON public.config_lealtad
  FOR EACH ROW EXECUTE FUNCTION public._config_codigo_alta();

-- Cada cambio de dinámicas queda en la bitácora con los campos que cambiaron.
CREATE OR REPLACE FUNCTION public._config_bitacora()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cambios jsonb;
BEGIN
  SELECT coalesce(jsonb_object_agg(n.key, n.value), '{}'::jsonb) INTO v_cambios
  FROM jsonb_each(to_jsonb(NEW)) n
  WHERE n.key NOT IN ('actualizado_en', 'id') AND (to_jsonb(OLD) -> n.key) IS DISTINCT FROM n.value;
  IF v_cambios <> '{}'::jsonb THEN
    PERFORM public._bitacora('config', 'Se actualizaron las dinámicas del programa', NULL, jsonb_build_object('cambios', v_cambios));
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER trg_config_bitacora AFTER UPDATE ON public.config_lealtad
  FOR EACH ROW EXECUTE FUNCTION public._config_bitacora();

-- -----------------------------------------------------------------------------
-- 8. Ayudantes de lectura
-- -----------------------------------------------------------------------------
/** Nivel que corresponde a un gasto: el de mayor mínimo que ya se alcanzó. */
CREATE OR REPLACE FUNCTION public._nivel_de(p_gasto numeric)
RETURNS public.niveles LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT n.* FROM public.niveles n WHERE n.gasto_minimo <= p_gasto ORDER BY n.gasto_minimo DESC LIMIT 1;
$$;

/** Tarjeta + cliente, como la ve el equipo (incluye teléfono). */
CREATE OR REPLACE FUNCTION public._estado_tarjeta(p_tarjeta_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT to_jsonb(t) || jsonb_build_object(
    'cliente', jsonb_build_object('id', c.id, 'nombre', c.nombre, 'telefono', c.telefono,
                                  'mes_cumple', c.mes_cumple, 'origen', c.origen, 'creado_en', c.creado_en))
  FROM public.tarjetas t JOIN public.clientes c ON c.id = t.cliente_id
  WHERE t.id = p_tarjeta_id;
$$;

/** Configuración visible para el cliente (sin código de alta). */
CREATE OR REPLACE FUNCTION public._config_publica()
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT to_jsonb(c) - 'codigo_alta' - 'id' - 'actualizado_en' FROM public.config_lealtad c LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public._niveles_json()
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('nombre', n.nombre, 'descuento_pct', n.descuento_pct,
                                               'gasto_minimo', n.gasto_minimo) ORDER BY n.gasto_minimo), '[]'::jsonb)
  FROM public.niveles n;
$$;

-- -----------------------------------------------------------------------------
-- 9. Crear tarjeta (interno): reintenta si el código aleatorio choca
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._crear_tarjeta(p_cliente_id uuid)
RETURNS public.tarjetas LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_config public.config_lealtad%ROWTYPE;
  v_tarjeta public.tarjetas%ROWTYPE;
BEGIN
  SELECT * INTO v_config FROM public.config_lealtad LIMIT 1;
  FOR i IN 1..5 LOOP
    BEGIN
      INSERT INTO public.tarjetas (cliente_id, codigo, puntos)
      VALUES (p_cliente_id, public._codigo_aleatorio(12),
              CASE WHEN v_config.cashback_activo THEN v_config.puntos_bienvenida ELSE 0 END)
      RETURNING * INTO v_tarjeta;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- Si chocó el cliente (no el código), no tiene caso reintentar.
      IF EXISTS (SELECT 1 FROM public.tarjetas t WHERE t.cliente_id = p_cliente_id) THEN RAISE; END IF;
    END;
  END LOOP;
  IF v_tarjeta.id IS NULL THEN
    RAISE EXCEPTION 'No se pudo generar la tarjeta, intenta de nuevo';
  END IF;
  IF v_tarjeta.puntos > 0 THEN
    INSERT INTO public.movimientos (tarjeta_id, tipo, cantidad, usuario_id, nota)
    VALUES (v_tarjeta.id, 'bienvenida', v_tarjeta.puntos, auth.uid(), 'Puntos de bienvenida');
  END IF;
  RETURN v_tarjeta;
END; $$;

-- -----------------------------------------------------------------------------
-- 10. Pase manual (en caja)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_pase_manual(p_nombre text, p_telefono text, p_mes_cumple smallint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_telefono text := btrim(coalesce(p_telefono, ''));
  v_digitos text := right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 10);
  v_cliente_id uuid;
  v_tarjeta public.tarjetas%ROWTYPE;
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

  PERFORM public._bitacora('registro', format('Pase creado en caja para %s (#%s)', v_nombre, v_tarjeta.folio),
                           v_tarjeta.id, jsonb_build_object('origen', 'equipo', 'puntos_bienvenida', v_tarjeta.puntos));
  RETURN jsonb_build_object('estado', 'creada', 'tarjeta', public._estado_tarjeta(v_tarjeta.id));
END; $$;

-- -----------------------------------------------------------------------------
-- 11. Alta pública con el QR del mostrador (Symvora 121) — solo service_role
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.alta_publica(p_codigo_alta text, p_nombre text, p_telefono text, p_mes_cumple smallint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c_tope_diario CONSTANT integer := 100;
  v_config public.config_lealtad%ROWTYPE;
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_telefono text := btrim(coalesce(p_telefono, ''));
  v_digitos text := right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 10);
  v_inicio_dia timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'America/Mexico_City';
  v_altas_hoy integer;
  v_cliente_id uuid;
  v_tarjeta public.tarjetas%ROWTYPE;
BEGIN
  IF length(v_nombre) NOT BETWEEN 2 AND 60 OR v_nombre ~* '(https?:|www\.|[<>/@])' THEN
    RAISE EXCEPTION 'Escribe tu nombre (de 2 a 60 letras)';
  END IF;
  IF v_telefono !~ '^\+[0-9]{8,15}$' OR length(v_digitos) < 10 THEN
    RAISE EXCEPTION 'Revisa tu número de celular';
  END IF;
  IF p_mes_cumple IS NOT NULL AND p_mes_cumple NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Revisa tu mes de cumpleaños';
  END IF;

  -- Bloqueado: dos altas al mismo tiempo no se saltan el tope ni el duplicado.
  SELECT * INTO v_config FROM public.config_lealtad
  WHERE codigo_alta = upper(btrim(coalesce(p_codigo_alta, ''))) FOR UPDATE;
  IF NOT FOUND OR NOT v_config.alta_publica THEN
    RAISE EXCEPTION 'Este registro no está disponible';
  END IF;

  SELECT count(*) INTO v_altas_hoy FROM public.clientes WHERE origen = 'qr' AND creado_en >= v_inicio_dia;
  IF v_altas_hoy >= c_tope_diario THEN
    RAISE EXCEPTION 'Hoy ya no se pueden registrar más pases aquí. Pídelo en caja';
  END IF;

  -- Mismo celular: ni tarjeta nueva ni la suya (quien teclee el celular de otro
  -- se quedaría con su código y sus puntos).
  IF EXISTS (SELECT 1 FROM public.clientes c WHERE c.telefono_10 = v_digitos) THEN
    RETURN jsonb_build_object('estado', 'ya_registrado');
  END IF;

  INSERT INTO public.clientes (nombre, telefono, mes_cumple, origen, acepto_aviso_en)
  VALUES (v_nombre, v_telefono, p_mes_cumple, 'qr', now()) RETURNING id INTO v_cliente_id;
  v_tarjeta := public._crear_tarjeta(v_cliente_id);

  PERFORM public._bitacora('registro', format('%s se registró con el QR del mostrador (#%s)', v_nombre, v_tarjeta.folio),
                           v_tarjeta.id, jsonb_build_object('origen', 'qr', 'puntos_bienvenida', v_tarjeta.puntos),
                           'Registro autónomo (web)');
  RETURN jsonb_build_object('estado', 'creada', 'codigo', v_tarjeta.codigo);
END; $$;

-- -----------------------------------------------------------------------------
-- 12. Registrar compra (validador de caja) — adaptado de complete_sale_lealtad
-- -----------------------------------------------------------------------------
-- p_total: lo que el cliente PAGÓ en KYTE (ya con el descuento y los puntos
-- aplicados allá). El cashback y el gasto histórico se calculan sobre eso.
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

-- -----------------------------------------------------------------------------
-- 13. Administración de tarjetas
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ajustar_tarjeta(p_tarjeta_id uuid, p_sellos integer, p_puntos integer, p_gasto numeric, p_nota text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t public.tarjetas%ROWTYPE;
  v_nota text := btrim(coalesce(p_nota, ''));
  v_sellos integer := coalesce(p_sellos, 0);
  v_puntos integer := coalesce(p_puntos, 0);
  v_gasto numeric(12,2) := round(coalesce(p_gasto, 0), 2);
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF length(v_nota) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'Escribe el motivo del ajuste'; END IF;
  IF v_sellos = 0 AND v_puntos = 0 AND v_gasto = 0 THEN RAISE EXCEPTION 'No hay nada que ajustar'; END IF;

  SELECT * INTO t FROM public.tarjetas WHERE id = p_tarjeta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró la tarjeta'; END IF;
  IF t.sellos + v_sellos < 0 THEN RAISE EXCEPTION 'Los sellos no pueden quedar en negativo'; END IF;
  IF t.puntos + v_puntos < 0 THEN RAISE EXCEPTION 'Los puntos no pueden quedar en negativo'; END IF;
  IF t.gasto_historico + v_gasto < 0 THEN RAISE EXCEPTION 'El gasto no puede quedar en negativo'; END IF;

  UPDATE public.tarjetas SET sellos = sellos + v_sellos, puntos = puntos + v_puntos, gasto_historico = gasto_historico + v_gasto
  WHERE id = t.id;

  INSERT INTO public.movimientos (tarjeta_id, tipo, cantidad, usuario_id, nota)
  SELECT t.id, m.tipo, m.cantidad, auth.uid(), v_nota
  FROM (VALUES ('ajuste_sellos', v_sellos::numeric), ('ajuste_puntos', v_puntos::numeric), ('ajuste_gasto', v_gasto))
       AS m(tipo, cantidad)
  WHERE m.cantidad <> 0;

  PERFORM public._bitacora('cliente', format('Ajuste manual a #%s: %s', t.folio, v_nota), t.id,
                           jsonb_build_object('sellos', v_sellos, 'puntos', v_puntos, 'gasto', v_gasto));
  RETURN public._estado_tarjeta(t.id);
END; $$;

CREATE OR REPLACE FUNCTION public.configurar_tarjeta(
  p_tarjeta_id uuid,
  p_nombre     text,
  p_telefono   text,
  p_mes_cumple smallint,
  p_regla_vip  text,
  p_permisos   jsonb,
  p_activa     boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t public.tarjetas%ROWTYPE;
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_telefono text := btrim(coalesce(p_telefono, ''));
  v_vip text := nullif(btrim(coalesce(p_regla_vip, '')), '');
  v_permisos jsonb := coalesce(p_permisos, '{}'::jsonb);
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF length(v_nombre) NOT BETWEEN 2 AND 60 OR v_nombre ~* '(https?:|www\.|[<>/@])' THEN
    RAISE EXCEPTION 'Escribe el nombre (de 2 a 60 letras)';
  END IF;
  IF v_telefono !~ '^\+[0-9]{8,15}$' THEN RAISE EXCEPTION 'Revisa el número de celular'; END IF;
  IF p_mes_cumple IS NOT NULL AND p_mes_cumple NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Mes de cumpleaños inválido'; END IF;
  IF v_vip IS NOT NULL AND length(v_vip) > 80 THEN RAISE EXCEPTION 'La regla VIP es muy larga (máximo 80)'; END IF;

  SELECT * INTO t FROM public.tarjetas WHERE id = p_tarjeta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró la tarjeta'; END IF;

  BEGIN
    UPDATE public.clientes SET nombre = v_nombre, telefono = v_telefono, mes_cumple = p_mes_cumple WHERE id = t.cliente_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Ese celular ya pertenece a otro cliente';
  END;

  UPDATE public.tarjetas SET
    regla_vip          = v_vip,
    permite_niveles    = coalesce((v_permisos->>'niveles')::boolean, permite_niveles),
    permite_cashback   = coalesce((v_permisos->>'cashback')::boolean, permite_cashback),
    permite_sellos     = coalesce((v_permisos->>'sellos')::boolean, permite_sellos),
    permite_promo      = coalesce((v_permisos->>'promo')::boolean, permite_promo),
    permite_cumple     = coalesce((v_permisos->>'cumple')::boolean, permite_cumple),
    permite_compartida = coalesce((v_permisos->>'compartida')::boolean, permite_compartida),
    activa             = coalesce(p_activa, activa)
  WHERE id = t.id;

  PERFORM public._bitacora('cliente', format('Se editó la tarjeta de %s (#%s)', v_nombre, t.folio), t.id,
                           jsonb_build_object('regla_vip', v_vip, 'permisos', v_permisos, 'activa', p_activa));
  RETURN public._estado_tarjeta(t.id);
END; $$;

CREATE OR REPLACE FUNCTION public.cupon_reactivacion(p_tarjeta_id uuid, p_activo boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t public.tarjetas%ROWTYPE;
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  UPDATE public.tarjetas SET cupon_reactivacion = coalesce(p_activo, false),
         cupon_emitido_en = CASE WHEN p_activo THEN now() ELSE cupon_emitido_en END
  WHERE id = p_tarjeta_id RETURNING * INTO t;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró la tarjeta'; END IF;
  PERFORM public._bitacora('cliente',
    format(CASE WHEN p_activo THEN 'Cupón de regreso emitido a #%s' ELSE 'Cupón de regreso retirado a #%s' END, t.folio),
    t.id, '{}'::jsonb);
  RETURN public._estado_tarjeta(t.id);
END; $$;

-- Guarda todos los niveles de una vez. Siempre debe haber uno desde $0.
CREATE OR REPLACE FUNCTION public.guardar_niveles(p_niveles jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cantidad integer;
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF jsonb_typeof(p_niveles) <> 'array' THEN RAISE EXCEPTION 'Formato de niveles inválido'; END IF;
  v_cantidad := jsonb_array_length(p_niveles);
  IF v_cantidad NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Debe haber de 1 a 10 niveles'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_niveles) e WHERE (e->>'gasto_minimo')::numeric = 0) THEN
    RAISE EXCEPTION 'El primer nivel debe empezar en $0';
  END IF;

  DELETE FROM public.niveles WHERE true;
  BEGIN
    INSERT INTO public.niveles (nombre, descuento_pct, gasto_minimo)
    SELECT btrim(e->>'nombre'), (e->>'descuento_pct')::numeric, (e->>'gasto_minimo')::numeric
    FROM jsonb_array_elements(p_niveles) e;
  EXCEPTION
    WHEN unique_violation THEN RAISE EXCEPTION 'Dos niveles no pueden tener el mismo gasto mínimo';
    WHEN check_violation THEN RAISE EXCEPTION 'Revisa los niveles: nombre de 1 a 40 letras y descuento de 0 a 50%%';
  END;

  PERFORM public._bitacora('config', 'Se actualizaron los niveles', NULL, jsonb_build_object('niveles', public._niveles_json()));
  RETURN public._niveles_json();
END; $$;

CREATE OR REPLACE FUNCTION public.regenerar_codigo_alta()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_codigo text;
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  PERFORM set_config('armada.regenerar_codigo_alta', 'si', true);
  FOR i IN 1..5 LOOP
    BEGIN
      UPDATE public.config_lealtad SET codigo_alta = public._codigo_aleatorio(10) WHERE id RETURNING codigo_alta INTO v_codigo;
      EXIT;
    EXCEPTION WHEN unique_violation THEN v_codigo := NULL;
    END;
  END LOOP;
  PERFORM set_config('armada.regenerar_codigo_alta', '', true);
  IF v_codigo IS NULL THEN RAISE EXCEPTION 'No se pudo generar el código, intenta de nuevo'; END IF;
  RETURN v_codigo;
END; $$;

-- -----------------------------------------------------------------------------
-- 14. Búsqueda en caja: URL del QR, código (agrupado o no), folio o celular
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.buscar_tarjeta(p_texto text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_texto text := btrim(coalesce(p_texto, ''));
  v_limpio text;
  v_id uuid;
  v_url text[];
BEGIN
  IF NOT public.es_staff() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  v_url := regexp_match(v_texto, '/tarjeta/([A-Za-z0-9-]+)');
  v_limpio := upper(regexp_replace(coalesce(v_url[1], v_texto), '[\s-]', '', 'g'));

  IF v_limpio ~ '^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{12}$' THEN
    SELECT id INTO v_id FROM public.tarjetas WHERE codigo = v_limpio;
  END IF;
  IF v_id IS NULL AND v_limpio ~ '^(ARM)?[0-9]{1,7}$' THEN
    SELECT id INTO v_id FROM public.tarjetas WHERE folio = 'ARM-' || regexp_replace(v_limpio, '^ARM', '');
  END IF;
  IF v_id IS NULL AND length(regexp_replace(v_texto, '\D', '', 'g')) >= 10 THEN
    SELECT t.id INTO v_id FROM public.tarjetas t JOIN public.clientes c ON c.id = t.cliente_id
    WHERE c.telefono_10 = right(regexp_replace(v_texto, '\D', '', 'g'), 10);
  END IF;
  RETURN CASE WHEN v_id IS NULL THEN NULL ELSE public._estado_tarjeta(v_id) END;
END; $$;

-- -----------------------------------------------------------------------------
-- 15. Lecturas públicas (anon): el pase y la página del QR del mostrador
-- -----------------------------------------------------------------------------
-- Solo el PRIMER nombre del cliente, nunca el celular ni las visitas.
CREATE OR REPLACE FUNCTION public.tarjeta_publica(p_codigo text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'tarjeta', jsonb_build_object(
      'codigo', t.codigo, 'folio', t.folio, 'cliente', split_part(btrim(c.nombre), ' ', 1),
      'mes_cumple', c.mes_cumple, 'gasto_historico', t.gasto_historico, 'puntos', t.puntos,
      'sellos', t.sellos, 'premios_canjeados', t.premios_canjeados, 'regla_vip', t.regla_vip,
      'cupon_reactivacion', t.cupon_reactivacion, 'cumple_canjeado_anio', t.cumple_canjeado_anio,
      'permite_niveles', t.permite_niveles, 'permite_cashback', t.permite_cashback,
      'permite_sellos', t.permite_sellos, 'permite_promo', t.permite_promo,
      'permite_cumple', t.permite_cumple, 'permite_compartida', t.permite_compartida,
      'activa', t.activa),
    'config', public._config_publica(),
    'niveles', public._niveles_json(),
    'hoy', public._hoy_mx())
  FROM public.tarjetas t JOIN public.clientes c ON c.id = t.cliente_id
  WHERE t.codigo = upper(regexp_replace(btrim(coalesce(p_codigo, '')), '[\s-]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.programa_alta_publica(p_codigo_alta text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('codigo_alta', c.codigo_alta, 'config', public._config_publica(),
                            'niveles', public._niveles_json(), 'hoy', public._hoy_mx())
  FROM public.config_lealtad c
  WHERE c.alta_publica AND c.codigo_alta = upper(btrim(coalesce(p_codigo_alta, '')));
$$;

-- -----------------------------------------------------------------------------
-- 16. Quién ejecuta qué
-- -----------------------------------------------------------------------------
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.es_staff(), public.es_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_pase_manual(text, text, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_compra(uuid, numeric, text, boolean, boolean, integer, boolean, boolean, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_tarjeta(uuid, integer, integer, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.configurar_tarjeta(uuid, text, text, smallint, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cupon_reactivacion(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_niveles(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerar_codigo_alta() TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_tarjeta(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tarjeta_publica(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.programa_alta_publica(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alta_publica(text, text, text, smallint) TO service_role;
GRANT EXECUTE ON FUNCTION public.consumir_rate_limit(text, integer, integer) TO service_role;

-- -----------------------------------------------------------------------------
-- 17. Niveles por defecto (los del simulador)
-- -----------------------------------------------------------------------------
INSERT INTO public.niveles (nombre, descuento_pct, gasto_minimo) VALUES
  ('Nivel Principiante', 5, 0),
  ('Nivel Atleta', 10, 3000),
  ('Nivel Culturista', 15, 10000);
