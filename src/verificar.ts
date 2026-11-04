import type { Analisis, Consejo, Requisito, Resultado } from "./esquema.js";
import { contieneFrase, normalizar } from "./hojaDeVida.js";

/** Separa una evidencia con varias citas ("a / b") en sus partes. */
const partesDeEvidencia = (evidencia: string) =>
  evidencia
    .split(/\s*(?:\/|\.\.\.|…)\s*/)
    .map((p) => p.trim().replace(/^["'“”«»]+|["'“”«»]+$/g, ""))
    .filter(Boolean);

/** ¿Toda la evidencia citada aparece de verdad en la hoja de vida? */
export function evidenciaValida(evidencia: string, hojaDeVida: string): boolean {
  const partes = partesDeEvidencia(evidencia);
  return partes.length > 0 && partes.every((p) => contieneFrase(hojaDeVida, p));
}

/**
 * Un requisito marcado como cumplido (o parcial) cuya evidencia no aparece literalmente
 * en la hoja de vida se pasa a no_cumple. Es la defensa contra que el modelo invente.
 */
export function verificarRequisitos(requisitos: Requisito[], hojaDeVida: string) {
  const rechazadas: string[] = [];
  const verificados = requisitos.map((r) => {
    if (r.estado === "no_cumple") return { ...r, evidencia: "" };
    if (evidenciaValida(r.evidencia, hojaDeVida)) return r;
    rechazadas.push(r.requisito);
    return { ...r, estado: "no_cumple" as const, evidencia: "" };
  });
  return { verificados, rechazadas };
}

/**
 * Regla que el agente nunca cruza (docs/regla-no-inventar.md): un consejo de qué destacar solo se muestra
 * si su cita aparece literalmente en la hoja de vida. Los demás se descartan, nunca se muestran "por si acaso".
 * Los válidos quedan como texto con su cita a la vista, para que el usuario vea de dónde sale cada uno.
 */
export function verificarConsejos(consejos: Consejo[], hojaDeVida: string) {
  const validos: string[] = [];
  const rechazados: string[] = [];
  for (const { consejo, cita } of consejos) {
    if (evidenciaValida(cita, hojaDeVida)) validos.push(`${consejo.trim()} — «${cita.trim()}»`);
    else rechazados.push(consejo.trim());
  }
  return { validos, rechazados };
}

const PESO_TIPO = { obligatorio: 2, deseable: 1 } as const;
const VALOR_ESTADO = { cumple: 1, parcial: 0.5, no_cumple: 0 } as const;

/** Encaje de 0 a 100: los obligatorios pesan el doble que los deseables; parcial vale la mitad. */
export function calcularEncaje(requisitos: Requisito[]): number {
  const total = requisitos.reduce((s, r) => s + PESO_TIPO[r.tipo], 0);
  if (total === 0) return 0;
  const logrado = requisitos.reduce((s, r) => s + PESO_TIPO[r.tipo] * VALOR_ESTADO[r.estado], 0);
  return Math.round((logrado / total) * 100);
}

/** Quita de "palabras clave faltantes" las que en realidad sí aparecen en la hoja de vida. */
export function filtrarPalabrasFaltantes(palabras: string[], hojaDeVida: string): string[] {
  const vistas = new Set<string>();
  return palabras
    .map((p) => p.trim())
    .filter((p) => {
      const clave = normalizar(p);
      if (!clave || vistas.has(clave)) return false; // "Docker" y "docker " son la misma
      vistas.add(clave);
      return !contieneFrase(hojaDeVida, p);
    });
}

/** Aplica todas las verificaciones al análisis del modelo y calcula el encaje. */
export function completarResultado(analisis: Analisis, hojaDeVida: string): Resultado {
  const { verificados, rechazadas } = verificarRequisitos(analisis.requisitos, hojaDeVida);
  const consejos = verificarConsejos(analisis.que_destacar, hojaDeVida);
  const advertencias = [...analisis.advertencias];
  if (rechazadas.length > 0) {
    advertencias.push(
      `${rechazadas.length} requisito(s) se pasaron a "no cumple" porque la evidencia citada no aparece en la hoja de vida: ${rechazadas.join(", ")}.`,
    );
  }
  if (consejos.rechazados.length > 0) {
    advertencias.push(
      `Se quitaron ${consejos.rechazados.length} consejo(s) de "qué destacar" porque su cita no aparece en la hoja de vida.`,
    );
  }
  return {
    ...analisis,
    que_destacar: consejos.validos,
    requisitos: verificados,
    palabras_clave_faltantes: filtrarPalabrasFaltantes(analisis.palabras_clave_faltantes, hojaDeVida),
    advertencias,
    encaje: calcularEncaje(verificados),
    evidencias_rechazadas: rechazadas,
  };
}
