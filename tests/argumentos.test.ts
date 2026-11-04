import { describe, expect, it } from "vitest";
import { enteroEnRango, opcionEntera } from "../src/argumentos.js";

describe("opcionEntera", () => {
  it("usa el valor por defecto si la opción no viene", () => {
    expect(opcionEntera(["cv.pdf"], "dias", 30)).toBe(30);
  });

  it("lee enteros válidos, incluido 0", () => {
    expect(opcionEntera(["cv.pdf", "--dias=60"], "dias", 30)).toBe(60);
    expect(opcionEntera(["--analizar=0"], "analizar", 5)).toBe(0);
  });

  it("no confunde una opción con otra que empieza igual", () => {
    expect(opcionEntera(["--diasx=3"], "dias", 30)).toBe(30);
  });

  it.each(["abc", "", "-1", "2.5", " "])("rechaza '%s' en vez de devolver NaN", (valor) => {
    expect(() => opcionEntera([`--dias=${valor}`], "dias", 30)).toThrow(/--dias debe ser un número entero/);
  });
});

describe("opcionEntera con máximo", () => {
  it("rechaza un valor por encima del máximo y dice el rango aceptado", () => {
    expect(opcionEntera(["--analizar=25"], "analizar", 5, 25)).toBe(25);
    expect(() => opcionEntera(["--analizar=500"], "analizar", 5, 25)).toThrow(/entre 0 y 25/);
  });
});

describe("enteroEnRango", () => {
  it("acepta enteros dentro del rango y rechaza el resto", () => {
    expect(enteroEnRango("3", "Las repeticiones", 1, 5)).toBe(3);
    expect(() => enteroEnRango("0", "Las repeticiones", 1, 5)).toThrow(/entre 1 y 5/);
    expect(() => enteroEnRango("100", "Las repeticiones", 1, 5)).toThrow(/entre 1 y 5/);
    expect(() => enteroEnRango("tres", "Las repeticiones", 1, 5)).toThrow(/recibí "tres"/);
  });
});
