import { describe, expect, it } from "vitest";
import { comandoNpm, ENTORNOS, resolverEntorno, rutasDe, sufijoScript } from "../src/entorno.js";

describe("resolverEntorno", () => {
  it("sin valor es desarrollo: olvidar poner APP_ENV nunca cae en producción", () => {
    expect(resolverEntorno(undefined)).toBe("development");
    expect(resolverEntorno("")).toBe("development");
    expect(resolverEntorno("  ")).toBe("development");
  });

  it("acepta los tres entornos", () => {
    for (const e of ENTORNOS) expect(resolverEntorno(e)).toBe(e);
  });

  it("un valor desconocido es un error, no se adivina", () => {
    expect(() => resolverEntorno("prod")).toThrow(/no es un entorno válido/);
    expect(() => resolverEntorno("Production")).toThrow();
  });
});

describe("rutasDe", () => {
  it("producción conserva las rutas de siempre (no se mueven datos reales)", () => {
    expect(rutasDe("production")).toEqual({
      memoria: "memoria/memoria.json",
      gasto: "memoria/gasto.json",
      salidas: "salidas",
      env: ".env.production",
    });
  });

  it("desarrollo y pruebas viven bajo datos/<entorno>/", () => {
    expect(rutasDe("development").memoria).toBe("datos/development/memoria/memoria.json");
    expect(rutasDe("test").gasto).toBe("datos/test/memoria/gasto.json");
    expect(rutasDe("test").salidas).toBe("datos/test/salidas");
  });

  it("ningún entorno comparte memoria, gasto, salidas ni archivo de llaves con otro", () => {
    for (const campo of ["memoria", "gasto", "salidas", "env"] as const) {
      const rutas = ENTORNOS.map((e) => rutasDe(e)[campo]);
      expect(new Set(rutas).size).toBe(ENTORNOS.length);
    }
  });

  it("los archivos de llaves son los que ya bloquea .claude/settings.json", () => {
    expect(ENTORNOS.map((e) => rutasDe(e).env)).toEqual([".env.development", ".env.test", ".env.production"]);
  });
});

describe("comandos de npm por entorno", () => {
  it("cada entorno sugiere su propio script", () => {
    expect(sufijoScript("development")).toBe("");
    expect(comandoNpm("oferta", "development")).toBe("npm run oferta");
    expect(comandoNpm("oferta", "test")).toBe("npm run oferta:test");
    expect(comandoNpm("oferta", "production")).toBe("npm run oferta:prod");
  });
});
