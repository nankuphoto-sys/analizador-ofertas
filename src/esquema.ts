import * as z from "zod";

export const ESTADOS = ["cumple", "parcial", "no_cumple"] as const;
export type Estado = (typeof ESTADOS)[number];

// Sin límites numéricos (min/max): la salida estructurada nativa de Anthropic no los acepta.
export const RequisitoSchema = z.object({
  requisito: z.string().describe("El requisito de la oferta, resumido en pocas palabras"),
  tipo: z
    .enum(["obligatorio", "deseable"])
    .describe('"deseable" si la oferta dice deseable, plus, valoramos o similar; si no, "obligatorio"'),
  estado: z
    .enum(ESTADOS)
    .describe("cumple: la hoja de vida lo prueba; parcial: prueba algo relacionado pero no lo pedido; no_cumple: no aparece"),
  evidencia: z
    .string()
    .describe("Frase copiada literalmente de la hoja de vida que lo prueba. Vacía si es no_cumple"),
});

/** Lo que devuelve el modelo. El encaje NO lo decide el modelo: se calcula en código. */
export const AnalisisSchema = z.object({
  cargo: z.string().describe("Nombre del cargo de la oferta"),
  empresa: z.string().describe("Empresa que publica la oferta, o 'sin nombre'"),
  requisitos: z.array(RequisitoSchema),
  palabras_clave_faltantes: z
    .array(z.string())
    .describe("Términos técnicos que pide la oferta y que no aparecen en la hoja de vida"),
  que_destacar: z
    .array(z.string())
    .describe("3 a 5 consejos concretos: qué experiencia de la hoja de vida poner primero para esta oferta"),
  advertencias: z.array(z.string()).describe("Dudas o riesgos de la postulación"),
});

export type Requisito = z.infer<typeof RequisitoSchema>;
export type Analisis = z.infer<typeof AnalisisSchema>;

/** El análisis final: lo del modelo, ya verificado, más el encaje calculado. */
export interface Resultado extends Analisis {
  /** 0-100, calculado a partir de los requisitos verificados. */
  encaje: number;
  /** Requisitos que el modelo dio por cumplidos con una evidencia que no está en la hoja de vida. */
  evidencias_rechazadas: string[];
}
