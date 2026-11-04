import { htmlATexto, type Oferta } from "./getonbrd.js";
import type { Fuente } from "./tipos.js";

/**
 * Ofertas remotas de Remotive por su API pública: https://remotive.com/api/remote-jobs
 * Documentación y condiciones: https://github.com/remotive-com/remote-jobs-api
 *
 * Condiciones que respeta este adaptador:
 * - Pide como máximo UNA vez por búsqueda (Remotive aconseja no más de 4 veces al día; más de 2 por minuto se bloquea).
 * - Cada oferta conserva el enlace a Remotive y el reporte nombra a Remotive como fuente.
 * - Las ofertas llegan con 24 horas de retraso (lo hace la propia API).
 * - Es para uso personal: no republiques estas ofertas en otros sitios.
 */
const API = "https://remotive.com/api/remote-jobs?category=software-dev";
const TIMEOUT_MS = 15_000;

interface ItemRemotive {
  id: number;
  url: string;
  title: string;
  company_name: string;
  job_type?: string;
  publication_date: string;
  /** Restricción geográfica: "Worldwide", "LATAM", "USA Only"... */
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

/**
 * Remotive no publica el nivel (junior, senior...): se deduce del título.
 * 1 Sin experiencia, 2 Junior, 3 Semi Senior, 4 Senior; 0 si el título no lo dice.
 */
export function nivelDesdeTitulo(titulo: string): number {
  if (/\b(?:sin experiencia|trainee|intern(?:ship)?|practicante|pasante|entry[\s-]?level)\b/i.test(titulo)) return 1;
  if (/\b(?:junior|jr\.?)\b/i.test(titulo)) return 2;
  if (/\b(?:semi[\s-]?senior|ssr|mid[\s-]?level|intermediate)\b/i.test(titulo)) return 3;
  if (/\b(?:senior|sr\.?|lead|staff|principal|head|architect|manager)\b/i.test(titulo)) return 4;
  return 0;
}

/**
 * Traduce «candidate_required_location» a la forma que entiende el prefiltro:
 * "Worldwide" → remoto de cualquier país; cualquier otra cosa → remoto solo desde esos países.
 * Si viene vacío no se sabe: queda como «Remoto local: verifica si acepta Colombia».
 */
export function ubicacionDeRemotive(texto: string | undefined): { modalidad: string; paises: string[] } {
  const limpio = (texto ?? "").trim();
  if (/\b(?:worldwide|anywhere|global)\b/i.test(limpio)) return { modalidad: "fully_remote", paises: [] };
  const paises = limpio.split(/[,;/]|\s+and\s+/i).map((p) => p.trim()).filter(Boolean);
  return { modalidad: "remote_local", paises };
}

/** Convierte una oferta de la API de Remotive al formato común. Devuelve null si le falta lo básico. */
export function aOfertaRemotive(item: ItemRemotive): Oferta | null {
  const publicada = new Date(item.publication_date);
  if (!item.id || !item.title || !item.url || Number.isNaN(publicada.getTime())) return null;
  const { modalidad, paises } = ubicacionDeRemotive(item.candidate_required_location);
  return {
    id: `remotive-${item.id}`,
    titulo: item.title,
    empresa: item.company_name || "sin nombre",
    nivel: nivelDesdeTitulo(item.title),
    modalidad,
    paises,
    ciudades: [],
    publicada,
    salario: item.salary?.trim() || null,
    url: item.url,
    texto: [item.title, htmlATexto(item.description)].filter(Boolean).join("\n\n"),
  };
}

/** Trae las ofertas de desarrollo de Remotive en una sola petición. */
export async function buscarEnRemotive(): Promise<Oferta[]> {
  let respuesta: Response;
  try {
    respuesta = await fetch(API, {
      headers: { "User-Agent": "analizador-ofertas (busqueda personal)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(`Remotive tardó más de ${TIMEOUT_MS / 1000} s en responder`);
    }
    throw error;
  }
  if (!respuesta.ok) throw new Error(`Remotive respondió ${respuesta.status}`);
  const json = (await respuesta.json()) as { jobs?: ItemRemotive[] };
  if (!Array.isArray(json.jobs)) throw new Error("Remotive devolvió una respuesta con formato inesperado");
  return json.jobs.map(aOfertaRemotive).filter((o): o is Oferta => o !== null);
}

export const fuenteRemotive: Fuente = {
  nombre: "remotive",
  etiqueta: "Remotive",
  // Trae todas las de desarrollo en una sola petición; el prefiltro hace el resto.
  buscar: () => buscarEnRemotive(),
  atribucion:
    "Ofertas de [Remotive](https://remotive.com): cada enlace lleva a la publicación original. " +
    "Remotive las muestra con 24 horas de retraso y no publica el nivel, así que se deduce del título.",
};
