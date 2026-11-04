import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { leerDocumento } from "../src/documentos.js";

describe("leerDocumento", () => {
  it("si el archivo no existe, explica qué hacer en vez de mostrar el error de Node", async () => {
    await expect(leerDocumento("no-existe/tu-cv.pdf")).rejects.toThrow(/No encuentro el archivo "no-existe\/tu-cv\.pdf".*hoja de vida real/);
  });

  it("lee un texto plano", async () => {
    const ruta = join(await mkdtemp(join(tmpdir(), "doc-")), "cv.txt");
    await writeFile(ruta, "  Desarrollador React  \n");
    expect(await leerDocumento(ruta)).toBe("Desarrollador React");
  });
});
