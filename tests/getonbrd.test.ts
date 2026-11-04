import { afterEach, describe, expect, it, vi } from "vitest";
import { buscarEnGetOnBoard } from "../src/fuentes/getonbrd.js";

afterEach(() => vi.unstubAllGlobals());

const respuestaVacia = () => new Response(JSON.stringify({ data: [], meta: { total_pages: 1 } }), { status: 200 });

describe("buscarEnGetOnBoard", () => {
  it("codifica todos los parámetros de la URL y manda un timeout", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respuestaVacia());
    vi.stubGlobal("fetch", fetchFalso);

    await buscarEnGetOnBoard("next.js & react");

    const [url, init] = fetchFalso.mock.calls[0];
    const parametros = new URL(url).searchParams;
    expect(parametros.get("query")).toBe("next.js & react");
    expect(parametros.get("expand")).toBe('["company"]');
    expect(url).not.toContain('["');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("convierte un timeout en un mensaje claro", async () => {
    const timeout = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));
    await expect(buscarEnGetOnBoard("react")).rejects.toThrow(/tardó más de 15 s.*"react"/);
  });

  it("informa el código si la API responde con error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    await expect(buscarEnGetOnBoard("react")).rejects.toThrow(/respondió 503/);
  });
});
