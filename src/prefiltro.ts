import type { Oferta } from "./fuentes/getonbrd.js";
import { contieneFrase, normalizar } from "./hojaDeVida.js";

/**
 * Primer filtro, sin IA y sin costo: descarta lo que no sirve y ordena lo demás según cuánto
 * de la tecnología que pide la oferta aparece en la hoja de vida. Solo las mejores pasan
 * al análisis con el modelo, que sí cuesta.
 */

/** Tecnologías que se buscan en las ofertas. Cada una con sus formas de escribirse. */
export const TECNOLOGIAS: Record<string, string[]> = {
  JavaScript: ["javascript"],
  TypeScript: ["typescript"],
  React: ["react", "reactjs", "react js"],
  "Next.js": ["next js", "nextjs"],
  "Node.js": ["node js", "nodejs", "node"],
  Express: ["express"],
  NestJS: ["nestjs", "nest js"],
  PostgreSQL: ["postgresql", "postgres"],
  MySQL: ["mysql"],
  MongoDB: ["mongodb", "mongo"],
  SQL: ["sql"],
  Prisma: ["prisma"],
  Docker: ["docker"],
  Kubernetes: ["kubernetes", "k8s"],
  AWS: ["aws", "amazon web services"],
  Azure: ["azure"],
  GCP: ["gcp", "google cloud"],
  Git: ["git", "github"],
  "HTML/CSS": ["html", "css"],
  Tailwind: ["tailwind"],
  Testing: ["vitest", "jest", "playwright", "testing", "pruebas unitarias", "pruebas automatizadas"],
  Python: ["python"],
  Java: ["java", "spring boot", "spring framework"], // "spring" solo choca con la palabra en inglés
  ".NET": ["net core", "dotnet", "asp net", "net framework"], // "c#" se normaliza a "c" y daría falsos positivos
  Angular: ["angular"],
  Vue: ["vue", "vuejs"],
  PHP: ["php", "laravel"],
  Ruby: ["ruby", "rails"],
  Go: ["golang"],
  "React Native": ["react native"],
  Flutter: ["flutter"],
  IA: ["llm", "rag", "openai", "anthropic", "claude", "langchain", "inteligencia artificial", "ia generativa", "genai", "agentes de ia"],
  Salesforce: ["salesforce"],
  SAP: ["sap", "abap"],
};

/**
 * Si la hoja de vida dice una, también sabes la otra: quien usa PostgreSQL sabe SQL,
 * quien usa Next.js sabe React. Solo se aplica a tu stack, nunca a lo que pide la oferta.
 */
export const IMPLICA: Record<string, string[]> = {
  "Next.js": ["React"],
  "React Native": ["React"],
  TypeScript: ["JavaScript"],
  Express: ["Node.js"],
  NestJS: ["Node.js"],
  PostgreSQL: ["SQL"],
  MySQL: ["SQL"],
};

/** Tu stack a partir de la hoja de vida, sumando lo que implica cada tecnología. */
export function stackDe(hojaDeVida: string): Set<string> {
  const tuyas = new Set(tecnologiasEn(hojaDeVida));
  for (const t of [...tuyas]) for (const implicada of IMPLICA[t] ?? []) tuyas.add(implicada);
  return tuyas;
}

/** Tecnologías que nombra un texto. */
export function tecnologiasEn(texto: string): string[] {
  return Object.entries(TECNOLOGIAS)
    .filter(([, formas]) => formas.some((f) => contieneFrase(texto, f)))
    .map(([nombre]) => nombre);
}

export interface Candidata {
  oferta: Oferta;
  pide: string[];
  tienes: string[];
  teFalta: string[];
  /** 0-100: hasta 85 por la parte de lo que pide la oferta que aparece en la hoja de vida, más 15 si es junior. */
  puntaje: number;
  /** Nota sobre si Colombia puede postular. */
  ubicacion: string;
}

/**
 * Títulos de cargos de desarrollo. Cada raíz va con límite de palabra para que "Back Office"
 * o "Ingeniero Comercial" no pasen; "ingeniero" solo cuenta si dice de qué (software, desarrollo...).
 */
export const TITULO_DESARROLLO =
  /\b(?:desarroll\w*|developer|programad\w*|software|dev|front[\s-]?end|back[\s-]?end|full[\s-]?stack|web|engineer)\b|\bingenier[oa]s?\b.*\b(?:software|desarrollo|sistemas|front|back|full|web)/i;

/**
 * Cargos técnicos que no son de desarrollo de software: seguridad, infraestructura/SRE, datos,
 * soporte y preventa. Entran por la palabra "engineer" pero no son lo que busca esta hoja de vida.
 */
export const TITULO_AJENO =
  /\b(?:security|seguridad|infosec|cyber\w*|vulnerabilit\w*|sre|site reliability|devops|devsecops|sysadmin|infraestructura|infrastructure|network\w*|redes|data engineer\w*|ingenier[oa]s? de datos|solutions? engineer\w*|sales engineer\w*|support engineer\w*|soporte|preventa|pre-?sales|dba|database administrator)\b/i;

/** Si el título lo dice con todas sus letras, es de desarrollo aunque nombre otra área ("Full-Stack Developer, Security Tools"). */
const TITULO_DESARROLLO_FUERTE = /\b(?:desarrollador\w*|developer|programador\w*|full[\s-]?stack|front[\s-]?end|back[\s-]?end)\b/i;

const LATAM = /colombia|latam|latinoam|sudam|south america|latin america/i;

/**
 * Títulos de cargos senior o de liderazgo. "Semi Senior" no cuenta como senior.
 * Las raíces llevan \w* para cubrir sus variantes (arquitecto/arquitecta, líder/líderes).
 * No incluye "staff": en las ofertas suele ser "Staff Augmentation" (modalidad de contratación).
 */
export const TITULO_SENIOR =
  /\b(?:(?<!semi[\s-]?)senior|sr\.?|lead|l[ií]der\w*|arquitect\w*|architect\w*|manager|head|principal)\b/i;

/** ¿Se puede postular desde Colombia? Devuelve la nota a mostrar, o null si no aplica. */
export function ubicacionValida(o: Oferta): string | null {
  const enColombia = o.paises.some((p) => normalizar(p) === "colombia");
  if (o.modalidad === "fully_remote") return "Remoto, cualquier país";
  if (o.modalidad === "remote_local") {
    if (enColombia) return "Remoto desde Colombia";
    if (o.paises.some((p) => LATAM.test(p)) || LATAM.test(o.texto)) return "Remoto (menciona LATAM/Colombia)";
    // Si la oferta dice desde qué países se puede postular y Colombia no está, no aplica.
    return o.paises.length === 0 ? "Remoto local: verifica si acepta Colombia" : null;
  }
  if (enColombia) return o.modalidad === "hybrid" ? `Híbrido en ${o.ciudades.join(", ") || "Colombia"}` : `Presencial en ${o.ciudades.join(", ") || "Colombia"}`;
  return null;
}

/** Filtra por nivel, ubicación y antigüedad, y ordena por coincidencia con la hoja de vida. */
export function prefiltrar(
  ofertas: Oferta[],
  hojaDeVida: string,
  opciones: { niveles: number[]; diasMaximo: number; ahora?: Date },
): Candidata[] {
  const ahora = opciones.ahora ?? new Date();
  const limite = ahora.getTime() - opciones.diasMaximo * 24 * 3600 * 1000;
  const tuyas = stackDe(hojaDeVida);
  const vistas = new Set<string>();

  const candidatas: Candidata[] = [];
  for (const o of ofertas) {
    if (vistas.has(o.id)) continue;
    vistas.add(o.id);
    if (!opciones.niveles.includes(o.nivel)) continue;
    if (o.publicada.getTime() < limite) continue;
    const ubicacion = ubicacionValida(o);
    if (!ubicacion) continue;

    // Get on Board a veces marca como semi senior cargos que en el título dicen Senior o Lead.
    if (TITULO_SENIOR.test(o.titulo)) continue;
    // Solo cargos de desarrollo (no ventas, operaciones, datos de negocio...).
    if (!TITULO_DESARROLLO.test(o.titulo)) continue;
    // Seguridad, SRE, datos, soporte y preventa no son desarrollo de software.
    if (TITULO_AJENO.test(o.titulo) && !TITULO_DESARROLLO_FUERTE.test(o.titulo)) continue;

    const pide = tecnologiasEn(o.texto);
    const tienes = pide.filter((t) => tuyas.has(t));
    if (tienes.length < 2) continue; // menos de 2 tecnologías de tu stack: no vale la pena
    const teFalta = pide.filter((t) => !tuyas.has(t));
    // El título manda: un "Desarrollador Java" pide Java aunque el texto también diga React.
    const tituloAjeno = tecnologiasEn(o.titulo).some((t) => !tuyas.has(t));
    const cobertura = tienes.length / pide.length;
    const extraNivel = o.nivel <= 2 ? 15 : 0;
    const puntaje = Math.round(cobertura * 85 * (tituloAjeno ? 0.5 : 1)) + extraNivel; // máx. 85 + 15 = 100
    candidatas.push({ oferta: o, pide, tienes, teFalta, puntaje, ubicacion });
  }
  return candidatas.sort((a, b) => b.puntaje - a.puntaje || b.oferta.publicada.getTime() - a.oferta.publicada.getTime());
}
