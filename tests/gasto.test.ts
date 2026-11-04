import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analizarConPresupuesto } from "../src/agente.js";
import {
  cargarRegistro,
  COSTO_INICIAL_ESTIMADO,
  costoUsd,
  guardarRegistro,
  leerLimites,
  PresupuestoAgotado,
  registrarGasto,
  revisarPresupuesto,
  usoDeMensajes,
  type Registro,
} from "../src/gasto.js";

const hoy = new Date(2026, 10, 4, 10, 0);
const vacio = (): Registro => ({ version: 1, dias: {} });
const carpeta = () => mkdtemp(join(tmpdir(), "gasto-"));

describe("costoUsd", () => {
  it("cobra entrada y salida al precio de Sonnet 5.5", () => {
    expect(costoUsd({ entrada: 1_000_000, salida: 100_000, lecturaCache: 0, escrituraCache: 0 }, "claude-sonnet-5-5")).toBe(3);
  });

  it("no cobra dos veces los tokens de caché (LangChain ya los suma a la entrada)", () => {
    const uso = { entrada: 1_000_000, salida: 0, lecturaCache: 1_000_000, escrituraCache: 0 };
    expect(costoUsd(uso, "claude-sonnet-5-5")).toBe(0.2);
  });

  it("un modelo desconocido se cobra como el más caro: mejor sobrestimar", () => {
    const uso = { entrada: 1_000_000, salida: 0, lecturaCache: 0, escrituraCache: 0 };
    expect(costoUsd(uso, "modelo-nuevo")).toBeGreaterThan(costoUsd(uso, "claude-opus-5-5"));
  });
});

describe("usoDeMensajes", () => {
  it("suma el uso de todas las vueltas del agente e ignora los mensajes sin uso", () => {
    const uso = usoDeMensajes([
      { usage_metadata: { input_tokens: 100, output_tokens: 10, input_token_details: { cache_read: 40 } } },
      { content: "resultado de la herramienta" },
      { usage_metadata: { input_tokens: 200, output_tokens: 20 } },
    ]);
    expect(uso).toEqual({ entrada: 300, salida: 30, lecturaCache: 40, escrituraCache: 0 });
  });
});

describe("leerLimites", () => {
  it("usa los valores por defecto si no hay nada en .env", () => {
    expect(leerLimites({})).toEqual({ dia: 2, mes: 20 });
  });

  it("lee los de .env y rechaza un valor inválido en vez de quedar sin límite", () => {
    expect(leerLimites({ LIMITE_USD_DIA: "0.5", LIMITE_USD_MES: "5" })).toEqual({ dia: 0.5, mes: 5 });
    expect(() => leerLimites({ LIMITE_USD_DIA: "mucho" })).toThrow(/LIMITE_USD_DIA/);
    expect(() => leerLimites({ LIMITE_USD_MES: "-1" })).toThrow(/LIMITE_USD_MES/);
  });
});

describe("revisarPresupuesto", () => {
  const limites = { dia: 1, mes: 3 };

  it("sin historial reserva el costo estimado inicial", () => {
    const e = revisarPresupuesto(vacio(), limites, hoy);
    expect(e).toMatchObject({ hoy: 0, mes: 0, estimado: COSTO_INICIAL_ESTIMADO, permitido: true });
  });

  it("frena antes de pasarse: si lo gastado hoy más un análisis promedio supera el límite", () => {
    let r = vacio();
    for (let i = 0; i < 9; i++) r = registrarGasto(r, 0.1, hoy); // 0,90 en 9 análisis → promedio 0,10
    expect(revisarPresupuesto(r, limites, hoy).permitido).toBe(true); // 0,90 + 0,10 = 1,00, no pasa
    r = registrarGasto(r, 0.05, hoy);
    const e = revisarPresupuesto(r, limites, hoy);
    expect(e.permitido).toBe(false);
    expect(e.motivo).toMatch(/límite diario/);
  });

  it("al día siguiente el diario vuelve a cero, pero cuenta para el mes", () => {
    let r = vacio();
    for (const dia of [1, 2, 3]) r = registrarGasto(r, 0.95, new Date(2026, 10, dia, 9));
    const e = revisarPresupuesto(r, limites, hoy);
    expect(e.hoy).toBe(0);
    expect(e.permitido).toBe(false);
    expect(e.motivo).toMatch(/límite mensual/);
  });

  it("el gasto de otro mes no cuenta para este", () => {
    let r = vacio();
    for (let i = 0; i < 29; i++) r = registrarGasto(r, 0.1, new Date(2026, 9, 30, 9)); // 2,90 en octubre
    expect(revisarPresupuesto(r, limites, hoy)).toMatchObject({ mes: 0, permitido: true });
  });
});

describe("registro en disco", () => {
  it("guarda y vuelve a leer; si no existe empieza vacío", async () => {
    const ruta = join(await carpeta(), "sub", "gasto.json");
    expect(await cargarRegistro(ruta)).toEqual(vacio());
    await guardarRegistro(registrarGasto(vacio(), 0.12, hoy), ruta);
    expect((await cargarRegistro(ruta)).dias["2026-11-04"]).toEqual({ usd: 0.12, analisis: 1 });
  });

  it("si el registro está dañado se detiene: nunca asume que no se ha gastado nada", async () => {
    const ruta = join(await carpeta(), "gasto.json");
    await writeFile(ruta, JSON.stringify({ version: 1, dias: { hoy: "mucho" } }));
    await expect(cargarRegistro(ruta)).rejects.toThrow(/dañado/);
  });
});

describe("analizarConPresupuesto", () => {
  it("sin presupuesto no llama al modelo y no anota gasto", async () => {
    const ruta = join(await carpeta(), "gasto.json");
    let r = vacio();
    for (let i = 0; i < 20; i++) r = registrarGasto(r, 0.1, new Date()); // 2,00 hoy: el límite diario por defecto
    await guardarRegistro(r, ruta);
    const antes = await readFile(ruta, "utf8");
    const texto = "x".repeat(100);
    await expect(analizarConPresupuesto(texto, texto, ruta)).rejects.toBeInstanceOf(PresupuestoAgotado);
    expect(await readFile(ruta, "utf8")).toBe(antes);
  });
});
