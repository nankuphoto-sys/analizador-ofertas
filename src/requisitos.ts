import type { Oferta } from "./fuentes/getonbrd.js";

/**
 * Dos datos que a veces importan más que el stack: ¿piden inglés? ¿pagan en dólares?
 * Se deducen del texto de la oferta, sin IA. Son pistas, no garantías: una oferta que no
 * menciona el inglés puede hacer la entrevista en inglés, y una que no dice el salario puede pagar en dólares.
 */

export type Ingles =
  | "requerido" //   la oferta lo pide (sin decir que es deseable)
  | "implicito" //   no lo menciona, pero está escrita en inglés: se espera que lo manejes
  | "deseable" //    lo menciona como plus, valorable o deseable
  | "no_requerido" // dice expresamente que no hace falta
  | "no_mencionado";

export type Pago = "usd" | "cop" | "desconocido";

export interface Requisitos {
  ingles: Ingles;
  pago: Pago;
}

export const ETIQUETA_INGLES: Record<Ingles, string> = {
  requerido: "lo piden",
  implicito: "oferta en inglés",
  deseable: "deseable",
  no_requerido: "no hace falta",
  no_mencionado: "no lo dice",
};
export const ETIQUETA_PAGO: Record<Pago, string> = { usd: "USD", cop: "COP", desconocido: "no dice" };

const MENCION = /\b(?:ingl[eé]s|english)\b/i;
const NO_HACE_FALTA =
  /\b(?:no|sin)\s+(?:se\s+)?(?:requiere|necesit\w+|exig\w+|es\s+(?:necesario|obligatorio|requisito))\s+(?:el\s+)?ingl[eé]s|\bsin\s+(?:el\s+)?ingl[eé]s\b|\bno\s+(?:se\s+)?(?:pide|piden|solicita\w*)\s+(?:el\s+)?ingl[eé]s|ingl[eé]s\s+no\s+(?:es\s+)?(?:requerido|necesario|obligatorio|excluyente)|no\s+english\s+(?:is\s+)?required|english\s+(?:is\s+)?not\s+(?:required|needed|necessary)|no\s+need\s+(?:for|of)\s+english/i;
const DESEABLE =
  /\b(?:deseable|valorad[oa]|valorable|se\s+valora|plus|nice[\s-]to[\s-]have|preferred|preferible|ventaja|bonus|opcional|optional)\b/i;

/** Palabras muy comunes de cada idioma, para saber en cuál está escrita la oferta. */
const PALABRAS_EN = new Set(["the", "and", "with", "you", "will", "our", "your", "for", "to", "of", "in", "we", "are", "is", "experience", "team", "work", "have", "be", "or", "as", "on", "an"]);
const PALABRAS_ES = new Set(["el", "la", "los", "las", "de", "y", "con", "para", "en", "un", "una", "que", "del", "por", "se", "al", "experiencia", "equipo", "trabajo", "tu", "nuestro", "nuestra", "o", "es"]);

/** ¿La oferta está escrita en inglés? Compara cuántas palabras comunes de cada idioma aparecen al inicio. */
export function estaEnIngles(texto: string): boolean {
  const palabras = texto.slice(0, 2000).toLowerCase().match(/[a-záéíóúñ]+/g) ?? [];
  let en = 0;
  let es = 0;
  for (const p of palabras) {
    if (PALABRAS_EN.has(p)) en++;
    if (PALABRAS_ES.has(p)) es++;
  }
  return en >= 8 && en > es * 1.5;
}

function inglesDe(texto: string): Ingles {
  // Se revisa frase por frase: «Inglés deseable» y «Inglés avanzado» pueden estar en la misma oferta.
  const frases = texto.split(/(?<=[.!?;])\s+|\n+/).filter((f) => MENCION.test(f) || /\b(?:b1|b2|c1|c2)\b/i.test(f) && /ingl|english|idioma|language/i.test(f));
  let hayNoHaceFalta = false;
  let hayDeseable = false;
  for (const f of frases) {
    if (NO_HACE_FALTA.test(f)) hayNoHaceFalta = true;
    else if (DESEABLE.test(f)) hayDeseable = true;
    else return "requerido";
  }
  if (hayNoHaceFalta) return "no_requerido";
  if (hayDeseable) return "deseable";
  return estaEnIngles(texto) ? "implicito" : "no_mencionado";
}

const USD = /\busd\b|\bus\$|\bu\$s\b|d[oó]lares?\b|\bdollars?\b/i;
const COP = /\bcop\b|\bpesos\b|\$\s?\d{1,3}(?:\.\d{3}){2,}/i;

function pagoDe(o: Oferta): Pago {
  // Remotive y Get on Board publican el salario en dólares.
  const salario = o.salario ?? "";
  if (/usd|\$/i.test(salario)) return "usd";
  const texto = `${salario}\n${o.texto}`;
  if (USD.test(texto)) return "usd";
  if (COP.test(texto)) return "cop";
  return "desconocido";
}

export function requisitosDe(o: Oferta): Requisitos {
  return { ingles: inglesDe(o.texto), pago: pagoDe(o) };
}

export interface FiltroRequisitos {
  /** "explicito": fuera si piden inglés. "estricto": además fuera las escritas en inglés sin mencionarlo. */
  sinIngles?: "explicito" | "estricto";
  /** Solo las que dicen pagar en dólares. */
  soloUsd?: boolean;
}

/** Aplica el filtro y cuenta cuántas salieron por cada motivo (una oferta cuenta una sola vez, por inglés primero). */
export function aplicarFiltro(ofertas: Oferta[], filtro: FiltroRequisitos): { aceptadas: Oferta[]; porIngles: number; porPago: number } {
  const aceptadas: Oferta[] = [];
  let porIngles = 0;
  let porPago = 0;
  const vistas = new Set<string>(); // la misma oferta sale en varias búsquedas por palabra clave: se cuenta una vez
  for (const o of ofertas) {
    if (vistas.has(o.id)) continue;
    vistas.add(o.id);
    const r = requisitosDe(o);
    if (filtro.sinIngles && (r.ingles === "requerido" || (filtro.sinIngles === "estricto" && r.ingles === "implicito"))) {
      porIngles++;
    } else if (filtro.soloUsd && r.pago !== "usd") {
      porPago++;
    } else {
      aceptadas.push(o);
    }
  }
  return { aceptadas, porIngles, porPago };
}
