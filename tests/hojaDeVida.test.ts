import { describe, expect, it } from "vitest";
import { buscarEnHojaDeVida, contieneFrase, crearHerramientaBusqueda, lineasDe, normalizar } from "../src/hojaDeVida.js";

const HV = `Laura Gómez
- Construí el catálogo con React, TypeScript y Redux Toolkit.
- Pruebas de componentes con Jest y React Testing Library: 140 pruebas en GitHub Actions.
Proyecto con Next.js y Firebase.
Inglés intermedio (B1)`;
const lineas = lineasDe(HV);

describe("normalizar", () => {
  it("quita tildes, signos y mayúsculas", () => {
    expect(normalizar("  Next.js,  INGLÉS ")).toBe("next js ingles");
  });
});

describe("contieneFrase", () => {
  it("encuentra frases aunque cambien tildes o signos", () => {
    expect(contieneFrase(HV, "ingles intermedio")).toBe(true);
    expect(contieneFrase(HV, "React, TypeScript y Redux Toolkit")).toBe(true);
  });

  it("respeta los límites de palabra", () => {
    expect(contieneFrase(HV, "Git")).toBe(false); // solo aparece "GitHub"
    expect(contieneFrase(HV, "")).toBe(false);
  });
});

describe("buscarEnHojaDeVida", () => {
  it("devuelve las líneas donde aparece el término", () => {
    const r = buscarEnHojaDeVida(lineas, "jest");
    expect(r.encontrado).toBe(true);
    if (r.encontrado) expect(r.lineas[0].texto).toContain("Jest y React Testing Library");
  });

  it("encuentra por palabras sueltas e ignora plurales", () => {
    const r = buscarEnHojaDeVida(lineas, "prueba de componente");
    expect(r.encontrado).toBe(true);
  });

  it("no inventa coincidencias: Next.js no es Node.js", () => {
    expect(buscarEnHojaDeVida(lineas, "Node.js").encontrado).toBe(false);
    expect(buscarEnHojaDeVida(lineas, "PostgreSQL").encontrado).toBe(false);
  });
});

describe("herramienta buscar_en_hoja_de_vida", () => {
  it("devuelve JSON que el agente puede leer", async () => {
    const salida = await crearHerramientaBusqueda(lineas).invoke({ termino: "Firebase" });
    expect(JSON.parse(String(salida))).toMatchObject({ encontrado: true });
  });
});
