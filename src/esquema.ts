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

/** Un consejo de qué destacar, con la cita de la hoja de vida que prueba lo que nombra (ver docs/regla-no-inventar.md). */
export const ConsejoSchema = z.object({
  consejo: z
    .string()
    .describe("Qué experiencia, proyecto o logro de la hoja de vida poner arriba y qué requisito de la oferta responde (regla 9)"),
  cita: z
    .string()
    .describe("Tramo de 3 a 15 palabras copiado letra por letra de la hoja de vida que prueba lo que nombra el consejo"),
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
    .array(ConsejoSchema)
    .describe("3 a 5 consejos, cada uno con su cita literal de la hoja de vida (regla 9)"),
  advertencias: z
    .array(z.string())
    .describe("Obligatorios que faltan, niveles o años insuficientes y datos que faltan para decidir (regla 10). Vacía si no hay"),
});

export type Requisito = z.infer<typeof RequisitoSchema>;
export type Analisis = z.infer<typeof AnalisisSchema>;
export type Consejo = z.infer<typeof ConsejoSchema>;

/**
 * El análisis final: lo del modelo, ya verificado, más el encaje calculado.
 * que_destacar queda como texto («consejo — «cita»») y solo con los consejos cuya cita se verificó.
 */
export interface Resultado extends Omit<Analisis, "que_destacar"> {
  que_destacar: string[];
  /** 0-100, calculado a partir de los requisitos verificados. */
  encaje: number;
  /** Requisitos que el modelo dio por cumplidos con una evidencia que no está en la hoja de vida. */
  evidencias_rechazadas: string[];
}
