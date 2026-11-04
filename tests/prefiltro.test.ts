import { describe, expect, it } from "vitest";
import { htmlATexto, type Oferta } from "../src/fuentes/getonbrd.js";
import { prefiltrar, stackDe, tecnologiasEn, TITULO_AJENO, TITULO_DESARROLLO, TITULO_SENIOR, ubicacionValida } from "../src/prefiltro.js";

const HV = "Next.js, React, TypeScript, Node.js, Express, PostgreSQL, Prisma, Docker, Git, Vitest";
const ahora = new Date("2026-10-16T12:00:00Z");

const oferta = (o: Partial<Oferta>): Oferta => ({
  id: "x",
  titulo: "Desarrollador Full Stack",
  empresa: "Ejemplo",
  nivel: 2,
  modalidad: "fully_remote",
  paises: ["Remote"],
  ciudades: [],
  publicada: new Date("2026-10-10T12:00:00Z"),
  salario: null,
  url: "https://ejemplo",
  texto: "Buscamos React, TypeScript y Node.js con PostgreSQL.",
  ...o,
});

describe("htmlATexto", () => {
  it("quita etiquetas y decodifica entidades", () => {
    expect(htmlATexto("<p>React &amp; Node</p><ul><li>Git</li></ul>")).toBe("React & Node\n- Git");
  });
});

describe("tecnologiasEn", () => {
  it("no confunde Java con JavaScript ni SQL con MySQL", () => {
    expect(tecnologiasEn("Experiencia en JavaScript y MySQL")).toEqual(["JavaScript", "MySQL"]);
  });
});

describe("ubicacionValida", () => {
  it("acepta remoto global, remoto o presencial en Colombia, y descarta otros países", () => {
    expect(ubicacionValida(oferta({}))).toBe("Remoto, cualquier país");
    expect(ubicacionValida(oferta({ modalidad: "hybrid", paises: ["Colombia"], ciudades: ["Bogotá"] }))).toBe("Híbrido en Bogotá");
    expect(ubicacionValida(oferta({ modalidad: "hybrid", paises: ["Chile"] }))).toBeNull();
  });

  it("remoto local: descarta si lista países sin Colombia, y pide verificar si no lista ninguno", () => {
    const remotoLocal = (o: Partial<Oferta>) => ubicacionValida(oferta({ modalidad: "remote_local", texto: "React y Node.js", ...o }));
    expect(remotoLocal({ paises: ["Chile"] })).toBeNull();
    expect(remotoLocal({ paises: ["Chile", "Colombia"] })).toBe("Remoto desde Colombia");
    expect(remotoLocal({ paises: ["Chile"], texto: "Abierto a toda LATAM" })).toBe("Remoto (menciona LATAM/Colombia)");
    expect(remotoLocal({ paises: [] })).toBe("Remoto local: verifica si acepta Colombia");
  });
});

describe("TITULO_DESARROLLO", () => {
  it.each([
    "Desarrollador Full Stack",
    "Desarrolladora Frontend",
    "Back-End Developer",
    "Full-Stack Engineer",
    "Programador Web",
    "Ingeniero de Software",
    "Ingeniera de Desarrollo Full Stack",
  ])("acepta '%s'", (titulo) => expect(TITULO_DESARROLLO.test(titulo)).toBe(true));

  it.each(["Ingeniero Comercial", "Analista Back Office", "Ejecutivo de Ventas", "Webmaster de contenidos", "Feedback Specialist"])(
    "descarta '%s'",
    (titulo) => expect(TITULO_DESARROLLO.test(titulo)).toBe(false),
  );
});

describe("TITULO_AJENO", () => {
  it.each([
    "Security Engineer (Ingeniero/a de Seguridad)",
    "Vulnerability Management Engineer",
    "Site Reliability Engineer",
    "SRE - Platform",
    "DevOps Engineer",
    "Data Engineer II, Credit Reporting",
    "Solutions Engineer",
    "Support Engineer",
    "Ingeniero de Datos",
  ])("marca '%s' como ajeno", (titulo) => expect(TITULO_AJENO.test(titulo)).toBe(true));

  it.each(["AI Workflow Engineer | LATAM", "Software Engineer, Open Source AI", "Desarrollador Full-Stack Jr", "Front-end Developer (React)"])(
    "no marca '%s'",
    (titulo) => expect(TITULO_AJENO.test(titulo)).toBe(false),
  );
});

describe("stackDe", () => {
  it("suma lo que implica cada tecnología de la hoja de vida", () => {
    const stack = stackDe("Next.js, PostgreSQL, Express");
    expect([...stack]).toEqual(expect.arrayContaining(["React", "SQL", "Node.js"]));
  });

  it("una oferta que pide SQL no lo marca como faltante si sabes PostgreSQL", () => {
    const [c] = prefiltrar([oferta({ texto: "React, Node.js y SQL" })], HV, { niveles: [2], diasMaximo: 30, ahora });
    expect(c.tienes).toContain("SQL");
    expect(c.teFalta).not.toContain("SQL");
  });
});

describe("TECNOLOGIAS", () => {
  it("'spring' suelto (la palabra en inglés) no cuenta como Java", () => {
    expect(tecnologiasEn("We hire in spring")).not.toContain("Java");
    expect(tecnologiasEn("Spring Boot")).toContain("Java");
  });
});

describe("TITULO_SENIOR", () => {
  it.each([
    "Senior Full Stack Developer",
    "Sr. Frontend Developer",
    "Tech Lead",
    "Líder técnico",
    "Arquitecto de Software",
    "Arquitecta de soluciones",
    "Software Architect",
    "Engineering Manager",
  ])("descarta '%s'", (titulo) => expect(TITULO_SENIOR.test(titulo)).toBe(true));

  it.each([
    "Desarrollador Full Stack Semi Senior",
    "Desarrollador Full Stack Semi-Senior",
    "Desarrollador Semisenior",
    "Desarrollador Full Stack SSr",
    "Desarrollador React (Staff Augmentation)",
  ])("no descarta '%s'", (titulo) => expect(TITULO_SENIOR.test(titulo)).toBe(false));
});

describe("prefiltrar", () => {
  const filtrar = (ofertas: Oferta[], niveles = [1, 2, 3]) => prefiltrar(ofertas, HV, { niveles, diasMaximo: 30, ahora });

  it("descarta senior por nivel o por título, ofertas viejas y cargos que no son de desarrollo", () => {
    const r = filtrar([
      oferta({ id: "ok" }),
      oferta({ id: "nivel", nivel: 4 }),
      oferta({ id: "titulo", titulo: "Senior Full Stack Developer" }),
      oferta({ id: "vieja", publicada: new Date("2026-08-01") }),
      oferta({ id: "ventas", titulo: "Ejecutivo comercial", texto: "Vender software con React y Node.js" }),
    ]);
    expect(r.map((c) => c.oferta.id)).toEqual(["ok"]);
  });

  it("conserva las semi senior aunque lo digan en el título", () => {
    const r = filtrar([oferta({ id: "ssr", nivel: 3, titulo: "Desarrollador Full Stack Semi Senior" })], [3]);
    expect(r.map((c) => c.oferta.id)).toEqual(["ssr"]);
  });

  it("exige al menos 2 tecnologías de tu stack y ordena por coincidencia", () => {
    const r = filtrar([
      oferta({ id: "java", titulo: "Desarrollador Java", texto: "Java, Spring Boot y Git" }),
      oferta({ id: "parcial", texto: "React, TypeScript, Angular y .NET Core" }),
      oferta({ id: "total", texto: "React, TypeScript, Node.js y PostgreSQL" }),
    ]);
    expect(r.map((c) => c.oferta.id)).toEqual(["total", "parcial"]);
    expect(r[1].teFalta).toEqual(expect.arrayContaining(["Angular", ".NET"]));
  });

  it("da un extra a las ofertas junior", () => {
    const [junior, semi] = filtrar([oferta({ id: "j", nivel: 2 }), oferta({ id: "s", nivel: 3 })]);
    expect(junior.oferta.id).toBe("j");
    expect(junior.puntaje).toBeGreaterThan(semi.puntaje);
  });
});

describe("prefiltrar: cargos que no son de desarrollo", () => {
  const dev = { texto: "React, TypeScript y Node.js con PostgreSQL." };
  const ids = (titulos: string[]) =>
    prefiltrar(
      titulos.map((titulo, i) => oferta({ id: `o${i}`, titulo, ...dev })),
      HV,
      { niveles: [2], diasMaximo: 30, ahora },
    ).map((c) => c.oferta.titulo);

  it("deja fuera seguridad, SRE, datos y preventa aunque digan engineer", () => {
    expect(ids(["Security Engineer", "Site Reliability Engineer", "Data Engineer II", "Solutions Engineer", "Full-Stack Engineer"])).toEqual([
      "Full-Stack Engineer",
    ]);
  });

  it("conserva el cargo si el título dice claramente que es de desarrollo", () => {
    expect(ids(["Full-Stack Developer, Security Tools"])).toEqual(["Full-Stack Developer, Security Tools"]);
  });
});
