import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aOfertaGreenhouse,
  buscarEnGreenhouse,
  cargarEmpresas,
  contenidoATexto,
  crearFuenteGreenhouse,
  ubicacionDeGreenhouse,
} from "../src/fuentes/greenhouse.js";
import { prefiltrar, ubicacionValida } from "../src/prefiltro.js";

afterEach(() => vi.unstubAllGlobals());

const HV = "Next.js, React, TypeScript, Node.js, Express, PostgreSQL, Prisma, Docker, Git, Vitest";
const ahora = new Date("2026-11-04T12:00:00Z");

const item = (extra: Record<string, unknown> = {}) => ({
  id: 8012020003,
  title: "Junior Software Engineer",
  absolute_url: "https://job-boards.greenhouse.io/sezzle/jobs/8012020003",
  location: { name: "Colombia, Remote" },
  first_published: "2026-10-28T23:15:32-04:00",
  updated_at: "2026-10-28T23:15:32-04:00",
  company_name: "Sezzle",
  content: "&lt;p&gt;Construye con &lt;strong&gt;React&lt;/strong&gt; y TypeScript. API en Node.js &amp;amp; PostgreSQL.&lt;/p&gt;",
  ...extra,
});

describe("contenidoATexto", () => {
  it("desescapa el HTML que entrega la API y lo limpia", () => {
    expect(contenidoATexto("&lt;p&gt;React &amp;amp; Node&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Git&lt;/li&gt;&lt;/ul&gt;")).toBe("React & Node\n- Git");
    expect(contenidoATexto(undefined)).toBe("");
  });
});

describe("ubicacionDeGreenhouse", () => {
  it("remoto con Colombia o Latam es remoto solo desde esos países", () => {
    expect(ubicacionDeGreenhouse("Colombia, Remote", "x")).toEqual({ modalidad: "remote_local", paises: ["Colombia"], ciudades: [] });
    expect(ubicacionDeGreenhouse("Remote - Colombia", "x").paises).toEqual(["Colombia"]);
    expect(ubicacionDeGreenhouse("Remote - LATAM", "x").paises).toEqual(["LATAM"]);
    expect(ubicacionDeGreenhouse("Remote - Argentina; Remote - Colombia ; Remote - Mexico", "x").paises).toEqual(["Colombia"]);
  });

  it("Colombia sin decir remoto queda como híbrido en esa ciudad", () => {
    expect(ubicacionDeGreenhouse("Bogotá / CUN / Colombia", "Data Analyst - Hybrid")).toEqual({
      modalidad: "hybrid",
      paises: ["Colombia"],
      ciudades: ["Bogotá / CUN / Colombia"],
    });
  });

  it("«CO» de Colorado no es Colombia", () => {
    const r = ubicacionDeGreenhouse("Remote - CO, FL, GA, MA, MD, MN, NJ, NY", "Software Engineer(s)");
    expect(r.paises).not.toContain("Colombia");
    expect(r.modalidad).toBe("remote_local");
  });

  it("Worldwide es remoto desde cualquier país; una ciudad de otro país no sirve", () => {
    expect(ubicacionDeGreenhouse("Remote - Worldwide", "x").modalidad).toBe("fully_remote");
    expect(ubicacionDeGreenhouse("San Francisco, CA", "x").modalidad).toBe("no_remote");
  });
});

describe("aOfertaGreenhouse", () => {
  it("convierte al formato común con id con prefijo y el enlace original", () => {
    const o = aOfertaGreenhouse(item(), "Sezzle")!;
    expect(o).toMatchObject({
      id: "greenhouse-sezzle-8012020003",
      titulo: "Junior Software Engineer",
      empresa: "Sezzle",
      nivel: 2,
      modalidad: "remote_local",
      paises: ["Colombia"],
      salario: null,
      url: "https://job-boards.greenhouse.io/sezzle/jobs/8012020003",
    });
    expect(o.texto).toContain("Ubicación: Colombia, Remote");
    expect(o.texto).toContain("React");
    expect(o.texto).toContain("Node.js & PostgreSQL");
    expect(o.texto).not.toContain("<p>");
  });

  it("acepta la ubicación como texto y usa el token si falta el nombre de la empresa", () => {
    const o = aOfertaGreenhouse(item({ location: "Remote - LATAM", company_name: undefined }), "praxent")!;
    expect(o.empresa).toBe("praxent");
    expect(o.paises).toEqual(["LATAM"]);
  });

  it("descarta vacantes sin lo básico o con fecha inválida", () => {
    expect(aOfertaGreenhouse(item({ first_published: "x", updated_at: "y" }), "t")).toBeNull();
    expect(aOfertaGreenhouse(item({ absolute_url: "" }), "t")).toBeNull();
    expect(aOfertaGreenhouse(item({ title: "" }), "t")).toBeNull();
  });
});

describe("cargarEmpresas", () => {
  const archivo = async (contenido: string) => {
    const dir = await mkdtemp(join(tmpdir(), "gh-"));
    const ruta = join(dir, "empresas.json");
    await writeFile(ruta, contenido);
    return ruta;
  };

  it("lee tokens como texto o como objeto, en minúsculas y sin repetir", async () => {
    const ruta = await archivo(JSON.stringify({ empresas: ["Sezzle", { token: "praxent", nota: "x" }, "sezzle"] }));
    expect(await cargarEmpresas(ruta)).toEqual(["sezzle", "praxent"]);
  });

  it("explica qué está mal", async () => {
    await expect(cargarEmpresas("no-existe.json")).rejects.toThrow(/no encuentro no-existe\.json/);
    await expect(cargarEmpresas(await archivo("{"))).rejects.toThrow(/no es un JSON válido/);
    await expect(cargarEmpresas(await archivo("{}"))).rejects.toThrow(/lista «empresas»/);
    await expect(cargarEmpresas(await archivo(JSON.stringify({ empresas: ["bien", "../mal"] })))).rejects.toThrow(/token no válido.*\.\.\/mal/);
  });

  it("el archivo real del proyecto es válido", async () => {
    const tokens = await cargarEmpresas();
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens).toContain("sezzle");
  });
});

describe("buscarEnGreenhouse", () => {
  it("hace una petición por empresa, pidiendo el contenido, con timeout", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobs: [item(), item({ id: 2 })] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchFalso);

    const ofertas = await buscarEnGreenhouse("sezzle");

    expect(ofertas.map((o) => o.id)).toEqual(["greenhouse-sezzle-8012020003", "greenhouse-sezzle-2"]);
    const [url, init] = fetchFalso.mock.calls[0];
    expect(url).toBe("https://boards-api.greenhouse.io/v1/boards/sezzle/jobs?content=true");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("ignora las inválidas y explica los errores", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobs: [item(), item({ id: 9, first_published: "x", updated_at: "y" })] }), { status: 200 })));
    expect(await buscarEnGreenhouse("sezzle")).toHaveLength(1);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    await expect(buscarEnGreenhouse("nada")).rejects.toThrow(/no existe un tablero.*"nada"/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    await expect(buscarEnGreenhouse("sezzle")).rejects.toThrow(/respondió 503/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ otro: 1 }), { status: 200 })));
    await expect(buscarEnGreenhouse("sezzle")).rejects.toThrow(/formato inesperado/);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "TimeoutError" })));
    await expect(buscarEnGreenhouse("sezzle")).rejects.toThrow(/tardó más de 15 s.*"sezzle"/);
  });
});

describe("fuente Greenhouse", () => {
  const conEmpresas = async (empresas: string[]) => {
    const dir = await mkdtemp(join(tmpdir(), "gh-"));
    const ruta = join(dir, "empresas.json");
    await writeFile(ruta, JSON.stringify({ empresas }));
    return crearFuenteGreenhouse(ruta);
  };

  it("si una empresa falla sigue con las demás", async () => {
    const fuente = await conEmpresas(["malo", "sezzle"]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) =>
        url.includes("/malo/") ? new Response("", { status: 404 }) : new Response(JSON.stringify({ jobs: [item()] }), { status: 200 }),
      ),
    );
    expect(await fuente.buscar([])).toHaveLength(1);
  });

  it("si fallan todas, lanza el error", async () => {
    const fuente = await conEmpresas(["a", "b"]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    await expect(fuente.buscar([])).rejects.toThrow(/ninguna empresa respondió/);
  });

  it("sin empresas no consulta nada", async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    expect(await (await conEmpresas([])).buscar([])).toEqual([]);
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});

describe("Greenhouse con el prefiltro", () => {
  const pasa = (extra: Record<string, unknown>, niveles = [1, 2]) =>
    prefiltrar([aOfertaGreenhouse(item(extra), "sezzle")!], HV, { niveles, diasMaximo: 30, ahora });

  it("una vacante junior remota en Colombia de tu stack pasa", () => {
    const o = aOfertaGreenhouse(item(), "sezzle")!;
    expect(ubicacionValida(o)).toBe("Remoto desde Colombia");
    expect(pasa({})).toHaveLength(1);
  });

  it("remoto en Colorado y otros estados de EE. UU. queda fuera", () => {
    expect(pasa({ location: { name: "Remote - CO, FL, GA, MA, MD, MN, NJ, NY" } })).toHaveLength(0);
  });

  it("«Remote» sin región solo pasa si el texto menciona Latam o Colombia", () => {
    expect(pasa({ location: { name: "Remote" } })).toHaveLength(0);
    expect(pasa({ location: { name: "Remote - International" }, title: "Junior LATAM Software Engineer" })).toHaveLength(1);
  });

  it("híbrido en Bogotá se muestra como híbrido", () => {
    const c = pasa({ location: { name: "Bogotá / CUN / Colombia" }, title: "Junior Software Engineer - Hybrid" });
    expect(c[0].ubicacion).toBe("Híbrido en Bogotá / CUN / Colombia");
  });
});
