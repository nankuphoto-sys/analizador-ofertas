import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

/** Lee una hoja de vida u oferta en PDF o en texto plano (.txt, .md) y devuelve su texto. */
export async function leerDocumento(ruta: string): Promise<string> {
  let data: Buffer;
  try {
    data = await readFile(ruta);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `No encuentro el archivo "${ruta}". Pon la ruta de tu hoja de vida real (PDF o .txt), por ejemplo: ` +
          `npm run buscar -- mi-hoja-de-vida.pdf. Si el archivo está en otra carpeta, usa la ruta completa entre comillas.`,
      );
    }
    throw error;
  }
  if (!/\.pdf$/i.test(ruta)) return data.toString("utf8").trim();

  const parser = new PDFParse({ data });
  try {
    const resultado = await parser.getText();
    return resultado.pages.map((p) => p.text.trim()).join("\n").trim();
  } finally {
    await parser.destroy();
  }
}
