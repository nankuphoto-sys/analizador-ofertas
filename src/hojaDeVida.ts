import { tool } from "langchain";
import * as z from "zod";

/** Minúsculas, sin tildes ni signos, espacios simples. "Next.js" -> "next js". */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Quita la "s" final de palabras largas para que "pruebas" y "prueba" coincidan. */
const singular = (palabra: string) =>
  palabra.length > 3 && palabra.endsWith("s") ? palabra.slice(0, -1) : palabra;

const palabrasDe = (texto: string) => normalizar(texto).split(" ").filter(Boolean).map(singular);

export interface LineaHojaDeVida {
  numero: number;
  texto: string;
}

/** Parte la hoja de vida en líneas no vacías, numeradas desde 1. */
export function lineasDe(texto: string): LineaHojaDeVida[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((texto, i) => ({ numero: i + 1, texto }));
}

/** ¿Aparece la frase en el texto, ignorando tildes, mayúsculas, signos y saltos de línea? */
export function contieneFrase(texto: string, frase: string): boolean {
  const f = normalizar(frase);
  return f.length > 0 && ` ${normalizar(texto)} `.includes(` ${f} `);
}

export type ResultadoBusqueda =
  | { encontrado: true; lineas: LineaHojaDeVida[] }
  | { encontrado: false; mensaje: string };

/**
 * Busca un término en la hoja de vida y devuelve las líneas donde aparece.
 * Primero busca la frase completa; si no la encuentra, las líneas que contienen
 * todas sus palabras (ignorando plurales). Nunca adivina sinónimos: eso lo decide el agente.
 */
export function buscarEnHojaDeVida(
  lineas: LineaHojaDeVida[],
  termino: string,
  maximo = 5,
): ResultadoBusqueda {
  const exactas = lineas.filter((l) => contieneFrase(l.texto, termino));
  if (exactas.length > 0) return { encontrado: true, lineas: exactas.slice(0, maximo) };

  const buscadas = palabrasDe(termino);
  const parciales = lineas.filter((l) => {
    const palabras = new Set(palabrasDe(l.texto));
    return buscadas.length > 0 && buscadas.every((p) => palabras.has(p));
  });
  if (parciales.length > 0) return { encontrado: true, lineas: parciales.slice(0, maximo) };

  return {
    encontrado: false,
    mensaje: `"${termino}" no aparece en la hoja de vida. Prueba un sinónimo o márcalo como no_cumple.`,
  };
}

/** La búsqueda, envuelta como herramienta para el agente. Cada análisis usa su propia hoja de vida. */
export function crearHerramientaBusqueda(lineas: LineaHojaDeVida[]) {
  return tool(async ({ termino }) => JSON.stringify(buscarEnHojaDeVida(lineas, termino)), {
    name: "buscar_en_hoja_de_vida",
    description:
      "Busca un término (tecnología, herramienta, idioma, cargo, sector) en la hoja de vida del candidato " +
      "y devuelve las líneas exactas donde aparece. Úsala para CADA requisito antes de decidir si se cumple; " +
      "la evidencia debe copiarse de estas líneas.",
    schema: z.object({
      termino: z.string().describe('Término a buscar, por ejemplo "PostgreSQL", "pruebas", "inglés"'),
    }),
  });
}
