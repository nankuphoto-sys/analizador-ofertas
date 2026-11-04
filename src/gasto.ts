import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import * as z from "zod";

/**
 * Límite de gasto en la API de Anthropic (ver docs/limite-de-gasto.md).
 *
 * Cada análisis suma lo que costó a un registro local por día (memoria/gasto.json). Antes de cada análisis
 * se revisa que el gasto de hoy y del mes, más lo que suele costar un análisis, no pase el límite.
 * Es una protección del proyecto: el tope real e infalible es el límite de gasto de la consola de Anthropic.
 */
export const RUTA_GASTO = "memoria/gasto.json";

/** Dólares por millón de tokens (tabla de precios de Anthropic, octubre 2026). Escritura en caché = 1,25 × entrada. */
export const PRECIOS: Record<string, { entrada: number; salida: number; lecturaCache: number }> = {
  "claude-sonnet-5-5": { entrada: 2, salida: 10, lecturaCache: 0.2 },
  "claude-opus-5-5": { entrada: 4, salida: 20, lecturaCache: 0.2 },
  "claude-haiku-5-5": { entrada: 0.1, salida: 0.5, lecturaCache: 0.01 },
};
/** Para un modelo que no está en la tabla se cobra como el más caro que existe: mejor sobrestimar que pasarse. */
const PRECIO_DESCONOCIDO = { entrada: 10, salida: 50, lecturaCache: 1 };

/** Lo que cuesta un análisis cuando todavía no hay historial para promediar. */
export const COSTO_INICIAL_ESTIMADO = 0.15;

export const LIMITES_POR_DEFECTO = { dia: 2, mes: 20 };

export interface Uso {
  /** Tokens de entrada totales, incluidos los de caché (así los cuenta LangChain). */
  entrada: number;
  salida: number;
  lecturaCache: number;
  escrituraCache: number;
}

/** Suma el uso de todas las respuestas del modelo en un análisis (una por cada vuelta del agente). */
export function usoDeMensajes(mensajes: readonly object[]): Uso {
  const uso: Uso = { entrada: 0, salida: 0, lecturaCache: 0, escrituraCache: 0 };
  for (const m of mensajes) {
    const u = (m as { usage_metadata?: unknown }).usage_metadata as
      | { input_tokens?: number; output_tokens?: number; input_token_details?: { cache_read?: number; cache_creation?: number } }
      | undefined;
    if (!u) continue;
    uso.entrada += u.input_tokens ?? 0;
    uso.salida += u.output_tokens ?? 0;
    uso.lecturaCache += u.input_token_details?.cache_read ?? 0;
    uso.escrituraCache += u.input_token_details?.cache_creation ?? 0;
  }
  return uso;
}

export function costoUsd(uso: Uso, modelo: string): number {
  const p = PRECIOS[modelo] ?? PRECIO_DESCONOCIDO;
  const sinCache = Math.max(0, uso.entrada - uso.lecturaCache - uso.escrituraCache);
  const usd =
    (sinCache * p.entrada + uso.escrituraCache * p.entrada * 1.25 + uso.lecturaCache * p.lecturaCache + uso.salida * p.salida) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Límites en dólares desde .env (LIMITE_USD_DIA, LIMITE_USD_MES). Un valor inválido es un error, no un "sin límite". */
export function leerLimites(env: Record<string, string | undefined> = process.env): { dia: number; mes: number } {
  const leer = (nombre: string, porDefecto: number) => {
    const crudo = env[nombre];
    if (crudo === undefined || crudo.trim() === "") return porDefecto;
    const valor = Number(crudo);
    if (!Number.isFinite(valor) || valor < 0) throw new Error(`${nombre} debe ser un número de dólares mayor o igual a 0 (recibí "${crudo}").`);
    return valor;
  };
  return { dia: leer("LIMITE_USD_DIA", LIMITES_POR_DEFECTO.dia), mes: leer("LIMITE_USD_MES", LIMITES_POR_DEFECTO.mes) };
}

const DiaSchema = z.object({ usd: z.number().nonnegative(), analisis: z.number().int().nonnegative() });
/** Cuántos análisis recientes se miran para reservar el más caro. */
export const ANALISIS_RECIENTES = 10;
const RegistroSchema = z.object({
  version: z.literal(1),
  dias: z.record(z.string(), DiaSchema),
  /** Costo de los últimos análisis, del más viejo al más nuevo. Opcional: los registros anteriores no lo tenían. */
  recientes: z.array(z.number().nonnegative()).default([]),
});
export type Registro = z.infer<typeof RegistroSchema>;

const registroVacio = (): Registro => ({ version: 1, dias: {}, recientes: [] });
/** Fecha local AAAA-MM-DD: el día del límite es el del usuario, no el de UTC. */
const diaDe = (fecha: Date) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;

export async function cargarRegistro(ruta = RUTA_GASTO): Promise<Registro> {
  let texto: string;
  try {
    texto = await readFile(ruta, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return registroVacio();
    throw error;
  }
  const leido = RegistroSchema.safeParse(JSON.parse(texto));
  // Si el registro está dañado no se asume gasto cero: se detiene hasta que el usuario lo revise.
  if (!leido.success) throw new Error(`El registro de gasto ${ruta} está dañado. Revísalo o bórralo a mano para empezar de cero.`);
  return leido.data;
}

export async function guardarRegistro(registro: Registro, ruta = RUTA_GASTO): Promise<void> {
  await mkdir(dirname(ruta), { recursive: true });
  const temporal = `${ruta}.tmp`;
  await writeFile(temporal, JSON.stringify(RegistroSchema.parse(registro), null, 2));
  await rename(temporal, ruta);
}

export function registrarGasto(registro: Registro, usd: number, ahora = new Date()): Registro {
  const dia = diaDe(ahora);
  const previo = registro.dias[dia] ?? { usd: 0, analisis: 0 };
  return {
    ...registro,
    dias: { ...registro.dias, [dia]: { usd: previo.usd + usd, analisis: previo.analisis + 1 } },
    recientes: [...(registro.recientes ?? []), usd].slice(-ANALISIS_RECIENTES),
  };
}

export interface Estado {
  hoy: number;
  mes: number;
  /** Lo que se reserva para el próximo análisis: el mayor entre el promedio y el más caro de los recientes. */
  estimado: number;
  permitido: boolean;
  motivo?: string;
}

/** ¿Se puede hacer otro análisis sin pasarse? Se reserva lo que suele costar uno, no se espera a pasarse para frenar. */
export function revisarPresupuesto(registro: Registro, limites: { dia: number; mes: number }, ahora = new Date()): Estado {
  const hoyClave = diaDe(ahora);
  const mesClave = hoyClave.slice(0, 7);
  const dias = Object.entries(registro.dias);
  const hoy = registro.dias[hoyClave]?.usd ?? 0;
  const mes = dias.filter(([d]) => d.startsWith(mesClave)).reduce((s, [, v]) => s + v.usd, 0);
  const total = dias.reduce((s, [, v]) => ({ usd: s.usd + v.usd, n: s.n + v.analisis }), { usd: 0, n: 0 });
  // Se reserva lo más caro entre el promedio y el análisis más caro de los recientes: una oferta larga
  // cuesta el doble que una corta, y reservar solo el promedio dejaba pasarse del límite.
  const promedio = total.n > 0 ? total.usd / total.n : COSTO_INICIAL_ESTIMADO;
  const estimado = Math.max(promedio, ...(registro.recientes ?? []));
  const dolares = (x: number) => `US$ ${x.toFixed(2)}`;
  if (hoy + estimado > limites.dia) {
    return { hoy, mes, estimado, permitido: false, motivo: `límite diario: llevas ${dolares(hoy)} de ${dolares(limites.dia)} hoy y un análisis cuesta unos ${dolares(estimado)}` };
  }
  if (mes + estimado > limites.mes) {
    return { hoy, mes, estimado, permitido: false, motivo: `límite mensual: llevas ${dolares(mes)} de ${dolares(limites.mes)} este mes y un análisis cuesta unos ${dolares(estimado)}` };
  }
  return { hoy, mes, estimado, permitido: true };
}

export class PresupuestoAgotado extends Error {
  constructor(motivo: string) {
    super(`Se alcanzó el ${motivo}. Para subirlo, cambia LIMITE_USD_DIA o LIMITE_USD_MES en .env.`);
    this.name = "PresupuestoAgotado";
  }
}
