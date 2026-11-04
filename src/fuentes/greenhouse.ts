import { readFile } from "node:fs/promises";
import { htmlATexto, type Oferta } from "./getonbrd.js";
import { nivelDesdeTitulo } from "./remotive.js";
import type { Fuente } from "./tipos.js";

/**
 * Vacantes de empresas que publican en Greenhouse, por su API pública de tableros:
 * https://developers.greenhouse.io/job-board.html  (GET /v1/boards/<token>/jobs?content=true)
 * No lleva llave ni login. Una petición por empresa; las empresas se listan en `greenhouse-empresas.json`.
 *
 * Cada empresa tiene un «token»: el nombre al final de su página de empleo (job-boards.greenhouse.io/<token>).
 */
export const RUTA_EMPRESAS = "greenhouse-empresas.json";
const API = "https://boards-api.greenhouse.io/v1/boards";
const TIMEOUT_MS = 15_000;
const TOKEN_VALIDO = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

interface ItemGreenhouse {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string } | string | null;
  first_published?: string;
  updated_at?: string;
  company_name?: string;
  /** HTML con las etiquetas escapadas (&lt;p&gt;), solo si se pide `content=true`. */
  content?: string;
}

/** La API entrega el HTML escapado: primero se desescapa y luego se limpia. */
export function contenidoATexto(contenido: string | undefined): string {
  if (!contenido) return "";
  const html = contenido
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  return htmlATexto(html);
}

/**
 * Traduce el texto libre de ubicación («Remote - Colombia», «Bogota, Colombia», «Remote - LATAM»...)
 * a la forma que entiende el prefiltro.
 * - Remoto mencionando Colombia o Latinoamérica → remoto solo desde esos países.
 * - Colombia sin decir remoto → «híbrido» (no se sabe: la nota lo muestra como ubicación para que lo verifiques).
 * - «Worldwide» / «Anywhere» → remoto desde cualquier país.
 * - Cualquier otro remoto («Remote», «Remote - International», «Remote - US») queda con una región que no es
 *   Colombia: solo pasa si el texto de la oferta menciona Latam o Colombia (ver `ubicacionValida`).
 * Ojo: «CO» en «Remote - CO, FL, GA...» es Colorado, no Colombia: solo cuenta la palabra completa.
 */
export function ubicacionDeGreenhouse(ubicacion: string, titulo: string): { modalidad: string; paises: string[]; ciudades: string[] } {
  const loc = ubicacion.trim();
  const enColombia = /colombia/i.test(loc);
  const enLatam = /latam|latin america|latinoam|south america|sudam/i.test(loc);
  const remoto = /remote|remoto/i.test(`${loc} ${titulo}`);
  if (/\b(?:worldwide|anywhere|global)\b/i.test(loc)) return { modalidad: "fully_remote", paises: [], ciudades: [] };
  const paises = [...(enColombia ? ["Colombia"] : []), ...(enLatam ? ["LATAM"] : [])];
  if (paises.length > 0) {
    if (remoto) return { modalidad: "remote_local", paises, ciudades: [] };
    return { modalidad: "hybrid", paises, ciudades: loc ? [loc] : [] };
  }
  if (remoto) return { modalidad: "remote_local", paises: [loc || "sin región"], ciudades: [] };
  return { modalidad: "no_remote", paises: [], ciudades: loc ? [loc] : [] };
}

/** Convierte una vacante de Greenhouse al formato común. Devuelve null si le falta lo básico. */
export function aOfertaGreenhouse(item: ItemGreenhouse, token: string): Oferta | null {
  const publicada = new Date(item.first_published ?? item.updated_at ?? "");
  if (!item.id || !item.title || !item.absolute_url || Number.isNaN(publicada.getTime())) return null;
  const ubicacion = typeof item.location === "string" ? item.location : (item.location?.name ?? "");
  const { modalidad, paises, ciudades } = ubicacionDeGreenhouse(ubicacion, item.title);
  return {
    id: `greenhouse-${token.toLowerCase()}-${item.id}`,
    titulo: item.title,
    empresa: item.company_name?.trim() || token,
    nivel: nivelDesdeTitulo(item.title),
    modalidad,
    paises,
    ciudades,
    publicada,
    salario: null, // el listado no trae el salario
    url: item.absolute_url,
    texto: [item.title, ubicacion ? `Ubicación: ${ubicacion}` : "", contenidoATexto(item.content)].filter(Boolean).join("\n\n"),
  };
}

/** Lee `greenhouse-empresas.json` y devuelve los tokens. Falla con un mensaje claro si el archivo está mal. */
export async function cargarEmpresas(ruta = RUTA_EMPRESAS): Promise<string[]> {
  let crudo: string;
  try {
    crudo = await readFile(ruta, "utf8");
  } catch {
    throw new Error(`no encuentro ${ruta} (lista de empresas de Greenhouse)`);
  }
  let datos: unknown;
  try {
    datos = JSON.parse(crudo);
  } catch {
    throw new Error(`${ruta} no es un JSON válido`);
  }
  const lista = (datos as { empresas?: unknown }).empresas;
  if (!Array.isArray(lista)) throw new Error(`${ruta} debe tener una lista «empresas»`);
  const tokens = lista.map((e) => (typeof e === "string" ? e : (e as { token?: unknown })?.token));
  const malos = tokens.filter((t) => typeof t !== "string" || !TOKEN_VALIDO.test(t));
  if (malos.length > 0) throw new Error(`${ruta}: token no válido (${malos.map(String).join(", ")}). Usa solo letras, números, - y _`);
  return [...new Set((tokens as string[]).map((t) => t.toLowerCase()))];
}

/** Trae todas las vacantes de una empresa (una petición). */
export async function buscarEnGreenhouse(token: string): Promise<Oferta[]> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${API}/${encodeURIComponent(token)}/jobs?content=true`, {
      headers: { "User-Agent": "analizador-ofertas (busqueda personal)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(`Greenhouse tardó más de ${TIMEOUT_MS / 1000} s en responder para "${token}"`);
    }
    throw error;
  }
  if (respuesta.status === 404) throw new Error(`no existe un tablero de Greenhouse con el token "${token}"`);
  if (!respuesta.ok) throw new Error(`Greenhouse respondió ${respuesta.status} para "${token}"`);
  const json = (await respuesta.json()) as { jobs?: ItemGreenhouse[] };
  if (!Array.isArray(json.jobs)) throw new Error(`Greenhouse devolvió una respuesta con formato inesperado para "${token}"`);
  return json.jobs.map((j) => aOfertaGreenhouse(j, token)).filter((o): o is Oferta => o !== null);
}

/**
 * Greenhouse como `Fuente`: recorre las empresas de `greenhouse-empresas.json`, una por una.
 * Si una empresa falla (token mal escrito, caída) solo avisa; si fallan todas, lanza el error.
 */
export function crearFuenteGreenhouse(rutaEmpresas = RUTA_EMPRESAS): Fuente {
  return {
    nombre: "greenhouse",
    etiqueta: "Greenhouse",
    async buscar() {
      const empresas = await cargarEmpresas(rutaEmpresas);
      if (empresas.length === 0) return [];
      const todas: Oferta[] = [];
      let fallidas = 0;
      for (const token of empresas) {
        try {
          const encontradas = await buscarEnGreenhouse(token);
          todas.push(...encontradas);
          console.log(`  ${token}: ${encontradas.length} vacantes`);
        } catch (error) {
          fallidas++;
          console.warn(`  No se pudo leer ${token}: ${error instanceof Error ? error.message : error}`);
        }
      }
      if (fallidas === empresas.length) throw new Error("ninguna empresa respondió");
      return todas;
    },
  };
}

export const fuenteGreenhouse = crearFuenteGreenhouse();
