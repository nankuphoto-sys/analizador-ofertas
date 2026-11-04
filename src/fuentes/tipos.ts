import type { Oferta } from "./getonbrd.js";

/**
 * Un sitio de empleo del que `npm run buscar` puede traer ofertas.
 * Cada fuente convierte lo que publica su API al mismo formato `Oferta`,
 * así el filtro, la memoria y el análisis no necesitan saber de dónde vino.
 *
 * Para sumar una fuente: crea `src/fuentes/<nombre>.ts`, exporta un `Fuente` y agrégalo en `index.ts`.
 * Usa solo APIs o feeds oficiales (o con permiso claro). Los `id` deben llevar un prefijo propio
 * (`remotive-123`) para no chocar con los de otras fuentes en la memoria.
 */
export interface Fuente {
  /** Nombre corto para la opción `--fuentes=` (minúsculas, sin espacios). */
  nombre: string;
  /** Nombre para mostrar en el reporte. */
  etiqueta: string;
  /** Trae las ofertas. Algunas fuentes usan las palabras clave; otras traen todo y dejan filtrar al prefiltro. */
  buscar(consultas: string[]): Promise<Oferta[]>;
  /** Frase que el reporte debe mostrar cuando la fuente se usó (atribución que pide el sitio). */
  atribucion?: string;
}
