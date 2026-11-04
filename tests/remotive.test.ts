import { afterEach, describe, expect, it, vi } from "vitest";
import { aOfertaRemotive, buscarEnRemotive, nivelDesdeTitulo, ubicacionDeRemotive } from "../src/fuentes/remotive.js";
import { prefiltrar, ubicacionValida } from "../src/prefiltro.js";

afterEach(() => vi.unstubAllGlobals());

const HV = "Next.js, React, TypeScript, Node.js, Express, PostgreSQL, Prisma, Docker, Git, Vitest";
const ahora = new Date("2026-11-04T12:00:00Z");

const item = (extra: Record<string, unknown> = {}) => ({
  id: 123,
  url: "https://remotive.com/remote-jobs/software-dev/junior-react-developer-123",
  title: "Junior React Developer",
  company_name: "Acme",
  publication_date: "2026-11-02T10:23:26",
  candidate_required_location: "Worldwide",
  salary: "$30,000 - $40,000",
  description: "<p>Construye interfaces con <b>React</b> y TypeScript. API en Node.js.</p>",
  ...extra,
});

describe("nivelDesdeTitulo", () => {
  it("deduce el nivel del título", () => {
    expect(nivelDesdeTitulo("Trainee Developer")).toBe(1);
    expect(nivelDesdeTitulo("Junior React Developer")).toBe(2);
    expect(nivelDesdeTitulo("Jr. Backend Engineer")).toBe(2);
    expect(nivelDesdeTitulo("Mid-Level Full Stack Developer")).toBe(3);
    expect(nivelDesdeTitulo("Semi Senior Node.js Developer")).toBe(3);
    expect(nivelDesdeTitulo("Senior Frontend Engineer")).toBe(4);
    expect(nivelDesdeTitulo("Staff Software Engineer")).toBe(4);
  });

  it("semi senior no cuenta como senior, y sin pistas es 0", () => {
    expect(nivelDesdeTitulo("Semi-Senior Developer")).toBe(3);
    expect(nivelDesdeTitulo("Full Stack Developer")).toBe(0);
  });
});

describe("ubicacionDeRemotive", () => {
  it("Worldwide es remoto desde cualquier país", () => {
    expect(ubicacionDeRemotive("Worldwide")).toEqual({ modalidad: "fully_remote", paises: [] });
    expect(ubicacionDeRemotive("Anywhere in the World")).toEqual({ modalidad: "fully_remote", paises: [] });
  });

  it("una restricción queda como remoto desde esos países", () => {
    expect(ubicacionDeRemotive("USA Only")).toEqual({ modalidad: "remote_local", paises: ["USA Only"] });
    expect(ubicacionDeRemotive("LATAM, Spain")).toEqual({ modalidad: "remote_local", paises: ["LATAM", "Spain"] });
  });

  it("vacío no se asume abierto: se deja para verificar a mano", () => {
    expect(ubicacionDeRemotive("")).toEqual({ modalidad: "remote_local", paises: [] });
    expect(ubicacionDeRemotive(undefined)).toEqual({ modalidad: "remote_local", paises: [] });
  });
});

describe("aOfertaRemotive", () => {
  it("convierte al formato común, con id con prefijo y el enlace original", () => {
    const o = aOfertaRemotive(item())!;
    expect(o).toMatchObject({
      id: "remotive-123",
      titulo: "Junior React Developer",
      empresa: "Acme",
      nivel: 2,
      modalidad: "fully_remote",
      salario: "$30,000 - $40,000",
      url: "https://remotive.com/remote-jobs/software-dev/junior-react-developer-123",
    });
    expect(o.publicada.toISOString().slice(0, 10)).toBe("2026-11-02");
    expect(o.texto).toContain("React");
    expect(o.texto).not.toContain("<p>");
  });

  it("sin salario queda null", () => {
    expect(aOfertaRemotive(item({ salary: "" }))!.salario).toBeNull();
  });

  it("descarta ofertas sin lo básico o con fecha inválida", () => {
    expect(aOfertaRemotive(item({ publication_date: "no-es-fecha" }))).toBeNull();
    expect(aOfertaRemotive(item({ url: "" }))).toBeNull();
    expect(aOfertaRemotive(item({ title: "" }))).toBeNull();
  });
});

describe("buscarEnRemotive", () => {
  it("hace una sola petición, de desarrollo, con timeout", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobs: [item(), item({ id: 124 })] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchFalso);

    const ofertas = await buscarEnRemotive();

    expect(ofertas.map((o) => o.id)).toEqual(["remotive-123", "remotive-124"]);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFalso.mock.calls[0];
    expect(new URL(url).searchParams.get("category")).toBe("software-dev");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("ignora las ofertas inválidas sin tumbar el resto", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobs: [item(), item({ id: 9, publication_date: "x" })] }), { status: 200 })));
    expect(await buscarEnRemotive()).toHaveLength(1);
  });

  it("informa el código de error y el formato inesperado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
    await expect(buscarEnRemotive()).rejects.toThrow(/Remotive respondió 429/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ algo: 1 }), { status: 200 })));
    await expect(buscarEnRemotive()).rejects.toThrow(/formato inesperado/);
  });

  it("convierte un timeout en un mensaje claro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "TimeoutError" })));
    await expect(buscarEnRemotive()).rejects.toThrow(/Remotive tardó más de 15 s/);
  });
});

describe("Remotive con el prefiltro", () => {
  it("una oferta junior Worldwide de tu stack pasa", () => {
    const o = aOfertaRemotive(item())!;
    expect(ubicacionValida(o)).toBe("Remoto, cualquier país");
    const c = prefiltrar([o], HV, { niveles: [1, 2], diasMaximo: 30, ahora });
    expect(c).toHaveLength(1);
    expect(c[0].tienes).toEqual(expect.arrayContaining(["React", "TypeScript", "Node.js"]));
  });

  it("«USA Only» queda fuera aunque el stack coincida", () => {
    const o = aOfertaRemotive(item({ candidate_required_location: "USA Only" }))!;
    expect(ubicacionValida(o)).toBeNull();
    expect(prefiltrar([o], HV, { niveles: [1, 2], diasMaximo: 30, ahora })).toHaveLength(0);
  });

  it("LATAM sí se puede postular desde Colombia", () => {
    const o = aOfertaRemotive(item({ candidate_required_location: "LATAM" }))!;
    expect(ubicacionValida(o)).toBe("Remoto (menciona LATAM/Colombia)");
  });

  it("sin nivel en el título solo entra como relleno (nivel 0)", () => {
    const o = aOfertaRemotive(item({ title: "Full Stack Developer" }))!;
    expect(o.nivel).toBe(0);
    expect(prefiltrar([o], HV, { niveles: [1, 2], diasMaximo: 30, ahora })).toHaveLength(0);
    expect(prefiltrar([o], HV, { niveles: [3, 0], diasMaximo: 30, ahora })).toHaveLength(1);
  });
});
