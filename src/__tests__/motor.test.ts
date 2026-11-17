import { describe, expect, it } from "vitest";
import {
  agregarMiTarjeta,
  beneficioPrincipal,
  calcularCompra,
  cambioDeTarjeta,
  codigoAgrupado,
  codigoAltaValido,
  codigoDesdeEscaneo,
  estadoPase,
  hoyMexico,
  leerMisTarjetas,
  mensajePase,
  nivelDe,
  nombreAltaValido,
  panelLealtad,
  progreso,
  promoVigente,
  siguienteNivel,
  urlAlta,
  urlTarjeta,
  urlWhatsApp,
  type EntradaCompra,
} from "@/features/lealtad/motor";
import type { ConfigLealtad, Nivel, TarjetaBase } from "@/features/lealtad/types";

const CONFIG: ConfigLealtad = {
  niveles_activos: true,
  mostrar_gasto_en_pase: true,
  cashback_activo: true,
  nombre_puntos: "Puntos Armada",
  cashback_pct: 5,
  cashback_puntos_por_peso: 1,
  puntos_bienvenida: 50,
  sellos_activos: true,
  sellos_titulo: "Sellos de Proteína",
  sellos_meta: 5,
  sellos_premio: "6ta Proteína con 30% OFF",
  icono_sello: "pesa",
  compra_minima_sello: 0,
  promo_activa: true,
  promo_texto: "Viernes de 20% OFF en Creatinas",
  promo_inicio: null,
  promo_fin: null,
  cumple_activo: true,
  cumple_texto: "Shaker gratis",
  compartida_activa: true,
  compartida_bono_pts: 50,
  reactivacion_dias: 45,
  reactivacion_texto: "25% OFF + Pre-entreno",
  vip_nombre_regla: "Regla VIP Individual",
  alta_publica: false,
  aviso_privacidad_url: null,
};

const NIVELES: Nivel[] = [
  { nombre: "Nivel Atleta", descuento_pct: 10, gasto_minimo: 3000 },
  { nombre: "Nivel Principiante", descuento_pct: 5, gasto_minimo: 0 },
  { nombre: "Nivel Culturista", descuento_pct: 15, gasto_minimo: 10000 },
];

const HOY = hoyMexico("2026-11-12");

function tarjeta(t: Partial<TarjetaBase> = {}): TarjetaBase {
  return {
    codigo: "6XAHQCNCHPZF",
    folio: "ARM-101",
    gasto_historico: 0,
    puntos: 0,
    sellos: 0,
    premios_canjeados: 0,
    regla_vip: null,
    cupon_reactivacion: false,
    cumple_canjeado_anio: null,
    permite_niveles: true,
    permite_cashback: true,
    permite_sellos: true,
    permite_promo: true,
    permite_cumple: true,
    permite_compartida: true,
    activa: true,
    ...t,
  };
}

const COMPRA: EntradaCompra = {
  total: 1000,
  prestada: false,
  sumarSello: true,
  canjearPuntos: 0,
  canjearSellos: false,
  entregarCumple: false,
  usarCupon: false,
};

describe("progreso de sellos", () => {
  it("cuenta llenos, faltantes y premios", () => {
    expect(progreso(3, 5)).toMatchObject({ llenos: 3, faltan: 2, premiosDisponibles: 0, pct: 60 });
    expect(progreso(7, 5)).toMatchObject({ llenos: 5, faltan: 0, premiosDisponibles: 1, pct: 100 });
    expect(progreso(-2, 0)).toMatchObject({ llenos: 0, meta: 1 });
  });
});

describe("niveles", () => {
  it("toma el nivel del mayor mínimo alcanzado, aunque lleguen desordenados", () => {
    expect(nivelDe(0, NIVELES)?.nombre).toBe("Nivel Principiante");
    expect(nivelDe(2999.99, NIVELES)?.nombre).toBe("Nivel Principiante");
    expect(nivelDe(3000, NIVELES)?.nombre).toBe("Nivel Atleta");
    expect(nivelDe(12500, NIVELES)?.nombre).toBe("Nivel Culturista");
    expect(nivelDe(100, [])).toBeNull();
  });

  it("sabe cuál sigue", () => {
    expect(siguienteNivel(4500, NIVELES)?.nombre).toBe("Nivel Culturista");
    expect(siguienteNivel(10000, NIVELES)).toBeNull();
  });
});

describe("beneficio principal (VIP > cupón > nivel)", () => {
  const nivel = NIVELES[0];
  it("el VIP gana a todo", () => {
    const b = beneficioPrincipal({ regla_vip: "15% mayorista", cupon_reactivacion: true }, CONFIG, nivel, true);
    expect(b.tipo).toBe("vip");
    expect(b.texto).toBe("15% mayorista");
  });
  it("el cupón solo cuenta si se usa", () => {
    expect(beneficioPrincipal({ regla_vip: null, cupon_reactivacion: true }, CONFIG, nivel, true).tipo).toBe("cupon");
    expect(beneficioPrincipal({ regla_vip: null, cupon_reactivacion: true }, CONFIG, nivel, false).tipo).toBe("nivel");
  });
  it("sin nada, pase estándar", () => {
    expect(beneficioPrincipal({ regla_vip: null, cupon_reactivacion: false }, CONFIG, null, false).tipo).toBe("ninguno");
  });
});

describe("estado del pase", () => {
  it("respeta los interruptores globales y por cliente", () => {
    const e = estadoPase(tarjeta({ permite_niveles: false }), null, { ...CONFIG, sellos_activos: false }, NIVELES, HOY);
    expect(e.usaNiveles).toBe(false);
    expect(e.nivel).toBeNull();
    expect(e.usaSellos).toBe(false);
    expect(e.usaCashback).toBe(true);
  });

  it("cumpleaños: solo en su mes y una vez por año", () => {
    expect(estadoPase(tarjeta(), 11, CONFIG, NIVELES, HOY).cumpleDisponible).toBe(true);
    expect(estadoPase(tarjeta(), 5, CONFIG, NIVELES, HOY).cumpleDisponible).toBe(false);
    const entregado = estadoPase(tarjeta({ cumple_canjeado_anio: 2026 }), 11, CONFIG, NIVELES, HOY);
    expect(entregado.cumpleDisponible).toBe(false);
    expect(entregado.cumpleEntregado).toBe(true);
    // El del año pasado ya no cuenta.
    expect(estadoPase(tarjeta({ cumple_canjeado_anio: 2025 }), 11, CONFIG, NIVELES, HOY).cumpleDisponible).toBe(true);
  });

  it("progreso al siguiente nivel", () => {
    const e = estadoPase(tarjeta({ gasto_historico: 6500 }), null, CONFIG, NIVELES, HOY);
    expect(e.nivel?.nombre).toBe("Nivel Atleta");
    expect(e.siguiente?.nombre).toBe("Nivel Culturista");
    expect(e.faltaParaSiguiente).toBe(3500);
    expect(e.pctNivel).toBe(50);
  });
});

describe("promo relámpago con fechas", () => {
  it("se apaga fuera de su rango", () => {
    expect(promoVigente(CONFIG, HOY)).toBe(true);
    expect(promoVigente({ ...CONFIG, promo_inicio: "2026-11-13" }, HOY)).toBe(false);
    expect(promoVigente({ ...CONFIG, promo_fin: "2026-11-11" }, HOY)).toBe(false);
    expect(promoVigente({ ...CONFIG, promo_inicio: "2026-11-01", promo_fin: "2026-11-12" }, HOY)).toBe(true);
    expect(promoVigente({ ...CONFIG, promo_texto: "  " }, HOY)).toBe(false);
  });
});

describe("calcularCompra (espejo de registrar_compra)", () => {
  it("compra normal: cashback, sello y nivel", () => {
    const r = calcularCompra(tarjeta({ gasto_historico: 2500, puntos: 10, sellos: 1 }), null, CONFIG, NIVELES, HOY, COMPRA);
    expect(r.errores).toEqual([]);
    expect(r.beneficio.tipo).toBe("nivel");
    expect(r.beneficio.descuento_pct).toBe(5);
    expect(r.puntosGanados).toBe(50);
    expect(r.sello).toBe(true);
    expect(r.sellosFinales).toBe(2);
    expect(r.puntosFinales).toBe(60);
    expect(r.subeNivel).toBe(true);
    expect(r.nivelFinal?.nombre).toBe("Nivel Atleta");
  });

  it("el cashback redondea hacia abajo", () => {
    expect(calcularCompra(tarjeta(), null, CONFIG, NIVELES, HOY, { ...COMPRA, total: 1499 }).puntosGanados).toBe(74);
  });

  it("canje parcial de puntos, hasta el saldo", () => {
    const ok = calcularCompra(tarjeta({ puntos: 150 }), null, CONFIG, NIVELES, HOY, { ...COMPRA, canjearPuntos: 100 });
    expect(ok.errores).toEqual([]);
    expect(ok.puntosFinales).toBe(150 - 100 + 50);
    const mal = calcularCompra(tarjeta({ puntos: 20 }), null, CONFIG, NIVELES, HOY, { ...COMPRA, canjearPuntos: 21 });
    expect(mal.errores[0]).toMatch(/solo tiene 20 puntos/);
  });

  it("canje de sellos: descuenta la meta, conserva el excedente y no suma sello", () => {
    const r = calcularCompra(tarjeta({ sellos: 7 }), null, CONFIG, NIVELES, HOY, { ...COMPRA, canjearSellos: true });
    expect(r.premio).toBe(true);
    expect(r.sello).toBe(false);
    expect(r.sellosFinales).toBe(2);
    const sinSellos = calcularCompra(tarjeta({ sellos: 4 }), null, CONFIG, NIVELES, HOY, { ...COMPRA, canjearSellos: true });
    expect(sinSellos.errores[0]).toMatch(/Aún no completa/);
  });

  it("compra mínima para el sello", () => {
    const r = calcularCompra(tarjeta(), null, { ...CONFIG, compra_minima_sello: 500 }, NIVELES, HOY, { ...COMPRA, total: 300 });
    expect(r.sello).toBe(false);
    expect(r.avisoSello).toMatch(/500/);
  });

  it("cumpleaños fuera de su mes o repetido no se entrega", () => {
    expect(calcularCompra(tarjeta(), 5, CONFIG, NIVELES, HOY, { ...COMPRA, entregarCumple: true }).errores[0]).toMatch(/mes de cumpleaños/);
    expect(
      calcularCompra(tarjeta({ cumple_canjeado_anio: 2026 }), 11, CONFIG, NIVELES, HOY, { ...COMPRA, entregarCumple: true }).errores[0]
    ).toMatch(/ya se entregó/);
    expect(calcularCompra(tarjeta(), 11, CONFIG, NIVELES, HOY, { ...COMPRA, entregarCumple: true }).cumple).toBe(true);
  });

  it("cupón: solo si lo tiene y nunca con VIP", () => {
    expect(calcularCompra(tarjeta(), null, CONFIG, NIVELES, HOY, { ...COMPRA, usarCupon: true }).errores[0]).toMatch(/no tiene cupón/);
    const vip = calcularCompra(tarjeta({ regla_vip: "15%", cupon_reactivacion: true }), null, CONFIG, NIVELES, HOY, {
      ...COMPRA,
      usarCupon: true,
    });
    expect(vip.errores[0]).toMatch(/VIP/);
    const ok = calcularCompra(tarjeta({ cupon_reactivacion: true }), null, CONFIG, NIVELES, HOY, { ...COMPRA, usarCupon: true });
    expect(ok.beneficio.tipo).toBe("cupon");
    expect(ok.cupon).toBe(true);
  });

  it("tarjeta prestada: bono al titular, nada más le cuenta", () => {
    const r = calcularCompra(tarjeta({ gasto_historico: 2900, puntos: 10, sellos: 1 }), null, CONFIG, NIVELES, HOY, {
      ...COMPRA,
      prestada: true,
    });
    expect(r.errores).toEqual([]);
    expect(r.bonoCompartida).toBe(50);
    expect(r.puntosGanados).toBe(0);
    expect(r.sello).toBe(false);
    expect(r.gastoFinal).toBe(2900);
    expect(r.puntosFinales).toBe(60);
    expect(r.beneficio.descuento_pct).toBe(5);
    expect(calcularCompra(tarjeta({ puntos: 10 }), null, CONFIG, NIVELES, HOY, { ...COMPRA, prestada: true, canjearPuntos: 5 }).errores[0]).toMatch(
      /prestada/
    );
  });

  it("sin bono si la dinámica compartida está apagada para el cliente", () => {
    const r = calcularCompra(tarjeta({ permite_compartida: false }), null, CONFIG, NIVELES, HOY, { ...COMPRA, prestada: true });
    expect(r.bonoCompartida).toBe(0);
  });

  it("tarjeta desactivada y total inválido", () => {
    expect(calcularCompra(tarjeta({ activa: false }), null, CONFIG, NIVELES, HOY, COMPRA).errores[0]).toMatch(/desactivada/);
    expect(calcularCompra(tarjeta(), null, CONFIG, NIVELES, HOY, { ...COMPRA, total: -1 }).errores[0]).toMatch(/total/);
  });
});

describe("códigos y enlaces", () => {
  it("lee el código de la URL del QR, agrupado o suelto", () => {
    expect(codigoDesdeEscaneo("https://pase.armadanutrition.com/tarjeta/6XAHQCNCHPZF")).toBe("6XAHQCNCHPZF");
    expect(codigoDesdeEscaneo("6xah-qcnc-hpzf")).toBe("6XAHQCNCHPZF");
    expect(codigoDesdeEscaneo("ARM-101")).toBeNull();
    // 0, O, 1, I, L y U no existen en el alfabeto.
    expect(codigoDesdeEscaneo("0XAHQCNCHPZF")).toBeNull();
  });

  it("agrupa y arma URLs", () => {
    expect(codigoAgrupado("6XAHQCNCHPZF")).toBe("6XAH-QCNC-HPZF");
    expect(urlTarjeta("6XAHQCNCHPZF", "https://pase.armadanutrition.com/")).toBe("https://pase.armadanutrition.com/tarjeta/6XAHQCNCHPZF");
    expect(urlAlta("ABCDEFGHJK", "https://x.mx")).toBe("https://x.mx/unirse/ABCDEFGHJK");
    expect(codigoAltaValido(" abcdefghjk ")).toBe("ABCDEFGHJK");
    expect(codigoAltaValido("ABC")).toBeNull();
  });

  it("valida nombres como la base", () => {
    expect(nombreAltaValido("Ana")).toBe(true);
    expect(nombreAltaValido("A")).toBe(false);
    expect(nombreAltaValido("visita www.spam.com")).toBe(false);
    expect(nombreAltaValido("<script>")).toBe(false);
  });

  it("recuerda los pases sacados en este celular", () => {
    expect(leerMisTarjetas("basura")).toEqual([]);
    const lista = agregarMiTarjeta([{ codigoAlta: "A", codigo: "6XAHQCNCHPZF" }], { codigoAlta: "A", codigo: "7XAHQCNCHPZF" });
    expect(lista).toHaveLength(1);
    expect(leerMisTarjetas(JSON.stringify(lista))[0].codigo).toBe("7XAHQCNCHPZF");
  });
});

describe("WhatsApp", () => {
  it("arma el enlace wa.me con el texto codificado", () => {
    const u = urlWhatsApp("+52 55 4123 9876", "¡Hola!");
    expect(u).toBe(`https://wa.me/525541239876?text=${encodeURIComponent("¡Hola!")}`);
    const m = mensajePase({ nombre: "alejandro guzmán", url: "https://x", folio: "ARM-101", estatus: "Nivel Atleta", nombrePuntos: "Puntos Armada", puntos: 150 });
    expect(m).toContain("¡Hola Alejandro!");
    expect(m).toContain("#ARM-101");
  });
});

describe("pase vivo", () => {
  it("no anima la primera vez", () => {
    expect(cambioDeTarjeta(null, { sellos: 3, canjes: 0 }, 5).nuevos).toEqual([]);
  });
  it("anima los sellos nuevos, el premio y la subida de nivel", () => {
    const c = cambioDeTarjeta({ sellos: 3, canjes: 0, nivel: "Atleta", puntos: 10 }, { sellos: 5, canjes: 0, nivel: "Culturista", puntos: 60 }, 5);
    expect(c.nuevos).toEqual([3, 4]);
    expect(c.completa).toBe(true);
    expect(c.subioNivel).toBe(true);
    expect(c.puntosNuevos).toBe(50);
  });
  it("después de un canje, la cuenta empieza de nuevo", () => {
    expect(cambioDeTarjeta({ sellos: 5, canjes: 0 }, { sellos: 1, canjes: 1 }, 5).nuevos).toEqual([0]);
  });
});

describe("panel", () => {
  it("cuenta a quién atender", () => {
    const ahora = new Date("2026-11-12T12:00:00Z");
    const hace = (d: number) => new Date(ahora.getTime() - d * 86_400_000).toISOString();
    const p = panelLealtad(
      [
        { sellos: 4, activa: true, ultima_visita: hace(2), mes_cumple: 11, cumple_canjeado_anio: null },
        { sellos: 5, activa: true, ultima_visita: hace(60), cupon_reactivacion: false },
        { sellos: 5, activa: false, ultima_visita: hace(60) },
        { sellos: 0, activa: true, ultima_visita: hace(50), cupon_reactivacion: true, mes_cumple: 11, cumple_canjeado_anio: 2026 },
      ],
      CONFIG,
      HOY,
      ahora
    );
    expect(p).toEqual({ aUnSello: 1, conPremio: 1, inactivas: 2, inactivasSinCupon: 1, cumpleanerosPendientes: 1 });
  });
});
