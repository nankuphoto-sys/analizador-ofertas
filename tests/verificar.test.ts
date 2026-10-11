import { describe, expect, it } from "vitest";
import type { Analisis, Requisito } from "../src/esquema.js";
import {
  calcularEncaje,
  completarResultado,
  evidenciaValida,
  filtrarPalabrasFaltantes,
  verificarRequisitos,
} from "../src/verificar.js";

const HV = `Desarrolladora Frontend — Tiendas Aurora
- Construí el catálogo con React,
TypeScript y Redux Toolkit.
- Consumo de API REST y GraphQL.
Inglés intermedio (B1)`;

const req = (r: Partial<Requisito>): Requisito => ({
  requisito: "X",
  tipo: "obligatorio",
  estado: "cumple",
  evidencia: "",
  ...r,
});

describe("evidenciaValida", () => {
  it("acepta citas literales aunque crucen un salto de línea", () => {
    expect(evidenciaValida("con React, TypeScript y Redux Toolkit", HV)).toBe(true);
  });

  it("acepta varias citas separadas por /", () => {
    expect(evidenciaValida("API REST / Inglés intermedio", HV)).toBe(true);
  });

  it("rechaza texto que no está en la hoja de vida", () => {
    expect(evidenciaValida("5 años de experiencia con React", HV)).toBe(false);
    expect(evidenciaValida("", HV)).toBe(false);
  });
});

describe("verificarRequisitos", () => {
  it("pasa a no_cumple lo que se dio por cumplido sin evidencia real", () => {
    const { verificados, rechazadas } = verificarRequisitos(
      [
        req({ requisito: "React", evidencia: "con React" }),
        req({ requisito: "Node.js", evidencia: "Backend con Node.js y Express" }),
        req({ requisito: "Inglés", estado: "parcial", evidencia: "Inglés intermedio" }),
      ],
      HV,
    );
    expect(verificados.map((r) => r.estado)).toEqual(["cumple", "no_cumple", "parcial"]);
    expect(rechazadas).toEqual(["Node.js"]);
  });

  it("vacía la evidencia de los no_cumple", () => {
    const { verificados } = verificarRequisitos([req({ estado: "no_cumple", evidencia: "algo" })], HV);
    expect(verificados[0].evidencia).toBe("");
  });
});

describe("calcularEncaje", () => {
  it("los obligatorios pesan el doble y parcial vale la mitad", () => {
    expect(
      calcularEncaje([
        req({ tipo: "obligatorio", estado: "cumple" }), // 2 de 2
        req({ tipo: "obligatorio", estado: "parcial" }), // 1 de 2
        req({ tipo: "deseable", estado: "no_cumple" }), // 0 de 1
      ]),
    ).toBe(60);
  });

  it("es 0 si no hay requisitos", () => {
    expect(calcularEncaje([])).toBe(0);
  });
});

describe("filtrarPalabrasFaltantes", () => {
  it("quita las que sí están en la hoja de vida y los duplicados", () => {
    expect(filtrarPalabrasFaltantes(["GraphQL", "Docker", "docker ", "AWS"], HV)).toEqual(["Docker", "AWS"]);
  });
});

describe("completarResultado", () => {
  it("calcula el encaje con los requisitos ya verificados y avisa lo rechazado", () => {
    const analisis: Analisis = {
      cargo: "Frontend",
      empresa: "Ejemplo",
      requisitos: [
        req({ requisito: "React", evidencia: "con React" }),
        req({ requisito: "Docker", evidencia: "Contenedores con Docker" }),
      ],
      palabras_clave_faltantes: [],
      que_destacar: [],
      advertencias: [],
    };
    const r = completarResultado(analisis, HV);
    expect(r.encaje).toBe(50);
    expect(r.evidencias_rechazadas).toEqual(["Docker"]);
    expect(r.advertencias.at(-1)).toContain("Docker");
  });
});
