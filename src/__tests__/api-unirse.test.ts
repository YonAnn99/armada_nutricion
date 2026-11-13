import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rateLimit = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  consumirRateLimit: (...args: unknown[]) => rateLimit(...args),
  cabecerasRateLimit: () => ({}),
  obtenerIpCliente: () => "1.2.3.4",
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({ rpc: (...args: unknown[]) => rpc(...args) }),
}));

import { POST } from "@/app/api/unirse/route";

const VALIDO = {
  codigoAlta: "8D8CXJZAY8",
  nombre: "Ana   López",
  pais: "MX",
  numero: "55 1234 5678",
  mesCumple: 11,
  acepto: true,
  token: "tok",
  sitio: "",
};

function peticion(cuerpo: unknown) {
  return new Request("http://localhost/api/unirse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
}

describe("POST /api/unirse", () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    rateLimit.mockResolvedValue({ permitido: true, contador: 1, reiniciaEn: new Date() });
    rpc.mockResolvedValue({ data: { estado: "creada", codigo: "6XAHQCNCHPZF" }, error: null });
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secreto");
    vi.stubEnv("NODE_ENV", "production");
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = fetchOriginal;
    rpc.mockReset();
  });

  it("crea el pase con los datos limpios y en E.164", async () => {
    const res = await POST(peticion(VALIDO));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ estado: "creada", codigo: "6XAHQCNCHPZF" });
    expect(rpc).toHaveBeenCalledWith("alta_publica", {
      p_codigo_alta: "8D8CXJZAY8",
      p_nombre: "Ana López",
      p_telefono: "+525512345678",
      p_mes_cumple: 11,
    });
  });

  it("un celular repetido no recibe código", async () => {
    rpc.mockResolvedValue({ data: { estado: "ya_registrado" }, error: null });
    const res = await POST(peticion(VALIDO));
    expect(await res.json()).toEqual({ estado: "ya_registrado" });
  });

  it("el bot que llena la trampa no escribe nada", async () => {
    const res = await POST(peticion({ ...VALIDO, sitio: "http://spam" }));
    expect(await res.json()).toEqual({ estado: "ya_registrado" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sin aceptar el aviso: 400", async () => {
    const res = await POST(peticion({ ...VALIDO, acepto: false }));
    expect(res.status).toBe(400);
  });

  it("celular o mes inválidos: 400", async () => {
    expect((await POST(peticion({ ...VALIDO, numero: "123" }))).status).toBe(400);
    expect((await POST(peticion({ ...VALIDO, mesCumple: 13 }))).status).toBe(400);
  });

  it("rate limit: 429", async () => {
    rateLimit.mockResolvedValue({ permitido: false, contador: 11, reiniciaEn: new Date() });
    expect((await POST(peticion(VALIDO))).status).toBe(429);
  });

  it("en producción sin llave de Turnstile falla cerrado (503)", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect((await POST(peticion(VALIDO))).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("Turnstile rechazado: 403", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 }));
    expect((await POST(peticion(VALIDO))).status).toBe(403);
  });

  it("en desarrollo sin llaves deja probar el registro", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect((await POST(peticion({ ...VALIDO, token: null }))).status).toBe(200);
  });

  it("traduce los errores conocidos de la base", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Este registro no está disponible" } });
    const res = await POST(peticion(VALIDO));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/Pide tu pase en caja/);
  });
});
