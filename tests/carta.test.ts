import { describe, expect, it } from "vitest";
import { revisarCarta } from "../src/carta.js";

const HV = `Laura Gómez Ruiz
Desarrolladora Frontend · React · TypeScript
- Construí el catálogo de Tiendas Aurora con React y TypeScript.
- Apoyé la integración de pagos con Mercado Pago.
Inglés intermedio (B1)`;

describe("regla: nunca afirmar algo que la hoja de vida no prueba (cartas)", () => {
  it("acepta las citas que están en la hoja de vida y quita las marcas", () => {
    const carta = `## Carta
Construí un catálogo completo [[Construí el catálogo de Tiendas Aurora con React]] y apoyé pagos [[integración de pagos con Mercado Pago]].`;
    const r = revisarCarta(carta, HV);
    expect(r.faltantes).toEqual([]);
    expect(r.verificadas).toHaveLength(2);
    expect(r.limpia).toBe("## Carta\nConstruí un catálogo completo y apoyé pagos.");
  });

  it("detecta una cita inventada", () => {
    const r = revisarCarta("Tengo experiencia en AWS [[3 años desplegando en AWS]].", HV);
    expect(r.faltantes).toEqual(["3 años desplegando en AWS"]);
  });

  it("señala frases con cifras o tecnologías que no traen cita", () => {
    const r = revisarCarta("Tengo 4 años de experiencia. Manejo Docker a diario. Me encanta aprender.", HV);
    expect(r.sinCita).toEqual(["Tengo 4 años de experiencia.", "Manejo Docker a diario."]);
  });

  it("varias frases seguidas con cita no confunden la detección", () => {
    const carta = "Uso React [[React · TypeScript]]. Uso TypeScript [[React · TypeScript]]. Uso React otra vez [[React · TypeScript]].";
    expect(revisarCarta(carta, HV).sinCita).toEqual([]);
  });

  it("no revisa la sección de dudas, que habla de lo que falta", () => {
    const carta = "## Carta\nHola [[Desarrolladora Frontend]].\n\n## Dudas antes de enviar\n- La oferta pide 3 años con Node.js y no aparecen.";
    const r = revisarCarta(carta, HV);
    expect(r.sinCita).toEqual([]);
    expect(r.faltantes).toEqual([]);
  });
});
