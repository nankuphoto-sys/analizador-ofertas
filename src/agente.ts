import { ChatAnthropic } from "@langchain/anthropic";
import { createAgent, providerStrategy } from "langchain";
import { AnalisisSchema, type Resultado } from "./esquema.js";
import { crearHerramientaBusqueda, lineasDe } from "./hojaDeVida.js";
import { huella } from "./memoria.js";
import {
  cargarRegistro,
  costoUsd,
  type Estado,
  guardarRegistro,
  leerLimites,
  PresupuestoAgotado,
  registrarGasto,
  revisarPresupuesto,
  RUTA_GASTO,
  type Uso,
  usoDeMensajes,
} from "./gasto.js";
import { completarResultado } from "./verificar.js";
import * as z from "zod";

const instrucciones = (hoy: string) => `Eres un asesor de selección que compara una oferta de trabajo con la hoja de vida de un candidato.
Tu prioridad es no inventar: un requisito solo se cumple si la hoja de vida lo prueba. Hoy es ${hoy}.
Escribe todos los campos en español. Los nombres de tecnologías, herramientas y certificaciones van tal como los escribe la oferta.

Reglas:
1. Qué es un requisito. Extrae de la oferta, como requisitos separados: cada tecnología o herramienta, cada idioma,
   cada exigencia de años de experiencia, cada título o estudio, cada experiencia en un sector ("fintech o banca"),
   cada cosa que piden tener (portafolio, certificación) y cada conocimiento técnico (metodologías, arquitecturas).
   Un requisito = una sola cosa que se pueda comprobar por separado: "React y TypeScript" son dos requisitos.
   Excepción: si la oferta da alternativas con "o" ("Express o NestJS", "AWS, GCP o Azure"), es UN requisito que se
   cumple con cualquiera de ellas; busca cada alternativa y usa la mejor que encuentres.
   Únelos en uno solo también cuando la oferta pide lo mismo dos veces con otras palabras
   ("inglés avanzado" y "nivel B2 o superior de inglés" → un requisito, con el nivel más alto que se pida).
   No son requisitos: beneficios, salario, cultura, descripción de la empresa ni habilidades blandas
   (trabajo en equipo, proactividad, comunicación), porque una hoja de vida no puede probarlas.
   En el campo "requisito" incluye el nivel o la cantidad si la oferta lo da: "Inglés B2", "3 años con React".
2. tipo. "deseable" si la oferta lo marca con alguna de estas señales: deseable, plus, valoramos, se valora, suma,
   nice to have, bonus, ideal, preferible, "es un plus", o si está en una sección titulada así ("Deseable",
   "Nice to have", "Suma puntos"). Todo lo demás es "obligatorio", incluido lo que no dice nada.
3. Búsqueda. Para cada requisito llama a buscar_en_hoja_de_vida antes de decidir su estado, con el nombre de la
   tecnología o el término principal (no la frase entera). Si no aparece, haz hasta 2 búsquedas más con otras formas de
   escribir LO MISMO: abreviatura ("Postgres"/"PostgreSQL"), traducción ("pruebas"/"testing"), o nombre comercial
   ("AWS"/"Amazon Web Services"). Otra tecnología distinta no es otra forma de escribirla: no busques "Vue" para un
   requisito de React. Si tras esas búsquedas no aparece, el estado es no_cumple.
4. estado. Elige exactamente uno:
   - cumple: una línea de la hoja de vida nombra lo pedido y, si la oferta pide nivel o años, llega a ese nivel o esos años.
   - parcial: solo en estos tres casos:
     a) la hoja de vida tiene lo pedido pero con menos nivel o menos años (pide 4 años y tiene 2; en idiomas, un solo
        nivel por debajo: pide B2 y tiene B1, ver regla 6);
     b) la hoja de vida tiene lo pedido pero no permite saber si llega al nivel o los años pedidos (dice "inglés" sin
        nivel; nombra React sin fechas). En ese caso agrega una advertencia que lo explique;
     c) lo pedido es una variante directa de lo que tiene: el mismo lenguaje o la misma librería base con otra forma de
        uso (pide React Native y tiene React; pide TypeScript y tiene JavaScript).
   - no_cumple: todo lo demás. En particular, saber una tecnología no prueba otra aunque sirvan para lo mismo: React no
     prueba Vue, Next.js no prueba Node.js con Express, Firebase no prueba PostgreSQL. Una experiencia general tampoco
     prueba una especialidad: consumir APIs REST no es integrar APIs de LLM, y programar no es saber Python.
5. Años de experiencia. Calcúlalos solo con las fechas de la hoja de vida: suma la duración de los cargos y proyectos
   laborales donde aparece lo pedido; si dos periodos se solapan, cuenta el tiempo una sola vez; "actual" o "presente"
   cuenta hasta hoy; redondea hacia abajo a años completos. Proyectos académicos, cursos y bootcamps no suman años de
   experiencia laboral salvo que la oferta diga que cuentan. Si no hay fechas, aplica la regla 4b.
6. Idiomas. Traduce ambos niveles al MCER (básico = A2, intermedio = B1, intermedio alto = B2, avanzado = C1,
   nativo o bilingüe = C2) y compara: igual o mayor al pedido → cumple; un nivel por debajo → parcial;
   dos o más niveles por debajo → no_cumple; el idioma aparece sin nivel → parcial (regla 4b); no aparece → no_cumple.
7. evidencia. Obligatoria si el estado es cumple o parcial; vacía ("") si es no_cumple. Debe ser texto copiado letra por
   letra de una línea que devolvió la herramienta: un tramo seguido de esa línea, de 3 a 15 palabras, sin cambiar,
   resumir ni completar nada, sin comillas ni puntos suspensivos. Si necesitas dos líneas (por ejemplo, las fechas de dos
   cargos para sumar años), copia un tramo de cada una y sepáralos con " / ". Una evidencia que no aparece tal cual en la
   hoja de vida hace que el requisito se cuente como no_cumple.
8. palabras_clave_faltantes. Los nombres de tecnologías, herramientas, metodologías y certificaciones que aparecen en la
   oferta (obligatorias o deseables) y que buscar_en_hoja_de_vida no encontró, ni con las otras formas de la regla 3.
   Escríbelos como en la oferta, sin repetir. Incluye los de requisitos parciales por variante (regla 4c): si pide
   React Native y solo tiene React, "React Native" va aquí. Lista vacía si no falta ninguno.
9. que_destacar. Entre 3 y 5 consejos. Cada uno nombra una experiencia, proyecto o logro concreto que ya está en la
   hoja de vida, dice qué requisito de esta oferta responde y por qué conviene ponerlo arriba. Puedes sugerir reordenar o
   reformular lo que ya está; nunca sugieras agregar una habilidad, cargo o dato que la hoja de vida no tiene.
10. advertencias. Una advertencia por cada uno de estos casos, en este orden: cada requisito obligatorio en no_cumple;
    cada idioma o cantidad de años por debajo de lo pedido; cada requisito parcial por falta de datos (regla 4b), diciendo
    qué dato falta. No repitas aquí los deseables que faltan ni los consejos de que_destacar. Lista vacía si no hay ninguno.`;

/** Modelo que usa el agente: ANTHROPIC_MODEL en .env, o el de por defecto. */
export const modeloActual = () => process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

/**
 * Huella del prompt y del esquema de salida. Si cambia cualquiera de los dos, cambia esta versión
 * y los análisis guardados en memoria dejan de reutilizarse (ver src/memoria.ts).
 * La fecha se reemplaza por un marcador para que la versión no cambie cada día.
 */
export const VERSION_PROMPT = huella(instrucciones("{hoy}") + JSON.stringify(z.toJSONSchema(AnalisisSchema)));

/**
 * Topes de un solo análisis, para que una oferta rara no dispare el gasto (ver docs/limite-de-gasto.md).
 * El presupuesto por día y por mes está en src/gasto.ts.
 */
export const LIMITES_ANALISIS = {
  /** Tokens máximos por respuesta del modelo (el valor que LangChain ya usaba para Sonnet 5.5, ahora explícito). */
  tokensPorRespuesta: 16_384,
  /** Pasos máximos del agente: cada vuelta modelo → herramienta son 2. 25 es el valor que ya usaba LangGraph. */
  pasos: 25,
  /** Tiempo máximo de un análisis completo, con sus reintentos. */
  milisegundos: 180_000,
  /** Largo máximo de los textos: más que esto casi seguro es una página pegada entera, no una oferta. */
  caracteresOferta: 30_000,
  caracteresHojaDeVida: 40_000,
};

export function crearAgente(hojaDeVida: string, modelo = modeloActual()) {
  const hoy = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  return createAgent({
    model: new ChatAnthropic({ model: modelo, maxTokens: LIMITES_ANALISIS.tokensPorRespuesta, maxRetries: 2 }),
    tools: [crearHerramientaBusqueda(lineasDe(hojaDeVida))],
    systemPrompt: instrucciones(hoy),
    responseFormat: providerStrategy(AnalisisSchema),
  });
}

/** Compara la oferta con la hoja de vida y devuelve el análisis verificado y lo que costó. */
export async function analizarOfertaConUso(oferta: string, hojaDeVida: string): Promise<{ resultado: Resultado; uso: Uso }> {
  if (hojaDeVida.trim().length < 50) {
    throw new Error("La hoja de vida casi no tiene texto. Si es un PDF escaneado, usa una versión con texto.");
  }
  if (oferta.trim().length < 50) {
    throw new Error("La oferta casi no tiene texto. Copia la descripción completa del cargo.");
  }
  // No se recorta en silencio: un texto recortado podría perder justo el requisito que importa.
  if (oferta.length > LIMITES_ANALISIS.caracteresOferta) {
    throw new Error(`La oferta tiene ${oferta.length} caracteres (máximo ${LIMITES_ANALISIS.caracteresOferta}). Copia solo la descripción del cargo.`);
  }
  if (hojaDeVida.length > LIMITES_ANALISIS.caracteresHojaDeVida) {
    throw new Error(`La hoja de vida tiene ${hojaDeVida.length} caracteres (máximo ${LIMITES_ANALISIS.caracteresHojaDeVida}).`);
  }

  const salida = await crearAgente(hojaDeVida).invoke(
    { messages: [{ role: "user", content: `Analiza esta oferta para el candidato:\n\n${oferta}` }] },
    { recursionLimit: LIMITES_ANALISIS.pasos, signal: AbortSignal.timeout(LIMITES_ANALISIS.milisegundos) },
  );
  return {
    resultado: completarResultado(AnalisisSchema.parse(salida.structuredResponse), hojaDeVida),
    uso: usoDeMensajes(salida.messages),
  };
}

/** Igual que analizarOfertaConUso, sin el uso. */
export async function analizarOferta(oferta: string, hojaDeVida: string): Promise<Resultado> {
  return (await analizarOfertaConUso(oferta, hojaDeVida)).resultado;
}

/**
 * Analiza solo si cabe en el presupuesto, y anota lo que costó. Es la entrada que usan buscar, analizar y evaluar.
 * Si el análisis falla a mitad de camino (tiempo, pasos), el gasto ya ocurrió: se anota lo estimado.
 */
export async function analizarConPresupuesto(
  oferta: string,
  hojaDeVida: string,
  rutaRegistro = RUTA_GASTO,
): Promise<{ resultado: Resultado; usd: number; estado: Estado }> {
  const limites = leerLimites();
  const registro = await cargarRegistro(rutaRegistro);
  const estado = revisarPresupuesto(registro, limites);
  if (!estado.permitido) throw new PresupuestoAgotado(estado.motivo ?? "límite de gasto");
  try {
    const { resultado, uso } = await analizarOfertaConUso(oferta, hojaDeVida);
    // Un análisis nunca es gratis: si no llegó el uso de tokens, se anota lo estimado para que el límite siga frenando.
    const usd = uso.entrada + uso.salida > 0 ? costoUsd(uso, modeloActual()) : estado.estimado;
    await guardarRegistro(registrarGasto(registro, usd), rutaRegistro);
    return { resultado, usd, estado };
  } catch (error) {
    const yaEmpezo = !(error instanceof Error && /casi no tiene texto|caracteres \(máximo/.test(error.message));
    if (yaEmpezo) await guardarRegistro(registrarGasto(registro, estado.estimado), rutaRegistro);
    throw error;
  }
}
