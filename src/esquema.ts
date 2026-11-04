import * as z from "zod";

export const ESTADOS = ["cumple", "parcial", "no_cumple"] as const;
export type Estado = (typeof ESTADOS)[number];

// Sin límites numéricos (min/max): la salida estructurada nativa de Anthropic no los acepta.
export const RequisitoSchema = z.object({
// Las descripciones repiten las reglas del prompt (agente.ts) en corto: si cambias una, cambia la otra.
  requisito: z
    .string()
    .describe('Una sola cosa comprobable de la oferta, con su nivel o cantidad si la da: "Inglés B2", "3 años con React"'),
  tipo: z
    .enum(["obligatorio", "deseable"])
    .describe('"deseable" solo si la oferta lo marca como deseable, plus, nice to have o similar (regla 2); si no, "obligatorio"'),
  estado: z
    .enum(ESTADOS)
    .describe(
      "cumple: la hoja de vida lo nombra y llega al nivel pedido; parcial: lo tiene con menos nivel, sin datos de nivel, " +
        "o tiene una variante directa (regla 4); no_cumple: todo lo demás, incluida otra tecnología distinta",
    ),
  evidencia: z
    .string()
    .describe('Tramo de 3 a 15 palabras copiado letra por letra de una línea de la hoja de vida; varios tramos se separan con " / ". Obligatoria en cumple y parcial; vacía en no_cumple'),
});

/** Lo que devuelve el modelo. El encaje NO lo decide el modelo: se calcula en código. */
export const AnalisisSchema = z.object({
  cargo: z.string().describe("Nombre del cargo de la oferta"),
  empresa: z.string().describe("Empresa que publica la oferta, o 'sin nombre'"),
  requisitos: z.array(RequisitoSchema),
  palabras_clave_faltantes: z
    .array(z.string())
    .describe("Nombres de tecnologías, herramientas, metodologías o certificaciones de la oferta que la búsqueda no encontró (regla 8)"),
  que_destacar: z
    .array(z.string())
    .describe("3 a 5 consejos: cada uno nombra algo que ya está en la hoja de vida y qué requisito de la oferta responde (regla 9)"),
  advertencias: z
    .array(z.string())
    .describe("Obligatorios que faltan, niveles o años insuficientes y datos que faltan para decidir (regla 10). Vacía si no hay"),
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
