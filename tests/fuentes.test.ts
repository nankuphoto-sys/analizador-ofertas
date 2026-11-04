import { afterEach, describe, expect, it, vi } from "vitest";
import { fuentes } from "../src/fuentes/index.js";
import { fuenteGetOnBoard } from "../src/fuentes/getonbrd.js";

afterEach(() => vi.unstubAllGlobals());

describe("registro de fuentes", () => {
  it("tiene nombres únicos, en minúsculas y sin espacios (se usan en --fuentes=)", () => {
    const nombres = fuentes.map((f) => f.nombre);
    expect(new Set(nombres).size).toBe(nombres.length);
    for (const n of nombres) expect(n).toMatch(/^[a-z0-9-]+$/);
    expect(nombres).toEqual(expect.arrayContaining(["getonbrd", "remotive"]));
  });

  it("Remotive declara su atribución para el reporte", () => {
    expect(fuentes.find((f) => f.nombre === "remotive")?.atribucion).toMatch(/Remotive/);
  });
});

describe("fuenteGetOnBoard", () => {
  const vacia = () => new Response(JSON.stringify({ data: [], meta: { total_pages: 1 } }), { status: 200 });

  it("si una palabra falla, sigue con las demás", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(vacia()));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(fuenteGetOnBoard.buscar(["react", "node"])).resolves.toEqual([]);
  });

  it("si fallan todas, lanza el error (problema de conexión)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(fuenteGetOnBoard.buscar(["react", "node"])).rejects.toThrow(/ninguna búsqueda respondió/);
  });
});
