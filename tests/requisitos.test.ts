import { describe, expect, it } from "vitest";
import type { Oferta } from "../src/fuentes/getonbrd.js";
import { aplicarFiltro, estaEnIngles, requisitosDe } from "../src/requisitos.js";

const oferta = (texto: string, extra: Partial<Oferta> = {}): Oferta => ({
  id: "x",
  titulo: "Desarrollador Full Stack",
  empresa: "Ejemplo",
  nivel: 2,
  modalidad: "fully_remote",
  paises: [],
  ciudades: [],
  publicada: new Date("2026-11-01T00:00:00Z"),
  salario: null,
  url: "https://ejemplo",
  texto,
  ...extra,
});
const ingles = (texto: string) => requisitosDe(oferta(texto)).ingles;
const pago = (texto: string, salario: string | null = null) => requisitosDe(oferta(texto, { salario })).pago;

describe("inglés", () => {
  it("lo detecta cuando lo piden", () => {
    expect(ingles("Requisitos: React y Node. Inglés avanzado.")).toBe("requerido");
    expect(ingles("Fluent English required for daily communication.")).toBe("requerido");
    expect(ingles("Nivel de inglés B2 o superior.")).toBe("requerido");
    expect(ingles("Se requiere inglés conversacional.")).toBe("requerido");
  });

  it("distingue deseable y «no hace falta»", () => {
    expect(ingles("React y Node. Inglés deseable.")).toBe("deseable");
    expect(ingles("Se valora inglés técnico.")).toBe("deseable");
    expect(ingles("English is a plus.")).toBe("deseable");
    expect(ingles("No se requiere inglés para este cargo.")).toBe("no_requerido");
    expect(ingles("Sin inglés: todo el equipo habla español.")).toBe("no_requerido");
    expect(ingles("No se pide inglés.")).toBe("no_requerido");
    expect(ingles("English is not required.")).toBe("no_requerido");
  });

  it("si hay una frase que lo pide y otra que lo hace deseable, manda la que lo pide", () => {
    expect(ingles("Inglés deseable para la documentación. Inglés avanzado para hablar con el cliente.")).toBe("requerido");
  });

  it("sin mención: español → no lo dice; escrita en inglés → implícito", () => {
    expect(ingles("Buscamos desarrollador con experiencia en React y Node para nuestro equipo de producto en Bogotá.")).toBe("no_mencionado");
    expect(
      ingles("We are looking for a developer with experience in React and Node to join our team. You will work with the product team and build features for our customers."),
    ).toBe("implicito");
  });

  it("estaEnIngles no se confunde con una oferta en español que cita términos técnicos", () => {
    expect(estaEnIngles("Buscamos un desarrollador con experiencia en React, Node.js y pull requests para el equipo.")).toBe(false);
  });
});

describe("pago en dólares", () => {
  it("reconoce USD en el salario o en el texto", () => {
    expect(pago("", "3000–4000 USD/mes")).toBe("usd");
    expect(pago("", "$30,000 - $40,000")).toBe("usd");
    expect(pago("The salary range is $1,500 - $4,000 per month (Gross in USD)")).toBe("usd");
    expect(pago("Pagamos en dólares, de forma mensual.")).toBe("usd");
  });

  it("reconoce pesos colombianos, y si aparecen los dos gana USD", () => {
    expect(pago("Salario: $3.500.000 COP")).toBe("cop");
    expect(pago("Salario: 4 millones de pesos")).toBe("cop");
    expect(pago("Salario en COP o su equivalente en USD")).toBe("usd");
  });

  it("sin datos, desconocido", () => {
    expect(pago("Salario competitivo y buen ambiente.")).toBe("desconocido");
  });
});

describe("aplicarFiltro", () => {
  const ofertas = [
    oferta("React. Inglés avanzado.", { id: "pide-ingles", salario: "2000 USD" }),
    oferta("React y Node. Inglés deseable.", { id: "deseable-usd", salario: "2000 USD" }),
    oferta("React y Node para nuestro equipo en Bogotá, con experiencia y trabajo en la nube.", { id: "espanol-sin-pago" }),
    oferta("We are looking for a developer with experience in React to join our team. You will work with our product team and build features for our customers.", { id: "en-ingles", salario: "$30,000" }),
  ];
  const ids = (r: { aceptadas: Oferta[] }) => r.aceptadas.map((o) => o.id);

  it("sin filtros deja todo", () => {
    expect(ids(aplicarFiltro(ofertas, {}))).toHaveLength(4);
  });

  it("--sin-ingles saca las que lo piden; estricto también las escritas en inglés", () => {
    expect(ids(aplicarFiltro(ofertas, { sinIngles: "explicito" }))).toEqual(["deseable-usd", "espanol-sin-pago", "en-ingles"]);
    const estricto = aplicarFiltro(ofertas, { sinIngles: "estricto" });
    expect(ids(estricto)).toEqual(["deseable-usd", "espanol-sin-pago"]);
    expect(estricto.porIngles).toBe(2);
  });

  it("--en-dolares deja solo las que lo dicen", () => {
    const r = aplicarFiltro(ofertas, { soloUsd: true });
    expect(ids(r)).toEqual(["pide-ingles", "deseable-usd", "en-ingles"]);
    expect(r.porPago).toBe(1);
  });

  it("una oferta repetida (sale en varias búsquedas) cuenta una sola vez", () => {
    const repetida = oferta("React. Inglés avanzado.", { id: "igual" });
    const r = aplicarFiltro([repetida, repetida, repetida], { sinIngles: "explicito" });
    expect(r.porIngles).toBe(1);
    expect(aplicarFiltro([repetida, repetida], {}).aceptadas).toHaveLength(1);
  });

  it("combinados: sin inglés y en dólares", () => {
    expect(ids(aplicarFiltro(ofertas, { sinIngles: "estricto", soloUsd: true }))).toEqual(["deseable-usd"]);
  });
});
