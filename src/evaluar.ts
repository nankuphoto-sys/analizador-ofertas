import "./iniciar.js";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { analizarConPresupuesto } from "./agente.js";
import { enteroEnRango } from "./argumentos.js";
import { leerDocumento } from "./documentos.js";
import { ENTORNO, RUTAS } from "./entorno.js";
import { cargarRegistro, leerLimites, revisarPresupuesto } from "./gasto.js";
import { puntuar, type Verificacion } from "./puntaje.js";

/**
 * Evaluación: por cada casos/<nombre>.json analiza ofertas/<nombre>.txt contra la hoja de vida
 * indicada, N veces, y mide aciertos, invenciones y consistencia.
 * Uso: npm run evaluar -- 3   (entre 1 y 5 repeticiones)
 */
const MAXIMO_REPETICIONES = 5;
let repeticiones: number;
try {
  repeticiones = enteroEnRango(process.argv[2] ?? "3", "Las repeticiones", 1, MAXIMO_REPETICIONES);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
// La evaluación usa hojas de vida ficticias y gasta de verdad: no debe sumarse al gasto ni a la llave de producción.
if (ENTORNO === "production") {
  console.error("La evaluación no corre en producción: gastaría el presupuesto real con hojas de vida ficticias. Usa npm run evaluar (entorno de pruebas).");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error(`Falta ANTHROPIC_API_KEY en ${RUTAS.env}`);
  process.exit(1);
}

interface Caso {
  hoja_de_vida: string;
  verificaciones: Verificacion[];
}

const casos = (await readdir("casos")).filter((f) => f.endsWith(".json")).sort();

// Antes de gastar nada: ¿cabe la evaluación completa en el presupuesto? Si no, mejor no empezar
// que quedar a medias con la mitad pagada y sin resultado comparable.
{
  const limites = leerLimites();
  const estado = revisarPresupuesto(await cargarRegistro(), limites);
  const necesarios = casos.length * repeticiones;
  const estimado = necesarios * estado.estimado;
  const disponible = Math.min(limites.dia - estado.hoy, limites.mes - estado.mes);
  console.log(`Evaluación: ${necesarios} análisis, unos US$ ${estimado.toFixed(2)}. Disponible hoy: US$ ${disponible.toFixed(2)}.`);
  if (estimado > disponible) {
    console.error("No alcanza el presupuesto para la evaluación completa. Usa menos repeticiones o sube LIMITE_USD_DIA / LIMITE_USD_MES en .env.");
    process.exit(1);
  }
}
const pct = (x: number) => `${Math.round(x * 100)} %`;
const filas: string[] = [];
let totalAciertos = 0;
let totalVerificaciones = 0;
let totalInvenciones = 0;
let totalRechazadas = 0;
let totalConsejos = 0;
let totalConsejosQuitados = 0;

for (const archivo of casos) {
  const nombre = archivo.replace(/\.json$/, "");
  const caso: Caso = JSON.parse(await readFile(join("casos", archivo), "utf8"));
  const [oferta, hojaDeVida] = await Promise.all([
    leerDocumento(join("ofertas", `${nombre}.txt`)),
    leerDocumento(caso.hoja_de_vida),
  ]);

  const aciertos: number[] = [];
  const encajes: number[] = [];
  let invenciones = 0;
  let rechazadas = 0;

  for (let i = 1; i <= repeticiones; i++) {
    const { resultado } = await analizarConPresupuesto(oferta, hojaDeVida);
    const p = puntuar(resultado.requisitos, caso.verificaciones);
    aciertos.push(p.aciertos / p.total);
    encajes.push(resultado.encaje);
    invenciones += p.invenciones;
    rechazadas += resultado.evidencias_rechazadas.length;
    totalAciertos += p.aciertos;
    totalVerificaciones += p.total;
    // Consejos de "qué destacar": cuántos quedaron y cuántos se quitaron por cita inventada (docs/regla-no-inventar.md).
    const quitados = Number(/Se quitaron (\d+) consejo/.exec(resultado.advertencias.join(" "))?.[1] ?? 0);
    totalConsejos += resultado.que_destacar.length;
    totalConsejosQuitados += quitados;
    console.log(
      `${nombre} · intento ${i}: ${p.aciertos}/${p.total} correctos · encaje ${resultado.encaje} % · ` +
        `consejos ${resultado.que_destacar.length} (quitados ${quitados})`,
    );
    for (const e of p.errores) console.log(`   - ${e}`);
    for (const r of resultado.evidencias_rechazadas) console.log(`   · evidencia rechazada por la verificación: ${r}`);
  }

  totalInvenciones += invenciones;
  totalRechazadas += rechazadas;
  const media = aciertos.reduce((a, b) => a + b, 0) / aciertos.length;
  const rango = Math.min(...encajes) === Math.max(...encajes) ? `${encajes[0]} %` : `${Math.min(...encajes)}–${Math.max(...encajes)} %`;
  filas.push(`| ${nombre} | ${pct(media)} | ${invenciones} | ${rechazadas} | ${rango} |`);
}

console.log(`\n| Oferta | Requisitos bien clasificados | Invenciones | Evidencias rechazadas | Encaje (${repeticiones} intentos) |`);
console.log("| --- | --- | --- | --- | --- |");
for (const f of filas) console.log(f);
console.log(
  `\nTotal: ${totalAciertos}/${totalVerificaciones} requisitos bien clasificados, ${totalInvenciones} invenciones, ` +
    `${totalRechazadas} evidencias rechazadas por la verificación, ` +
    `${totalConsejos} consejos válidos y ${totalConsejosQuitados} quitados por cita inventada.`,
);
