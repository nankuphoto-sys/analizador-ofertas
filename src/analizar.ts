import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { analizarOferta } from "./agente.js";
import { leerDocumento } from "./documentos.js";
import type { Resultado } from "./esquema.js";

const [rutaOferta, rutaHojaDeVida] = process.argv.slice(2);
if (!rutaOferta || !rutaHojaDeVida) {
  console.error("Uso: npm run analizar -- ruta/oferta.txt ruta/hoja-de-vida.pdf");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Falta ANTHROPIC_API_KEY. Copia .env.example como .env y pon tu clave.");
  process.exit(1);
}

const ICONO = { cumple: "✔", parcial: "~", no_cumple: "✘" } as const;

function informe(r: Resultado): string {
  const lineas = [`${r.cargo} — ${r.empresa}`, `Encaje: ${r.encaje} %`, ""];
  for (const tipo of ["obligatorio", "deseable"] as const) {
    const grupo = r.requisitos.filter((q) => q.tipo === tipo);
    if (grupo.length === 0) continue;
    lineas.push(tipo === "obligatorio" ? "Requisitos obligatorios:" : "Deseables:");
    for (const q of grupo) {
      lineas.push(`  ${ICONO[q.estado]} ${q.requisito}${q.evidencia ? `  ← "${q.evidencia}"` : ""}`);
    }
    lineas.push("");
  }
  if (r.palabras_clave_faltantes.length) {
    lineas.push(`Palabras clave de la oferta que no están en tu hoja de vida: ${r.palabras_clave_faltantes.join(", ")}`, "");
  }
  if (r.que_destacar.length) lineas.push("Qué destacar:", ...r.que_destacar.map((d) => `  - ${d}`), "");
  if (r.advertencias.length) lineas.push("Advertencias:", ...r.advertencias.map((a) => `  - ${a}`));
  return lineas.join("\n");
}

try {
  const inicio = Date.now();
  const [oferta, hojaDeVida] = await Promise.all([leerDocumento(rutaOferta), leerDocumento(rutaHojaDeVida)]);
  const resultado = await analizarOferta(oferta, hojaDeVida);
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

  await mkdir("salidas", { recursive: true });
  const destino = join("salidas", basename(rutaOferta).replace(/\.[^.]+$/, "") + ".json");
  await writeFile(destino, JSON.stringify(resultado, null, 2));

  console.log(informe(resultado));
  console.log(`\nListo en ${segundos} s. JSON completo en ${destino}`);
} catch (error) {
  const mensaje = error instanceof Error ? error.message : String(error);
  if (mensaje.includes("401") || mensaje.includes("api-key")) {
    console.error("La API key no es válida. Revisa ANTHROPIC_API_KEY en tu archivo .env.");
  } else {
    console.error(`No se pudo analizar: ${mensaje}`);
  }
  process.exit(1);
}
