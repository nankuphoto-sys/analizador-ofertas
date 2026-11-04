import { contieneFrase } from "./hojaDeVida.js";
import { tecnologiasEn } from "./prefiltro.js";

/**
 * Regla que el agente nunca cruza (docs/regla-no-inventar.md), aplicada a las cartas del preparador:
 * cada afirmación sobre el candidato lleva su cita de la hoja de vida entre dobles corchetes, [[así]].
 * Antes de que la carta llegue al usuario, se comprueba que cada cita aparezca literalmente.
 */

/** Las marcas de cita que pone el preparador. */
const MARCA = /\[\[([^\]]+)\]\]/g;
/** Sin la bandera g: .test() con g recuerda la posición entre llamadas y da resultados alternados. */
const TIENE_MARCA = /\[\[[^\]]+\]\]/;
/** La sección de dudas habla de lo que falta, no de lo que el candidato tiene: no se revisa. */
const SECCION_DUDAS = /^#{1,6}\s*dudas\b/im;

export interface RevisionCarta {
  /** Citas que sí están en la hoja de vida. */
  verificadas: string[];
  /** Citas que no aparecen tal cual: la carta no se puede enviar así. */
  faltantes: string[];
  /** Frases con cifras o tecnologías y sin cita: probablemente bien, pero el usuario debe mirarlas. */
  sinCita: string[];
  /** La carta sin las marcas, lista para que el usuario la revise y la envíe él. */
  limpia: string;
}

export function revisarCarta(texto: string, hojaDeVida: string): RevisionCarta {
  const corte = texto.search(SECCION_DUDAS);
  const revisable = corte === -1 ? texto : texto.slice(0, corte);

  const citas = [...revisable.matchAll(MARCA)].map((m) => m[1].trim());
  const verificadas = citas.filter((c) => contieneFrase(hojaDeVida, c));
  const faltantes = citas.filter((c) => !contieneFrase(hojaDeVida, c));

  const sinCita = revisable
    .replace(/^#.*$/gm, "") // títulos
    .split(/(?<=[.!?])\s+|\n+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0 && !TIENE_MARCA.test(f) && (/\d/.test(f) || tecnologiasEn(f).length > 0));

  const limpia = texto.replace(/\s*\[\[[^\]]+\]\]/g, "");
  return { verificadas, faltantes, sinCita, limpia };
}
