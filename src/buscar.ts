import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analizarOferta, modeloActual, VERSION_PROMPT } from "./agente.js";
import { opcionEntera } from "./argumentos.js";
import { leerDocumento } from "./documentos.js";
import type { Resultado } from "./esquema.js";
import { NIVELES, type Oferta } from "./fuentes/getonbrd.js";
import { fuentes } from "./fuentes/index.js";
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
import { aplicarFiltro, ETIQUETA_INGLES, ETIQUETA_PAGO, requisitosDe, type FiltroRequisitos } from "./requisitos.js";

/**
 * Busca ofertas en Get on Board y Remotive (ver src/fuentes/), se queda con las de nivel junior (y semi senior si hace falta)
 * que se pueden postular desde Colombia, las ordena sin IA por coincidencia con la hoja de vida
 * y analiza con el modelo solo las mejores.
 *
 * Recuerda entre ejecuciones (memoria/memoria.json, ver docs/memoria.md): las ofertas ya vistas, las que
 * descartaste o a las que te postulaste (no vuelven a salir), y los análisis ya hechos (no se pagan dos veces).
 *
 * Uso: npm run buscar -- ruta/hoja-de-vida.pdf [--analizar=5] [--dias=30] [--solo-junior] [--sin-cache]
 *      [--consultas="full stack,react,node,next.js,javascript,typescript,inteligencia artificial"]
 *      [--fuentes=getonbrd,remotive,greenhouse] [--sin-ingles[=estricto]] [--en-dolares]
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
/** --sin-ingles: fuera las ofertas que piden inglés. --sin-ingles=estricto: también las escritas en inglés. */
const valorSinIngles = args.find((a) => a === "--sin-ingles" || a.startsWith("--sin-ingles="))?.split("=")[1];
if (args.some((a) => a.startsWith("--sin-ingles")) && valorSinIngles !== undefined && valorSinIngles !== "estricto") {
  console.error(`Valor no válido para --sin-ingles: "${valorSinIngles}". Usa --sin-ingles o --sin-ingles=estricto.`);
  process.exit(1);
}
const filtroRequisitos: FiltroRequisitos = {
  sinIngles: args.some((a) => a.startsWith("--sin-ingles")) ? (valorSinIngles === "estricto" ? "estricto" : "explicito") : undefined,
  soloUsd: args.includes("--en-dolares"),
};
const nombresFuentes = (opcion("fuentes") ?? fuentes.map((f) => f.nombre).join(","))
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

if (!rutaHojaDeVida) {
  console.error("Uso: npm run buscar -- ruta/hoja-de-vida.pdf [--analizar=5] [--dias=30] [--solo-junior] [--sin-cache] [--fuentes=getonbrd,remotive,greenhouse] [--sin-ingles[=estricto]] [--en-dolares]");
  process.exit(1);
}
const desconocidas = nombresFuentes.filter((n) => !fuentes.some((f) => f.nombre === n));
if (desconocidas.length > 0 || nombresFuentes.length === 0) {
  console.error(`Fuente desconocida: ${desconocidas.join(", ") || "(ninguna indicada)"}. Disponibles: ${fuentes.map((f) => f.nombre).join(", ")}.`);
  process.exit(1);
}
const fuentesActivas = fuentes.filter((f) => nombresFuentes.includes(f.nombre));
if (cuantasAnalizar > 0 && !process.env.ANTHROPIC_API_KEY) {
  console.error("Falta ANTHROPIC_API_KEY (o usa --analizar=0 para ver solo el filtro sin IA).");
  process.exit(1);
}

const ahora = new Date();
let hojaDeVida: string;
try {
  hojaDeVida = await leerDocumento(rutaHojaDeVida);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

// 0. Memoria
const cargada = await cargarMemoria();
if (cargada.aviso) console.warn(cargada.aviso);
const usada = usarHojaDeVida(cargada.memoria, rutaHojaDeVida, hojaDeVida, ahora);
let memoria = usada.memoria;
if (usada.cambio) console.log("Tu hoja de vida cambió desde la última búsqueda: las ofertas se vuelven a analizar con la versión nueva.");
const vigentes = { huellaHojaDeVida: huella(hojaDeVida), versionPrompt: VERSION_PROMPT, modelo: modeloActual() };
memoria = purgarCache(memoria, ahora, vigentes);
const clave = (o: Oferta) => claveCache({ ofertaId: o.id, ...vigentes });

// 1. Descargar de cada fuente. Si una falla, las demás siguen.
const todas: Oferta[] = [];
let fuentesFallidas = 0;
for (const fuente of fuentesActivas) {
  console.log(`${fuente.etiqueta}:`);
  try {
    const encontradas = await fuente.buscar(consultas);
    todas.push(...encontradas);
    console.log(`  ${encontradas.length} ofertas en total`);
  } catch (error) {
    fuentesFallidas++;
    console.warn(`  No se pudo buscar en ${fuente.etiqueta}: ${error instanceof Error ? error.message : error}`);
  }
}
// Si ninguna fuente respondió es un problema de conexión, no "no hay ofertas".
if (fuentesFallidas === fuentesActivas.length) {
  console.error("\nNinguna fuente respondió. Revisa tu conexión a internet o si los sitios están caídos.");
  process.exit(1);
}

// Las que ya descartaste o a las que te postulaste no vuelven a salir.
const abiertas = todas.filter((o) => !estaCerrada(memoria, o.id));
const cerradas = new Set(todas.filter((o) => estaCerrada(memoria, o.id)).map((o) => o.id)).size;

// Inglés y dólares (opcionales): se aplican antes del filtro de nivel y stack.
const porRequisitos = aplicarFiltro(abiertas, filtroRequisitos);
if (filtroRequisitos.sinIngles || filtroRequisitos.soloUsd) {
  console.log(
    `Filtros pedidos${filtroRequisitos.sinIngles ? ` · sin inglés${filtroRequisitos.sinIngles === "estricto" ? " (estricto)" : ""}` : ""}${filtroRequisitos.soloUsd ? " · pago en dólares" : ""}: ` +
      `${porRequisitos.porIngles} salen por pedir inglés y ${porRequisitos.porPago} por no decir que pagan en dólares.`,
  );
}

// 2. Filtrar sin IA: primero junior y sin experiencia; si hay pocas, se suma semi senior.
let candidatas = prefiltrar(porRequisitos.aceptadas, hojaDeVida, { niveles: [1, 2], diasMaximo: dias });
const juniors = candidatas.length;
if (!soloJunior && candidatas.length < Math.max(cuantasAnalizar, 5) * 2) {
  // El nivel 0 son ofertas cuya fuente no dice el nivel (Remotive a veces): entran solo como relleno, igual que semi senior.
  candidatas = [...candidatas, ...prefiltrar(porRequisitos.aceptadas, hojaDeVida, { niveles: [3, 0], diasMaximo: dias })];
}
const nuevas = new Set(candidatas.filter((c) => esNueva(memoria, c.oferta.id)).map((c) => c.oferta.id));
console.log(
  `\n${new Set(todas.map((o) => o.id)).size} ofertas distintas → ${juniors} junior/sin experiencia y ` +
    `${candidatas.length - juniors} semi senior o sin nivel indicado que se pueden postular desde Colombia (últimos ${dias} días). ` +
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
  const req = requisitosDe(c.oferta);
  return `| ${i + 1} | ${marca(c.oferta.id)}[${celda(c.oferta.titulo)}](${c.oferta.url}) | ${celda(c.oferta.empresa)} | ${NIVELES[c.oferta.nivel]} | ${celda(c.ubicacion)} | ${c.oferta.salario ?? "—"} | ${ETIQUETA_PAGO[req.pago]} | ${ETIQUETA_INGLES[req.ingles]} | ${encaje} | ${c.puntaje} |`;
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
  `Fuentes: ${fuentesActivas.map((f) => f.etiqueta).join(", ")} · niveles: junior y sin experiencia${soloJunior ? "" : " (más semi senior o sin nivel indicado si faltaban)"} · últimos ${dias} días · postulables desde Colombia.`,
  "",
  ...fuentesActivas.flatMap((f) => (f.atribucion ? [f.atribucion, ""] : [])),
  `🆕 = nueva desde la última búsqueda · (guardado) = análisis reutilizado de la memoria, sin costo.`,
  "",
  "Pago e Inglés se deducen del texto de la oferta: «no lo dice» no significa que no se pida inglés ni que no paguen en dólares; confírmalo en la oferta.",
  "",
  "| # | Oferta | Empresa | Nivel | Ubicación | Salario | Pago | Inglés | Encaje (IA) | Coincidencia de stack |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
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
