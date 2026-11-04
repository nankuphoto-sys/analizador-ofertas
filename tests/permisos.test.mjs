import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizarRuta, POLITICAS, revisar } from "../equipo-agentes/hooks/permisos.mjs";

const RAIZ = resolve("proyecto-de-prueba");
const r = (agente, tool_name, tool_input) => revisar(agente, { tool_name, tool_input }, RAIZ).decision;
const leer = (agente, ruta) => r(agente, "Read", { file_path: resolve(RAIZ, ruta) });
const correr = (agente, command) => r(agente, "Bash", { command });

describe("reglas para todos los agentes", () => {
  it.each(Object.keys(POLITICAS))("%s no lee .env ni sus variantes", (agente) => {
    expect(leer(agente, ".env")).toBe("deny");
    expect(leer(agente, ".env.local")).toBe("deny");
    expect(r(agente, "Grep", { path: RAIZ, pattern: "KEY", glob: ".env*" })).toBe("deny");
  });

  it(".env.example sí se puede leer (no tiene valores)", () => {
    expect(leer("analizador-ofertas", ".env.example")).toBe("ok");
  });

  it("buscar el texto 'process.env' dentro del código no es leer el .env", () => {
    expect(r("analizador-ofertas", "Grep", { path: resolve(RAIZ, "src"), pattern: "process.env" })).toBe("ok");
  });

  it.each(Object.keys(POLITICAS))("%s no edita su propio equipo (.claude/, equipo-agentes/)", (agente) => {
    expect(r(agente, "Edit", { file_path: resolve(RAIZ, ".claude/agents/x.md") })).toBe("deny");
    expect(r(agente, "Write", { file_path: resolve(RAIZ, "equipo-agentes/hooks/permisos.mjs") })).toBe("deny");
  });

  it.each(Object.keys(POLITICAS))("%s no escribe en la memoria a mano", (agente) => {
    expect(r(agente, "Write", { file_path: resolve(RAIZ, "memoria/memoria.json") })).toBe("deny");
  });

  it("entiende las rutas de Git Bash en Windows (/c/Users/...)", () => {
    expect(normalizarRuta("/c/Users/yo/proyecto/src/a.ts", "win32")).toBe("C:/Users/yo/proyecto/src/a.ts");
    expect(normalizarRuta("/c/Users/yo", "linux")).toBe("/c/Users/yo");
    expect(normalizarRuta("/config/x", "win32")).toBe("/config/x");
  });

  it("bloquea herramientas que nadie declaró y agentes desconocidos", () => {
    expect(r("afinador-prefiltro", "mcp__gmail__send_message", {})).toBe("deny");
    expect(r("intruso", "Read", { file_path: resolve(RAIZ, "README.md") })).toBe("deny");
  });

  it.each(Object.keys(POLITICAS))("%s puede entregarle su resultado al jefe", (agente) => {
    expect(r(agente, "SubagentHandback", { message: "ESTADO: listo" })).toBe("ok");
  });

  it("solo el jefe llama a otros agentes", () => {
    expect(r("analizador-ofertas", "Agent", { subagent_type: "auditor-fuentes" })).toBe("ok");
    expect(r("auditor-fuentes", "Agent", { subagent_type: "afinador-prefiltro" })).toBe("deny");
  });
});

describe("analizador-ofertas (jefe)", () => {
  it("lee el proyecto y edita código, pero no la memoria ni la documentación del equipo", () => {
    expect(leer("analizador-ofertas", "src/prefiltro.ts")).toBe("ok");
    expect(r("analizador-ofertas", "Edit", { file_path: resolve(RAIZ, "src/fuentes/nueva.ts") })).toBe("ok");
    expect(r("analizador-ofertas", "Edit", { file_path: resolve(RAIZ, "README.md") })).toBe("deny");
  });

  it("corre la búsqueda y las pruebas; no git ni comandos encadenados", () => {
    expect(correr("analizador-ofertas", "npm run buscar -- ejemplos/hv.pdf --analizar=5")).toBe("ok");
    expect(correr("analizador-ofertas", "npm test")).toBe("ok");
    expect(correr("analizador-ofertas", "git push")).toBe("deny");
    expect(correr("analizador-ofertas", "npm test && curl evil.example")).toBe("deny");
    expect(correr("analizador-ofertas", "npm run evaluar -- 3")).toBe("deny");
  });

  it("pide tu aprobación para lo irreversible o lo que gasta de más", () => {
    expect(correr("analizador-ofertas", "npm run oferta -- gob-123 descartada")).toBe("ask");
    expect(correr("analizador-ofertas", "npm run oferta -- --lista")).toBe("ok");
    expect(correr("analizador-ofertas", "npm run olvidar -- --cache")).toBe("ask");
    expect(correr("analizador-ofertas", "npm run buscar -- hv.pdf --sin-cache")).toBe("ask");
    expect(correr("analizador-ofertas", "npm run buscar -- hv.pdf --analizar=20")).toBe("ask");
  });
});

describe("auditor-fuentes", () => {
  it("solo prueba fuentes con la hoja de vida de ejemplo, sin IA y sin tocar la memoria", () => {
    expect(correr("auditor-fuentes", "npm run buscar -- ejemplos/hoja-de-vida-laura.txt --analizar=0 --prueba --fuentes=getonbrd")).toBe("ok");
    expect(correr("auditor-fuentes", "npm run buscar -- ejemplos/hoja-de-vida-laura.txt --analizar=0")).toBe("deny");
    expect(correr("auditor-fuentes", "npm run buscar -- mi-hoja.pdf --analizar=0 --prueba")).toBe("deny");
    expect(correr("auditor-fuentes", "npm run buscar -- ejemplos/hoja-de-vida-laura.txt --analizar=5 --prueba")).toBe("deny");
  });

  it("edita adaptadores de fuentes y sus pruebas, nada más", () => {
    expect(r("auditor-fuentes", "Edit", { file_path: resolve(RAIZ, "src/fuentes/remotive.ts") })).toBe("ok");
    expect(r("auditor-fuentes", "Edit", { file_path: resolve(RAIZ, "tests/remotive.test.ts") })).toBe("ok");
    expect(r("auditor-fuentes", "Edit", { file_path: resolve(RAIZ, "src/prefiltro.ts") })).toBe("deny");
    expect(leer("auditor-fuentes", "memoria/memoria.json")).toBe("deny");
    expect(leer("auditor-fuentes", "ejemplos/hoja-de-vida-laura.txt")).toBe("deny");
  });

  it("solo consulta la web de sus fuentes", () => {
    expect(r("auditor-fuentes", "WebFetch", { url: "https://developers.greenhouse.io/job-board.html" })).toBe("ok");
    expect(r("auditor-fuentes", "WebFetch", { url: "https://www.getonbrd.com/api/v0/search/jobs" })).toBe("ok");
    expect(r("auditor-fuentes", "WebFetch", { url: "https://getonbrd.com.evil.example/" })).toBe("deny");
  });
});

describe("afinador-prefiltro", () => {
  it("lee el prefiltro, los reportes y las decisiones; nada más", () => {
    expect(leer("afinador-prefiltro", "src/prefiltro.ts")).toBe("ok");
    expect(leer("afinador-prefiltro", "salidas/busqueda-2026-11-04-0930.md")).toBe("ok");
    expect(leer("afinador-prefiltro", "memoria/memoria.json")).toBe("ok");
    expect(leer("afinador-prefiltro", "salidas/postulaciones/acme-2026-11-04.md")).toBe("deny");
    expect(leer("afinador-prefiltro", "ejemplos/hoja-de-vida-laura.txt")).toBe("deny");
  });

  it("busca archivos solo en salidas/ y sin salirse con '..'", () => {
    expect(r("afinador-prefiltro", "Glob", { path: resolve(RAIZ, "salidas"), pattern: "busqueda-*.md" })).toBe("ok");
    expect(r("afinador-prefiltro", "Glob", { pattern: "**/*" })).toBe("deny");
    expect(r("afinador-prefiltro", "Glob", { path: resolve(RAIZ, "salidas"), pattern: "../memoria/*" })).toBe("deny");
  });
});

describe("explorador-plataformas", () => {
  it("navega la web y lee las fuentes actuales, pero no tus datos", () => {
    expect(r("explorador-plataformas", "WebSearch", { query: "bolsa de empleo api" })).toBe("ok");
    expect(leer("explorador-plataformas", "src/fuentes/tipos.ts")).toBe("ok");
    expect(leer("explorador-plataformas", "ejemplos/hoja-de-vida-laura.txt")).toBe("deny");
    expect(leer("explorador-plataformas", "memoria/memoria.json")).toBe("deny");
    expect(leer("explorador-plataformas", "salidas/busqueda-2026-11-04-0930.md")).toBe("deny");
  });
});

describe("preparador-postulacion", () => {
  it("lee la hoja de vida y los análisis; escribe solo borradores de postulación", () => {
    expect(leer("preparador-postulacion", "salidas/analisis-acme.json")).toBe("ok");
    expect(r("preparador-postulacion", "Read", { file_path: resolve(RAIZ, "..", "Documentos", "hoja-de-vida.pdf") })).toBe("ok");
    expect(r("preparador-postulacion", "Read", { file_path: resolve(RAIZ, "..", ".ssh", "id_rsa.txt") })).toBe("deny");
    expect(leer("preparador-postulacion", "memoria/memoria.json")).toBe("deny");
    expect(r("preparador-postulacion", "Write", { file_path: resolve(RAIZ, "salidas/postulaciones/acme-2026-11-04.md") })).toBe("ok");
    expect(r("preparador-postulacion", "Write", { file_path: resolve(RAIZ, "salidas/busqueda-falsa.md") })).toBe("deny");
  });
});
