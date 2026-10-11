import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

/** Lee una hoja de vida u oferta en PDF o en texto plano (.txt, .md) y devuelve su texto. */
export async function leerDocumento(ruta: string): Promise<string> {
  const data = await readFile(ruta);
  if (!/\.pdf$/i.test(ruta)) return data.toString("utf8").trim();

  const parser = new PDFParse({ data });
  try {
    const resultado = await parser.getText();
    return resultado.pages.map((p) => p.text.trim()).join("\n").trim();
  } finally {
    await parser.destroy();
  }
}
