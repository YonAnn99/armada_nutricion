/**
 * Contratos de seguridad de la migración, leídos como texto (como las pruebas
 * de contrato de Symvora): si alguien relaja un permiso, esto truena.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ICONOS_SELLO } from "@/features/lealtad/motor";

const dir = path.resolve(__dirname, "../../supabase/migrations");
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(path.join(dir, f), "utf8"))
  .join("\n");

function funcion(nombre: string): string {
  const inicio = sql.indexOf(`FUNCTION public.${nombre}(`);
  expect(inicio, `no existe ${nombre}`).toBeGreaterThan(-1);
  const fin = sql.indexOf("$$;", inicio);
  return sql.slice(inicio, fin);
}

describe("lecturas públicas", () => {
  it("tarjeta_publica no expone el celular ni el nombre completo", () => {
    const f = funcion("tarjeta_publica");
    expect(f).not.toMatch(/telefono/);
    expect(f).toMatch(/split_part\(btrim\(c\.nombre\), ' ', 1\)/);
    expect(f).not.toMatch(/visitas/);
  });

  it("la config pública no lleva el código del cartel", () => {
    expect(funcion("_config_publica")).toMatch(/- 'codigo_alta'/);
  });

  it("solo las dos lecturas públicas se ejecutan como anon", () => {
    const anon = [...sql.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO ([^;]+);/g)]
      .filter((m) => /\banon\b/.test(m[2]))
      .map((m) => m[1])
      .sort();
    expect(anon).toEqual(["programa_alta_publica", "tarjeta_publica"]);
  });
});

describe("escrituras", () => {
  it("el alta pública es solo de service_role", () => {
    const grants = [...sql.matchAll(/GRANT EXECUTE ON FUNCTION public\.alta_publica\([^)]*\) TO ([^;]+);/g)].map((m) => m[1].trim());
    expect(grants).toEqual(["service_role"]);
  });

  it("no hay políticas de escritura en tablas de saldos", () => {
    for (const tabla of ["tarjetas", "visitas", "movimientos", "bitacora", "clientes"]) {
      expect(sql).not.toMatch(new RegExp(`ON public\\.${tabla}\\s+FOR (INSERT|UPDATE|DELETE|ALL)`));
    }
  });

  it("las RPC del equipo exigen sesión de staff o admin", () => {
    for (const f of ["registrar_compra", "crear_pase_manual", "buscar_tarjeta"]) expect(funcion(f)).toMatch(/es_staff\(\)/);
    for (const f of ["ajustar_tarjeta", "configurar_tarjeta", "cupon_reactivacion", "guardar_niveles", "regenerar_codigo_alta", "resumen_admin"]) {
      expect(funcion(f)).toMatch(/es_admin\(\)/);
    }
  });

  it("toda función SECURITY DEFINER fija search_path", () => {
    const definers = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\([\s\S]*?AS \$\$/g)].filter((m) =>
      /SECURITY DEFINER/.test(m[0])
    );
    expect(definers.length).toBeGreaterThan(10);
    for (const m of definers) expect(m[0], m[1]).toMatch(/SET search_path = ''/);
  });

  it("registrar_compra es idempotente y bloquea la tarjeta", () => {
    const f = funcion("registrar_compra");
    expect(f).toMatch(/WHERE idempotency_key = p_idempotency_key/);
    expect(f).toMatch(/FOR UPDATE/);
  });

  it("el alta pública no devuelve el pase de un celular existente", () => {
    const f = funcion("alta_publica");
    expect(f).toMatch(/'ya_registrado'/);
    expect(f).toMatch(/FOR UPDATE/);
    expect(f).toMatch(/c_tope_diario/);
  });
});

describe("iconos", () => {
  it("la lista del selector es la misma que el CHECK", () => {
    const check = sql.match(/config_icono_ck\s+CHECK \(icono_sello IN \(([^)]+)\)\)/);
    expect(check).not.toBeNull();
    const enSql = check![1].split(",").map((s) => s.trim().replace(/'/g, "")).sort();
    expect(ICONOS_SELLO.map((i) => i.valor).sort()).toEqual(enSql);
  });
});
