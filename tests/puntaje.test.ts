import { describe, expect, it } from "vitest";
import type { Requisito } from "../src/esquema.js";
import { encontrarRequisito, puntuar, type Verificacion } from "../src/puntaje.js";

const req = (requisito: string, estado: Requisito["estado"]): Requisito => ({
  requisito,
  tipo: "obligatorio",
  estado,
  evidencia: "",
});

describe("encontrarRequisito", () => {
  it("respeta los términos excluidos", () => {
    const requisitos = [req("React Native", "no_cumple"), req("2+ años con React", "cumple")];
    const v: Verificacion = { nombre: "React", buscar: ["react"], excluir: ["native"], aceptables: ["cumple"] };
    expect(encontrarRequisito(requisitos, v)?.requisito).toBe("2+ años con React");
  });

  it("encuentra por inicio de palabra", () => {
    const v: Verificacion = { nombre: "Prototipos", buscar: ["prototip"], aceptables: ["no_cumple"] };
    expect(encontrarRequisito([req("Prototipado de alta fidelidad", "no_cumple")], v)).toBeDefined();
  });
});

describe("puntuar", () => {
  it("cuenta aciertos, invenciones y requisitos no detectados", () => {
    const p = puntuar(
      [req("Python avanzado", "cumple"), req("React", "cumple"), req("Inglés C1", "parcial")],
      [
        { nombre: "Python", buscar: ["python"], aceptables: ["no_cumple"] },
        { nombre: "React", buscar: ["react"], aceptables: ["cumple"] },
        { nombre: "Inglés", buscar: ["ingles"], aceptables: ["parcial", "no_cumple"] },
        { nombre: "Docker", buscar: ["docker"], aceptables: ["no_cumple"] },
      ],
    );
    expect(p).toMatchObject({ total: 4, aciertos: 2, invenciones: 1, noDetectados: 1 });
    expect(p.errores).toHaveLength(2);
  });
});
