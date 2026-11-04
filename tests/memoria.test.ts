import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Resultado } from "../src/esquema.js";
import {
  cambiarEstado,
  cargarMemoria,
  claveCache,
  esNueva,
  estaCerrada,
  guardarEnCache,
  guardarMemoria,
  huella,
  leerCache,
  memoriaVacia,
  olvidar,
  purgarCache,
  registrarVistas,
  usarHojaDeVida,
} from "../src/memoria.js";

const ahora = new Date("2026-11-04T12:00:00Z");
const resultado: Resultado = {
  cargo: "Desarrollador Full Stack",
  empresa: "Ejemplo",
  requisitos: [{ requisito: "React", tipo: "obligatorio", estado: "cumple", evidencia: "React y TypeScript" }],
  palabras_clave_faltantes: [],
  que_destacar: ["Destaca el catálogo en React"],
  advertencias: [],
  encaje: 100,
  evidencias_rechazadas: [],
};
const vigentes = { huellaHojaDeVida: "hv1", versionPrompt: "p1", modelo: "m1" };
const oferta = { id: "o1", titulo: "Dev", empresa: "Ejemplo" };

describe("huella y clave de caché", () => {
  it("la huella identifica el contenido sin guardarlo", () => {
    expect(huella("hoja de vida")).toBe(huella("hoja de vida"));
    expect(huella("hoja de vida")).not.toBe(huella("hoja de vida v2"));
    expect(huella("hoja de vida")).not.toContain("hoja");
  });

  it("la clave cambia si cambia la hoja de vida, el prompt o el modelo", () => {
    const base = claveCache({ ofertaId: "o1", ...vigentes });
    expect(claveCache({ ofertaId: "o1", ...vigentes, huellaHojaDeVida: "hv2" })).not.toBe(base);
    expect(claveCache({ ofertaId: "o1", ...vigentes, versionPrompt: "p2" })).not.toBe(base);
    expect(claveCache({ ofertaId: "o1", ...vigentes, modelo: "m2" })).not.toBe(base);
  });
});

describe("hoja de vida en uso", () => {
  it("guarda la huella, no el texto, y avisa cuando cambia", () => {
    const primera = usarHojaDeVida(memoriaVacia(), "cv.pdf", "React, TypeScript", ahora);
    expect(primera.cambio).toBe(false);
    expect(JSON.stringify(primera.memoria)).not.toContain("TypeScript");
    expect(usarHojaDeVida(primera.memoria, "cv.pdf", "React, TypeScript", ahora).cambio).toBe(false);
    expect(usarHojaDeVida(primera.memoria, "cv.pdf", "React, TypeScript, Docker", ahora).cambio).toBe(true);
  });
});

describe("historial de ofertas", () => {
  it("marca como vistas las nuevas sin pisar una decisión anterior", () => {
    let m = registrarVistas(memoriaVacia(), [oferta], ahora);
    expect(esNueva(m, "o1")).toBe(false);
    m = cambiarEstado(m, "o1", "postulada", ahora);
    m = registrarVistas(m, [oferta, { id: "o2", titulo: "Dev 2", empresa: "Otra" }], ahora);
    expect(m.ofertas.o1.estado).toBe("postulada");
    expect(m.ofertas.o2.estado).toBe("vista");
  });

  it("solo las postuladas y descartadas quedan cerradas", () => {
    let m = registrarVistas(memoriaVacia(), [oferta], ahora);
    expect(estaCerrada(m, "o1")).toBe(false);
    expect(estaCerrada(cambiarEstado(m, "o1", "guardada", ahora), "o1")).toBe(false);
    expect(estaCerrada(cambiarEstado(m, "o1", "descartada", ahora, "no es remoto"), "o1")).toBe(true);
    m = cambiarEstado(m, "o1", "descartada", ahora, "no es remoto");
    expect(m.ofertas.o1.motivo).toBe("no es remoto");
    expect(cambiarEstado(m, "o1", "vista", ahora).ofertas.o1.motivo).toBeUndefined();
  });

  it("no deja cambiar el estado de una oferta que no está en el historial", () => {
    expect(() => cambiarEstado(memoriaVacia(), "no-existe", "postulada", ahora)).toThrow(/no está en el historial/);
  });
});

describe("caché de análisis", () => {
  const clave = claveCache({ ofertaId: "o1", ...vigentes });
  const conCache = guardarEnCache(memoriaVacia(), clave, { ofertaId: "o1", publicada: new Date("2026-11-01"), resultado }, ahora);

  it("reutiliza un análisis solo con la misma clave", () => {
    expect(leerCache(conCache, clave)?.encaje).toBe(100);
    expect(leerCache(conCache, claveCache({ ofertaId: "o1", ...vigentes, versionPrompt: "p2" }))).toBeUndefined();
  });

  it("borra los de ofertas viejas y los que ya no corresponden a la hoja de vida o el prompt actuales", () => {
    const vieja = guardarEnCache(conCache, claveCache({ ofertaId: "o2", ...vigentes }), { ofertaId: "o2", publicada: new Date("2026-07-01"), resultado }, ahora);
    const otraHv = guardarEnCache(vieja, claveCache({ ofertaId: "o3", ...vigentes, huellaHojaDeVida: "hv0" }), { ofertaId: "o3", publicada: new Date("2026-11-01"), resultado }, ahora);
    expect(Object.values(purgarCache(otraHv, ahora, vigentes).cache).map((e) => e.ofertaId)).toEqual(["o1"]);
  });

  it("olvidar una oferta la quita del historial y de la caché", () => {
    const m = olvidar(registrarVistas(conCache, [oferta], ahora), { ofertaId: "o1" });
    expect(m.ofertas.o1).toBeUndefined();
    expect(Object.keys(m.cache)).toHaveLength(0);
  });
});

describe("archivo de memoria", () => {
  let carpeta: string;
  beforeEach(async () => {
    carpeta = await mkdtemp(join(tmpdir(), "memoria-"));
  });
  afterEach(async () => {
    await rm(carpeta, { recursive: true, force: true });
  });

  it("sin archivo empieza vacía; guarda y vuelve a cargar lo mismo", async () => {
    const ruta = join(carpeta, "sub", "memoria.json");
    expect((await cargarMemoria(ruta)).memoria).toEqual(memoriaVacia());
    const m = guardarEnCache(registrarVistas(memoriaVacia(), [oferta], ahora), "k", { ofertaId: "o1", publicada: ahora, resultado }, ahora);
    await guardarMemoria(m, ruta);
    expect((await cargarMemoria(ruta)).memoria).toEqual(m);
  });

  it("si el archivo está corrupto avisa, sigue sin memoria y no permite sobrescribirlo", async () => {
    const ruta = join(carpeta, "memoria.json");
    await writeFile(ruta, "{ esto no es json");
    const cargada = await cargarMemoria(ruta);
    expect(cargada.escribible).toBe(false);
    expect(cargada.aviso).toMatch(/no lo modifica/);
    expect(await readFile(ruta, "utf8")).toBe("{ esto no es json");
  });
});
