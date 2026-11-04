import { describe, expect, it } from "vitest";
import type { Analisis, Requisito } from "../src/esquema.js";
import {
  calcularEncaje,
  completarResultado,
  evidenciaValida,
  filtrarPalabrasFaltantes,
  verificarConsejos,
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

describe("regla: nunca afirmar algo que la hoja de vida no prueba (consejos)", () => {
  it("un consejo con cita literal se muestra con la cita a la vista", () => {
    const { validos, rechazados } = verificarConsejos(
      [{ consejo: "Pon arriba el catálogo: responde a React", cita: "Construí el catálogo con React" }],
      HV,
    );
    expect(validos).toEqual(["Pon arriba el catálogo: responde a React — «Construí el catálogo con React»"]);
    expect(rechazados).toEqual([]);
  });

  it("un consejo cuya cita no está en la hoja de vida se descarta, aunque suene bien", () => {
    const { validos, rechazados } = verificarConsejos(
      [
        { consejo: "Destaca tus 3 años con AWS", cita: "3 años desplegando en AWS" },
        { consejo: "Menciona GraphQL", cita: "" },
      ],
      HV,
    );
    expect(validos).toEqual([]);
    expect(rechazados).toEqual(["Destaca tus 3 años con AWS", "Menciona GraphQL"]);
  });

  it("completarResultado deja solo los consejos verificados y avisa cuántos quitó", () => {
    const r = completarResultado(
      {
        cargo: "Frontend",
        empresa: "Ejemplo",
        requisitos: [],
        palabras_clave_faltantes: [],
        que_destacar: [
          { consejo: "Destaca GraphQL", cita: "API REST y GraphQL" },
          { consejo: "Destaca tu liderazgo de equipo", cita: "Lideré un equipo de 5 personas" },
        ],
        advertencias: [],
      },
      HV,
    );
    expect(r.que_destacar).toEqual(["Destaca GraphQL — «API REST y GraphQL»"]);
    expect(r.advertencias.at(-1)).toMatch(/Se quitaron 1 consejo/);
  });
});
