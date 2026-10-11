import { ChatAnthropic } from "@langchain/anthropic";
import { createAgent, providerStrategy } from "langchain";
import { AnalisisSchema, type Resultado } from "./esquema.js";
import { crearHerramientaBusqueda, lineasDe } from "./hojaDeVida.js";
import { completarResultado } from "./verificar.js";

const instrucciones = (hoy: string) => `Eres un asesor de selección que compara una oferta de trabajo con la hoja de vida de un candidato.
Tu prioridad es no inventar: un requisito solo se cumple si la hoja de vida lo prueba. Hoy es ${hoy}.

Reglas:
1. Extrae los requisitos de la oferta: tecnologías, experiencia, idiomas, conocimientos y estudios. Junta los que piden lo mismo.
   Ignora beneficios, salario, cultura y la descripción de la empresa.
2. tipo: "deseable" si la oferta lo presenta como deseable, plus, valoramos, nice to have o similar; si no, "obligatorio".
3. Antes de decidir cada requisito, llama a buscar_en_hoja_de_vida con su término clave. Si no aparece, prueba un sinónimo
   real ("Postgres" y "PostgreSQL", "pruebas" y "testing") antes de rendirte.
4. estado:
   - cumple: la hoja de vida lo muestra directamente.
   - parcial: muestra la misma habilidad pero no al nivel pedido, o una tecnología hermana que se usa igual
     (pide 4 años y tiene 2; pide React Native y tiene React; pide C1 y tiene B1). Una experiencia general no es
     parcial de una especialidad: consumir APIs REST no es integrar APIs de LLM, y programar no es saber Python.
   - no_cumple: no aparece. Saber una tecnología no prueba otra: React no prueba Vue, Next.js no prueba Node.js con Express,
     Firebase no prueba PostgreSQL.
5. Años de experiencia: calcúlalos solo con las fechas de la hoja de vida.
6. Idiomas: compara el nivel. Si la oferta pide un nivel más alto que el de la hoja de vida, es parcial o no_cumple.
7. evidencia: copia literalmente un fragmento corto de una línea que devolvió la herramienta. Sin puntos suspensivos ni
   palabras tuyas. Vacía si es no_cumple.
8. palabras_clave_faltantes: términos técnicos de la oferta que la herramienta no encontró en la hoja de vida.
9. que_destacar: 3 a 5 consejos concretos sobre qué experiencia de la hoja de vida poner primero para esta oferta y por qué.
   Solo cosas que están en la hoja de vida; nunca sugieras agregar algo que el candidato no tiene.
10. advertencias: riesgos reales de la postulación (un requisito obligatorio que falta, un nivel de idioma insuficiente).`;

export function crearAgente(hojaDeVida: string, modelo = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5") {
  const hoy = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  return createAgent({
    model: new ChatAnthropic({ model: modelo }),
    tools: [crearHerramientaBusqueda(lineasDe(hojaDeVida))],
    systemPrompt: instrucciones(hoy),
    responseFormat: providerStrategy(AnalisisSchema),
  });
}

/** Compara la oferta con la hoja de vida y devuelve el análisis verificado, con el encaje calculado. */
export async function analizarOferta(oferta: string, hojaDeVida: string): Promise<Resultado> {
  if (hojaDeVida.trim().length < 50) {
    throw new Error("La hoja de vida casi no tiene texto. Si es un PDF escaneado, usa una versión con texto.");
  }
  if (oferta.trim().length < 50) {
    throw new Error("La oferta casi no tiene texto. Copia la descripción completa del cargo.");
  }

  const resultado = await crearAgente(hojaDeVida).invoke({
    messages: [{ role: "user", content: `Analiza esta oferta para el candidato:\n\n${oferta}` }],
  });
  return completarResultado(AnalisisSchema.parse(resultado.structuredResponse), hojaDeVida);
}
