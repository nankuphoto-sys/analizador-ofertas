import { describe, expect, it } from "vitest";
import { celda, nombreReporte } from "../src/reporte.js";

describe("celda", () => {
  it("escapa lo que rompe una tabla o un enlace markdown", () => {
    expect(celda("Dev | Remoto [LATAM]")).toBe("Dev \\| Remoto \\[LATAM\\]");
  });

  it("deja el texto normal igual y une saltos de línea", () => {
    expect(celda("Desarrollador Full Stack")).toBe("Desarrollador Full Stack");
    expect(celda("Línea uno\n  línea dos")).toBe("Línea uno línea dos");
  });
});

describe("nombreReporte", () => {
  it("incluye fecha y hora local para no pisar reportes del mismo día", () => {
    expect(nombreReporte(new Date(2026, 10, 3, 9, 5))).toBe("busqueda-2026-11-03-0905.md");
    expect(nombreReporte(new Date(2026, 10, 3, 18, 40))).not.toBe(nombreReporte(new Date(2026, 10, 3, 9, 5)));
  });
});
