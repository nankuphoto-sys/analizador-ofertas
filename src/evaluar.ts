import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { analizarOferta } from "./agente.js";
import { leerDocumento } from "./documentos.js";
import { puntuar, type Verificacion } from "./puntaje.js";

/**
 * Evaluación: por cada casos/<nombre>.json analiza ofertas/<nombre>.txt contra la hoja de vida
 * indicada, N veces, y mide aciertos, invenciones y consistencia.
 * Uso: npm run evaluar -- 3
 */
const repeticiones = Number(process.argv[2] ?? 3);
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Falta ANTHROPIC_API_KEY en .env");
  process.exit(1);
}

interface Caso {
  hoja_de_vida: string;
  verificaciones: Verificacion[];
}

const casos = (await readdir("casos")).filter((f) => f.endsWith(".json")).sort();
const pct = (x: number) => `${Math.round(x * 100)} %`;
const filas: string[] = [];
let totalAciertos = 0;
let totalVerificaciones = 0;
let totalInvenciones = 0;
let totalRechazadas = 0;

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
    const resultado = await analizarOferta(oferta, hojaDeVida);
    const p = puntuar(resultado.requisitos, caso.verificaciones);
    aciertos.push(p.aciertos / p.total);
    encajes.push(resultado.encaje);
    invenciones += p.invenciones;
    rechazadas += resultado.evidencias_rechazadas.length;
    totalAciertos += p.aciertos;
    totalVerificaciones += p.total;
    console.log(`${nombre} · intento ${i}: ${p.aciertos}/${p.total} correctos · encaje ${resultado.encaje} %`);
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
    `${totalRechazadas} evidencias rechazadas por la verificación.`,
);
