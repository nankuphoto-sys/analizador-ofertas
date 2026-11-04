/**
 * Ofertas de Get on Board por su API pública (sin login): https://www.getonbrd.com/api/v0
 * Trae el texto completo de cada oferta, así se puede analizar sin abrir la página.
 */
const API = "https://www.getonbrd.com/api/v0";
/** Tiempo máximo por pedido: si la API se cuelga, se corta en vez de esperar para siempre. */
const TIMEOUT_MS = 15_000;

/** Niveles de Get on Board: 1 Sin experiencia, 2 Junior, 3 Semi Senior, 4 Senior, 5 Expert. */
export const NIVELES: Record<number, string> = { 1: "Sin experiencia", 2: "Junior", 3: "Semi Senior", 4: "Senior", 5: "Expert" };

export interface Oferta {
  id: string;
  titulo: string;
  empresa: string;
  nivel: number;
  /** "fully_remote" (cualquier país), "remote_local" (remoto solo desde ciertos países), "hybrid", "no_remote". */
  modalidad: string;
  paises: string[];
  ciudades: string[];
  publicada: Date;
  salario: string | null;
  url: string;
  /** Texto plano completo: título, descripción, funciones y deseables. */
  texto: string;
}

/** HTML a texto plano: quita etiquetas y decodifica las entidades más comunes. */
export function htmlATexto(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<(br|\/p|\/li|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

interface Atributos {
  title: string;
  description?: string;
  functions?: string;
  desirable?: string;
  remote_modality: string;
  countries?: string[];
  location_cities?: { data?: { attributes?: { name?: string } }[] } | null;
  published_at: number;
  min_salary?: number | null;
  max_salary?: number | null;
  seniority: { data: { id: number } };
  company?: { data?: { id?: string; attributes?: { name?: string } } };
}

/** Convierte un resultado de la API en una Oferta. */
export function aOferta(item: { id: string; attributes: Atributos; links?: { public_url?: string } }): Oferta {
  const a = item.attributes;
  const empresa = a.company?.data?.attributes?.name ?? a.company?.data?.id ?? "sin nombre";
  const salario = a.min_salary || a.max_salary ? `${a.min_salary ?? "?"}–${a.max_salary ?? "?"} USD/mes` : null;
  const texto = [
    a.title,
    htmlATexto(a.description),
    a.functions ? `Funciones:\n${htmlATexto(a.functions)}` : "",
    a.desirable ? `Deseable:\n${htmlATexto(a.desirable)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    id: item.id,
    titulo: a.title,
    empresa,
    nivel: a.seniority?.data?.id ?? 0,
    modalidad: a.remote_modality,
    paises: a.countries ?? [],
    ciudades: (a.location_cities?.data ?? []).map((c) => c.attributes?.name ?? "").filter(Boolean),
    publicada: new Date(a.published_at * 1000),
    salario,
    url: item.links?.public_url ?? `https://www.getonbrd.com/jobs/${item.id}`,
    texto,
  };
}

/** Busca ofertas por palabra clave (varias páginas). Puede haber repetidas entre páginas; `prefiltrar` las quita. */
export async function buscarEnGetOnBoard(consulta: string, paginas = 2): Promise<Oferta[]> {
  const ofertas: Oferta[] = [];
  for (let pagina = 1; pagina <= paginas; pagina++) {
    const parametros = new URLSearchParams({ query: consulta, per_page: "100", page: String(pagina), expand: '["company"]' });
    let respuesta: Response;
    try {
      respuesta = await fetch(`${API}/search/jobs?${parametros}`, {
        headers: { "User-Agent": "analizador-ofertas (busqueda personal)" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error(`Get on Board tardó más de ${TIMEOUT_MS / 1000} s en responder para "${consulta}"`);
      }
      throw error;
    }
    if (!respuesta.ok) throw new Error(`Get on Board respondió ${respuesta.status} para "${consulta}"`);
    const { data, meta } = (await respuesta.json()) as { data: Parameters<typeof aOferta>[0][]; meta?: { total_pages?: number } };
    ofertas.push(...data.map(aOferta));
    if (!meta?.total_pages || pagina >= meta.total_pages) break;
  }
  return ofertas;
}
