import { describe, expect, it } from "vitest";
import { opcionEntera } from "../src/argumentos.js";

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
