import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analizarOferta, modeloActual, VERSION_PROMPT } from "./agente.js";
import { opcionEntera } from "./argumentos.js";
import { leerDocumento } from "./documentos.js";
import type { Resultado } from "./esquema.js";
import { buscarEnGetOnBoard, NIVELES, type Oferta } from "./fuentes/getonbrd.js";
import {
  cargarMemoria,
  claveCache,
  esNueva,
  estaCerrada,
  guardarEnCache,
  guardarMemoria,
  huella,
  leerCache,
  purgarCache,
  registrarVistas,
  usarHojaDeVida,
} from "./memoria.js";
import { prefiltrar, type Candidata } from "./prefiltro.js";
import { celda, nombreReporte } from "./reporte.js";

/**
 * Busca ofertas en Get on Board, se queda con las de nivel junior (y semi senior si hace falta)
 * que se pueden postular desde Colombia, las ordena sin IA por coincidencia con la hoja de vida
 * y analiza con el modelo solo las mejores.
 *
 * Recuerda entre ejecuciones (memoria/memoria.json, ver docs/memoria.md): las ofertas ya vistas, las que
 * descartaste o a las que te postulaste (no vuelven a salir), y los análisis ya hechos (no se pagan dos veces).
 *
 * Uso: npm run buscar -- ruta/hoja-de-vida.pdf [--analizar=5] [--dias=30] [--solo-junior] [--sin-cache]
 *      [--consultas="full stack,react,node,next.js,javascript,typescript,inteligencia artificial"]
 */
const args = process.argv.slice(2);
const opcion = (nombre: string) => args.find((a) => a.startsWith(`--${nombre}=`))?.split("=").slice(1).join("=");
const rutaHojaDeVida = args.find((a) => !a.startsWith("--"));
let cuantasAnalizar: number;
let dias: number;
try {
  cuantasAnalizar = opcionEntera(args, "analizar", 5);
  dias = opcionEntera(args, "dias", 30);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
const soloJunior = args.includes("--solo-junior");
/** Ignora los análisis guardados y vuelve a pedirlos al modelo (los nuevos sí se guardan). */
const sinCache = args.includes("--sin-cache");
const consultas = (opcion("consultas") ?? "full stack,fullstack,react,node,next.js,javascript,typescript,frontend,backend,inteligencia artificial,junior")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

if (!rutaHojaDeVida) {
  console.error("Uso: npm run buscar -- ruta/hoja-de-vida.pdf [--analizar=5] [--dias=30] [--solo-junior] [--sin-cache]");
  process.exit(1);
}
if (cuantasAnalizar > 0 && !process.env.ANTHROPIC_API_KEY) {
  console.error("Falta ANTHROPIC_API_KEY (o usa --analizar=0 para ver solo el filtro sin IA).");
  process.exit(1);
}

const ahora = new Date();
const hojaDeVida = await leerDocumento(rutaHojaDeVida);

// 0. Memoria
const cargada = await cargarMemoria();
if (cargada.aviso) console.warn(cargada.aviso);
const usada = usarHojaDeVida(cargada.memoria, rutaHojaDeVida, hojaDeVida, ahora);
let memoria = usada.memoria;
if (usada.cambio) console.log("Tu hoja de vida cambió desde la última búsqueda: las ofertas se vuelven a analizar con la versión nueva.");
const vigentes = { huellaHojaDeVida: huella(hojaDeVida), versionPrompt: VERSION_PROMPT, modelo: modeloActual() };
memoria = purgarCache(memoria, ahora, vigentes);
const clave = (o: Oferta) => claveCache({ ofertaId: o.id, ...vigentes });

// 1. Descargar
const todas: Oferta[] = [];
let fallidas = 0;
for (const consulta of consultas) {
  try {
    const encontradas = await buscarEnGetOnBoard(consulta);
    todas.push(...encontradas);
    console.log(`"${consulta}": ${encontradas.length} ofertas`);
  } catch (error) {
    fallidas++;
    console.warn(`No se pudo buscar "${consulta}": ${error instanceof Error ? error.message : error}`);
  }
}
// Si ninguna consulta respondió es un problema de conexión, no "no hay ofertas".
if (fallidas === consultas.length) {
  console.error("\nNinguna búsqueda respondió. Revisa tu conexión a internet o si Get on Board está caído.");
  process.exit(1);
}

// Las que ya descartaste o a las que te postulaste no vuelven a salir.
const abiertas = todas.filter((o) => !estaCerrada(memoria, o.id));
const cerradas = new Set(todas.filter((o) => estaCerrada(memoria, o.id)).map((o) => o.id)).size;

// 2. Filtrar sin IA: primero junior y sin experiencia; si hay pocas, se suma semi senior.
let candidatas = prefiltrar(abiertas, hojaDeVida, { niveles: [1, 2], diasMaximo: dias });
const juniors = candidatas.length;
if (!soloJunior && candidatas.length < Math.max(cuantasAnalizar, 5) * 2) {
  candidatas = [...candidatas, ...prefiltrar(abiertas, hojaDeVida, { niveles: [3], diasMaximo: dias })];
}
const nuevas = new Set(candidatas.filter((c) => esNueva(memoria, c.oferta.id)).map((c) => c.oferta.id));
console.log(
  `\n${new Set(todas.map((o) => o.id)).size} ofertas distintas → ${juniors} junior/sin experiencia y ` +
    `${candidatas.length - juniors} semi senior que se pueden postular desde Colombia (últimos ${dias} días). ` +
    `${nuevas.size} nuevas desde la última búsqueda` +
    (cerradas ? `; ${cerradas} ${cerradas === 1 ? "oculta" : "ocultas"} porque ya te postulaste o las descartaste.` : "."),
);
if (candidatas.length === 0) {
  console.log("No hay ofertas que cumplan los filtros. Prueba con --dias=60 o con otras --consultas.");
  process.exit(0);
}

// 3. Analizar. Lo ya analizado (misma oferta, hoja de vida, prompt y modelo) sale de la memoria sin costo,
// para todas las candidatas. El modelo solo se llama para las mejores --analizar que no estén guardadas.
const analisis = new Map<string, Resultado>();
const desdeMemoria = new Set<string>();
if (!sinCache) {
  for (const c of candidatas) {
    const guardado = leerCache(memoria, clave(c.oferta));
    if (guardado) {
      analisis.set(c.oferta.id, guardado);
      desdeMemoria.add(c.oferta.id);
    }
  }
}
const elegidas = candidatas.slice(0, cuantasAnalizar).filter((c) => !analisis.has(c.oferta.id));
const yaGuardadas = Math.min(cuantasAnalizar, candidatas.length) - elegidas.length;
if (yaGuardadas > 0) console.log(`${yaGuardadas} de las mejores ya estaban analizadas: se reutilizan sin gastar créditos.`);
for (const [i, c] of elegidas.entries()) {
  process.stdout.write(`Analizando ${i + 1}/${elegidas.length}: ${c.oferta.titulo}... `);
  try {
    const resultado = await analizarOferta(c.oferta.texto, hojaDeVida);
    analisis.set(c.oferta.id, resultado);
    memoria = guardarEnCache(memoria, clave(c.oferta), { ofertaId: c.oferta.id, publicada: c.oferta.publicada, resultado }, ahora);
    console.log(`${resultado.encaje} %`);
  } catch (error) {
    console.log(`falló (${error instanceof Error ? error.message : error})`);
  }
}

// 4. Reporte
const faltantes = (r: Resultado) =>
  r.requisitos.filter((q) => q.tipo === "obligatorio" && q.estado === "no_cumple").map((q) => q.requisito);
const marca = (id: string) => (nuevas.has(id) ? "🆕 " : "");
const fila = (c: Candidata, i: number) => {
  const r = analisis.get(c.oferta.id);
  const encaje = r ? `**${r.encaje} %**${desdeMemoria.has(c.oferta.id) ? " (guardado)" : ""}` : "sin analizar";
  return `| ${i + 1} | ${marca(c.oferta.id)}[${celda(c.oferta.titulo)}](${c.oferta.url}) | ${celda(c.oferta.empresa)} | ${NIVELES[c.oferta.nivel]} | ${celda(c.ubicacion)} | ${c.oferta.salario ?? "—"} | ${encaje} | ${c.puntaje} |`;
};
const ordenadas = [...candidatas].sort((a, b) => {
  const ea = analisis.get(a.oferta.id)?.encaje ?? -1;
  const eb = analisis.get(b.oferta.id)?.encaje ?? -1;
  return eb - ea || b.puntaje - a.puntaje;
});
const hoy = ahora.toISOString().slice(0, 10);
const lineas = [
  `# Búsqueda de ofertas — ${hoy}`,
  "",
  `Fuente: Get on Board · niveles: junior y sin experiencia${soloJunior ? "" : " (más semi senior si faltaban)"} · últimos ${dias} días · postulables desde Colombia.`,
  "",
  `🆕 = nueva desde la última búsqueda · (guardado) = análisis reutilizado de la memoria, sin costo.`,
  "",
  "| # | Oferta | Empresa | Nivel | Ubicación | Salario | Encaje (IA) | Coincidencia de stack |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...ordenadas.slice(0, 25).map(fila),
  "",
  "## Detalle de las analizadas",
];
for (const c of ordenadas.filter((x) => analisis.has(x.oferta.id))) {
  const r = analisis.get(c.oferta.id)!;
  lineas.push(
    "",
    `### ${marca(c.oferta.id)}${c.oferta.titulo} — ${c.oferta.empresa} (${r.encaje} %)`,
    c.oferta.url,
    "",
    `- **Te falta (obligatorio):** ${faltantes(r).join("; ") || "nada"}`,
    `- **Palabras clave que no tienes:** ${r.palabras_clave_faltantes.join(", ") || "ninguna"}`,
    `- **Qué destacar:** ${r.que_destacar.join(" / ")}`,
    ...(r.advertencias.length ? [`- **Advertencias:** ${r.advertencias.join(" / ")}`] : []),
    `- **Ya te postulaste o no te interesa:** \`npm run oferta -- ${c.oferta.id} postulada\` (o \`descartada\`)`,
  );
}
await mkdir("salidas", { recursive: true });
const destino = join("salidas", nombreReporte(ahora));
await writeFile(destino, lineas.join("\n"));

// 5. Guardar memoria: las candidatas mostradas quedan como vistas, más los análisis nuevos.
memoria = registrarVistas(memoria, candidatas.map((c) => c.oferta), ahora);
if (cargada.escribible) await guardarMemoria(memoria);

console.log("\nMejores resultados:");
for (const [i, c] of ordenadas.slice(0, 10).entries()) {
  const r = analisis.get(c.oferta.id);
  console.log(
    `${String(i + 1).padStart(2)}. ${r ? `${r.encaje} %`.padStart(5) : "  —  "} · ${marca(c.oferta.id)}${NIVELES[c.oferta.nivel]} · ${c.oferta.titulo} — ${c.oferta.empresa}\n      ${c.ubicacion} · ${c.oferta.url}`,
  );
}
console.log(`\nReporte completo en ${destino}`);
