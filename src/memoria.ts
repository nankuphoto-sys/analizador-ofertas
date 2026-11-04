/**
 * Memoria entre sesiones: historial de ofertas y caché de análisis. Diseño en docs/memoria.md.
 *
 * Reglas que este módulo hace cumplir:
 * - La escribe el código, nunca el modelo.
 * - Nunca guarda el texto de la hoja de vida: solo su huella, para saber si cambió.
 * - Un análisis guardado solo se reutiliza si la oferta, la hoja de vida, el prompt y el modelo son los mismos.
 * - Si el archivo está corrupto, no se sobrescribe: se avisa y se trabaja sin memoria.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import * as z from "zod";
import { AnalisisSchema, type Resultado } from "./esquema.js";

export const RUTA_MEMORIA = "memoria/memoria.json";
export const VERSION_FORMATO = 1;
/** Los análisis de ofertas publicadas hace más de esto se borran solos. */
export const DIAS_CACHE = 90;

export const ESTADOS_OFERTA = ["vista", "guardada", "postulada", "descartada"] as const;
export type EstadoOferta = (typeof ESTADOS_OFERTA)[number];
/** Estados que el usuario decidió: la oferta no vuelve a aparecer en las búsquedas. */
export const ESTADOS_CERRADOS: readonly EstadoOferta[] = ["postulada", "descartada"];

const ResultadoSchema = AnalisisSchema.extend({ encaje: z.number(), evidencias_rechazadas: z.array(z.string()) });

const OfertaVistaSchema = z.object({
  titulo: z.string(),
  empresa: z.string(),
  estado: z.enum(ESTADOS_OFERTA),
  vistaPorPrimeraVez: z.iso.datetime(),
  cambiadoEl: z.iso.datetime(),
  motivo: z.string().optional(),
});

const EntradaCacheSchema = z.object({
  ofertaId: z.string(),
  guardadoEl: z.iso.datetime(),
  /** Fecha de publicación de la oferta: decide cuándo vence la entrada. */
  publicada: z.iso.datetime(),
  resultado: ResultadoSchema,
});

export const MemoriaSchema = z.object({
  version: z.literal(VERSION_FORMATO),
  hojaDeVida: z.object({ ruta: z.string(), huella: z.string(), actualizadaEl: z.iso.datetime() }).nullable(),
  ofertas: z.record(z.string(), OfertaVistaSchema),
  cache: z.record(z.string(), EntradaCacheSchema),
});

export type Memoria = z.infer<typeof MemoriaSchema>;
export type OfertaVista = z.infer<typeof OfertaVistaSchema>;

export const memoriaVacia = (): Memoria => ({ version: VERSION_FORMATO, hojaDeVida: null, ofertas: {}, cache: {} });

/** Huella corta de un texto (SHA-256, 16 caracteres). Identifica el contenido sin guardarlo. */
export function huella(texto: string): string {
  return createHash("sha256").update(texto).digest("hex").slice(0, 16);
}

/** Clave de caché: cambia si cambia la oferta, la hoja de vida, el prompt o el modelo. */
export function claveCache(p: { ofertaId: string; huellaHojaDeVida: string; versionPrompt: string; modelo: string }): string {
  return [p.ofertaId, p.huellaHojaDeVida, p.versionPrompt, p.modelo].join("|");
}

// ---------- Archivo ----------

export interface MemoriaCargada {
  memoria: Memoria;
  /** false si el archivo existe pero no se pudo leer: en ese caso no se guarda, para no perderlo. */
  escribible: boolean;
  aviso?: string;
}

export async function cargarMemoria(ruta = RUTA_MEMORIA): Promise<MemoriaCargada> {
  let crudo: string;
  try {
    crudo = await readFile(ruta, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { memoria: memoriaVacia(), escribible: true };
    throw error;
  }
  try {
    return { memoria: MemoriaSchema.parse(JSON.parse(crudo)), escribible: true };
  } catch {
    return {
      memoria: memoriaVacia(),
      escribible: false,
      aviso: `No se pudo leer ${ruta} (formato inválido o de otra versión). Esta búsqueda sigue sin memoria y no lo modifica; revísalo o bórralo con "npm run olvidar -- --todo".`,
    };
  }
}

/** Guarda en un archivo temporal y lo renombra: si el proceso se corta a mitad, el archivo anterior queda intacto. */
export async function guardarMemoria(memoria: Memoria, ruta = RUTA_MEMORIA): Promise<void> {
  await mkdir(dirname(ruta), { recursive: true });
  const temporal = `${ruta}.tmp`;
  await writeFile(temporal, JSON.stringify(MemoriaSchema.parse(memoria), null, 2));
  await rename(temporal, ruta);
}

// ---------- Lógica (pura: recibe la memoria y devuelve una nueva) ----------

/** Registra la hoja de vida en uso. Devuelve si cambió respecto a la anterior. */
export function usarHojaDeVida(m: Memoria, ruta: string, texto: string, ahora: Date): { memoria: Memoria; cambio: boolean } {
  const h = huella(texto);
  const cambio = m.hojaDeVida !== null && m.hojaDeVida.huella !== h;
  if (m.hojaDeVida?.huella === h && m.hojaDeVida.ruta === ruta) return { memoria: m, cambio: false };
  return { memoria: { ...m, hojaDeVida: { ruta, huella: h, actualizadaEl: ahora.toISOString() } }, cambio };
}

/** ¿El usuario ya cerró esta oferta (se postuló o la descartó)? */
export const estaCerrada = (m: Memoria, ofertaId: string) => {
  const estado = m.ofertas[ofertaId]?.estado;
  return estado !== undefined && ESTADOS_CERRADOS.includes(estado);
};

/** Ofertas que nunca se habían mostrado. */
export const esNueva = (m: Memoria, ofertaId: string) => !(ofertaId in m.ofertas);

/** Marca como "vista" las ofertas que no estaban en el historial. No toca las que ya tienen un estado. */
export function registrarVistas(
  m: Memoria,
  ofertas: { id: string; titulo: string; empresa: string }[],
  ahora: Date,
): Memoria {
  const fecha = ahora.toISOString();
  const nuevas = Object.fromEntries(
    ofertas
      .filter((o) => esNueva(m, o.id))
      .map((o) => [o.id, { titulo: o.titulo, empresa: o.empresa, estado: "vista" as const, vistaPorPrimeraVez: fecha, cambiadoEl: fecha }]),
  );
  return { ...m, ofertas: { ...m.ofertas, ...nuevas } };
}

/** Cambia la decisión del usuario sobre una oferta. Solo la llama un comando del usuario, nunca el agente. */
export function cambiarEstado(m: Memoria, ofertaId: string, estado: EstadoOferta, ahora: Date, motivo?: string): Memoria {
  const actual = m.ofertas[ofertaId];
  if (!actual) throw new Error(`La oferta "${ofertaId}" no está en el historial. Corre una búsqueda primero o revisa el id.`);
  const fecha = ahora.toISOString();
  const { motivo: _anterior, ...resto } = actual;
  return { ...m, ofertas: { ...m.ofertas, [ofertaId]: { ...resto, estado, cambiadoEl: fecha, ...(motivo ? { motivo } : {}) } } };
}

export const leerCache = (m: Memoria, clave: string): Resultado | undefined => m.cache[clave]?.resultado;

export function guardarEnCache(
  m: Memoria,
  clave: string,
  entrada: { ofertaId: string; publicada: Date; resultado: Resultado },
  ahora: Date,
): Memoria {
  return {
    ...m,
    cache: {
      ...m.cache,
      [clave]: { ofertaId: entrada.ofertaId, guardadoEl: ahora.toISOString(), publicada: entrada.publicada.toISOString(), resultado: entrada.resultado },
    },
  };
}

/**
 * Borra los análisis vencidos: de ofertas publicadas hace más de DIAS_CACHE días, o que ya no
 * corresponden a la hoja de vida, el prompt o el modelo actuales (nunca se van a volver a usar).
 */
export function purgarCache(m: Memoria, ahora: Date, vigentes: { huellaHojaDeVida: string; versionPrompt: string; modelo: string }): Memoria {
  const limite = ahora.getTime() - DIAS_CACHE * 24 * 3600 * 1000;
  const cache = Object.fromEntries(
    Object.entries(m.cache).filter(
      ([clave, e]) =>
        new Date(e.publicada).getTime() >= limite &&
        clave === claveCache({ ofertaId: e.ofertaId, ...vigentes }),
    ),
  );
  return { ...m, cache };
}

/** Borrado explícito pedido por el usuario. */
export function olvidar(m: Memoria, que: { cache?: boolean; ofertaId?: string }): Memoria {
  let r = m;
  if (que.cache) r = { ...r, cache: {} };
  if (que.ofertaId) {
    const { [que.ofertaId]: _quitada, ...ofertas } = r.ofertas;
    const cache = Object.fromEntries(Object.entries(r.cache).filter(([, e]) => e.ofertaId !== que.ofertaId));
    r = { ...r, ofertas, cache };
  }
  return r;
}
