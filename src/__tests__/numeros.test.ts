import { describe, expect, it } from "vitest";
import { sanearNumero, parsearNumero, dentroDeRango } from "@/lib/numeros";

describe("sanearNumero", () => {
  const casos: [string, OpcionesNumero, string][] = [
    // Básicos
    ["", {}, ""],
    ["0", {}, "0"],
    ["5", {}, "5"],
    // Ceros a la izquierda
    ["05", {}, "5"],
    ["00", {}, "0"],
    ["000", {}, "0"],
    ["005", {}, "5"],
    // Decimales
    ["0.5", { decimal: true }, "0.5"],
    ["05.5", { decimal: true }, "5.5"],
    [".5", { decimal: true }, "0.5"],
    ["12.", { decimal: true }, "12."],
    ["1.2.3", { decimal: true }, "1.23"],
    // Negativos
    ["-", { negativo: true }, "-"],
    ["-0", { negativo: true }, "-0"],
    ["-05", { negativo: true }, "-5"],
    ["-0.5", { negativo: true, decimal: true }, "-0.5"],
    // Basura
    ["1-2", {}, "12"],
    ["abc", {}, ""],
    ["1e5", {}, "15"],
  ];

  for (const [bruto, opts, esperado] of casos) {
    it(`${JSON.stringify(bruto)} + ${JSON.stringify(opts)} → ${JSON.stringify(esperado)}`, () => {
      expect(sanearNumero(bruto, opts)).toBe(esperado);
    });
  }

  it("sin decimal quita puntos", () => {
    expect(sanearNumero("1.5", { decimal: false })).toBe("15");
    expect(sanearNumero("0.5", { decimal: false })).toBe("5");
  });
});

describe("parsearNumero", () => {
  const casos: [string, number][] = [
    ["", 0],
    ["0", 0],
    ["5", 5],
    ["05", 5],
    ["0.5", 0.5],
    ["-0.5", -0.5],
    ["-", 0],
    ["-0", 0],
    ["+", 0],
    ["12.", 12],
    [".5", 0.5],
  ];

  for (const [texto, esperado] of casos) {
    it(`${JSON.stringify(texto)} → ${esperado}`, () => {
      expect(parsearNumero(texto)).toBe(esperado);
    });
  }
});

describe("dentroDeRango", () => {
  it("sin límites siempre true", () => {
    expect(dentroDeRango(0, {})).toBe(true);
    expect(dentroDeRango(-5, {})).toBe(true);
    expect(dentroDeRango(100, {})).toBe(true);
  });

  it("min", () => {
    expect(dentroDeRango(1, { min: 2 })).toBe(false);
    expect(dentroDeRango(2, { min: 2 })).toBe(true);
    expect(dentroDeRango(5, { min: 2 })).toBe(true);
  });

  it("max", () => {
    expect(dentroDeRango(51, { max: 50 })).toBe(false);
    expect(dentroDeRango(50, { max: 50 })).toBe(true);
    expect(dentroDeRango(10, { max: 50 })).toBe(true);
  });

  it("min y max", () => {
    expect(dentroDeRango(1, { min: 2, max: 20 })).toBe(false);
    expect(dentroDeRango(2, { min: 2, max: 20 })).toBe(true);
    expect(dentroDeRango(20, { min: 2, max: 20 })).toBe(true);
    expect(dentroDeRango(21, { min: 2, max: 20 })).toBe(false);
  });
});

// Tipos para que TypeScript no se queje en los arrays de arriba
interface OpcionesNumero {
  decimal?: boolean;
  negativo?: boolean;
  min?: number;
  max?: number;
}