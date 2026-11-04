#!/usr/bin/env node
/**
 * Permisos mínimos del equipo de agentes (ver docs/permisos-agentes.md).
 *
 * Hook PreToolUse que cada agente declara en su frontmatter con su propio nombre:
 *   node "$CLAUDE_PROJECT_DIR/.claude/hooks/permisos.mjs" <agente>
 * Lee la llamada a la herramienta por stdin y responde:
 *   - deny: la acción está fuera de lo que ese agente necesita (se le explica por qué);
 *   - ask: la acción está permitida pero necesita el «sí» del usuario;
 *   - nada: no la bloquea y sigue el flujo normal de permisos de Claude Code.
 * Nunca aprueba nada por su cuenta: solo puede restringir.
 */
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ARCHIVO_FUENTE = /^src\/fuentes\/[^/]+\.ts$/;
const PRUEBA_FUENTE = /^tests\/(getonbrd|remotive|greenhouse|fuentes)\.test\.ts$/;

/** Qué puede tocar cada agente. Rutas relativas a la raíz del proyecto, con "/". Lo que no está, no se puede. */
export const POLITICAS = {
  "analizador-ofertas": {
    leer: [/^(?!\.claude\/)/], // todo el proyecto
    explorar: [/^(?!\.claude(\/|$))/],
    escribir: [/^src\/.+\.ts$/, /^tests\/.+\.ts$/, /^greenhouse-empresas\.json$/],
    comandos: [
      /^npm run (buscar|analizar|oferta|olvidar) -- .+$/,
      /^npm run oferta -- --lista( --estado=\w+)?$/,
      /^npm run typecheck$/,
      /^npm test( -- [\w./-]+)?$/,
    ],
  },
  "auditor-fuentes": {
    leer: [ARCHIVO_FUENTE, PRUEBA_FUENTE, /^greenhouse-empresas\.json$/, /^package\.json$/],
    explorar: [/^src\/fuentes$/, /^tests$/],
    escribir: [ARCHIVO_FUENTE, PRUEBA_FUENTE, /^greenhouse-empresas\.json$/],
    comandos: [
      // Siempre con la hoja de vida de ejemplo, sin IA y sin tocar la memoria ni los reportes.
      /^npm run buscar -- ejemplos\/hoja-de-vida-laura\.txt --analizar=0 --prueba( --fuentes=[a-z,]+)?$/,
      /^npm run typecheck$/,
      /^npm test( -- tests\/[a-z]+\.test\.ts)?$/,
    ],
    dominios: ["getonbrd.com", "remotive.com", "greenhouse.io"],
  },
  "afinador-prefiltro": {
    leer: [/^src\/prefiltro\.ts$/, /^tests\/prefiltro\.test\.ts$/, /^salidas\/busqueda-[^/]+\.md$/, /^memoria\/memoria\.json$/],
    explorar: [/^salidas$/],
  },
  "explorador-plataformas": {
    leer: [ARCHIVO_FUENTE, /^greenhouse-empresas\.json$/],
    web: true,
  },
  "preparador-postulacion": {
    leer: [/^salidas\/(?!postulaciones\/).+\.(md|json)$/, /^salidas\/postulaciones\/[^/]+\.md$/, /^ejemplos\/[^/]+\.(txt|pdf|md|docx)$/],
    // La hoja de vida del usuario puede estar fuera del proyecto: solo documentos, nunca carpetas ocultas.
    leerFuera: /\.(pdf|txt|md|docx)$/i,
    escribir: [/^salidas\/postulaciones\/[^/]+\.md$/],
  },
};

/** .env y sus variantes con secretos. .env.example sí se puede leer: no tiene valores. */
const esSecreto = (rel) => {
  const nombre = rel.split("/").pop() ?? "";
  return nombre.toLowerCase().startsWith(".env") && nombre.toLowerCase() !== ".env.example";
};

/** Caracteres con los que un comando podría encadenar otro, redirigir o expandir variables. */
const METACARACTERES = /[;&|<>`$\n\r\\]/;

const deny = (motivo) => ({ decision: "deny", motivo });
const ask = (motivo) => ({ decision: "ask", motivo });
const ok = { decision: "ok" };

/** En Windows, Git Bash escribe "/c/Users/..." donde Node espera "C:/Users/...". */
export const normalizarRuta = (ruta, plataforma = process.platform) =>
  plataforma === "win32" ? String(ruta).replace(/^\/([a-z])(?=\/|$)/i, (_, letra) => `${letra.toUpperCase()}:`) : String(ruta);

function rutaRelativa(raizCruda, ruta) {
  const raiz = resolve(normalizarRuta(raizCruda));
  const absoluta = resolve(raiz, normalizarRuta(ruta));
  const rel = relative(raiz, absoluta).split(sep).join("/");
  const fuera = rel === ".." || rel.startsWith("../") || isAbsolute(rel);
  return { rel: process.platform === "win32" ? rel.toLowerCase() : rel, fuera, absoluta };
}

const coincide = (lista, rel) => (lista ?? []).some((re) => re.test(rel));

function revisarLectura(politica, agente, raiz, ruta) {
  if (!ruta) return deny("Falta la ruta del archivo.");
  const { rel, fuera, absoluta } = rutaRelativa(raiz, ruta);
  if (esSecreto(rel)) return deny("Los archivos .env tienen llaves y contraseñas: ningún agente los lee.");
  if (fuera) {
    const partes = absoluta.split(/[\\/]/);
    if (politica.leerFuera?.test(absoluta) && !partes.some((p) => p.startsWith("."))) return ok;
    return deny(`${agente} no puede leer fuera del proyecto: ${ruta}`);
  }
  return coincide(politica.leer, rel) ? ok : deny(`${agente} no necesita leer ${rel}. Lo que puede leer está en docs/permisos-agentes.md.`);
}

function revisarExploracion(politica, agente, raiz, entrada, herramienta) {
  // Qué archivos recorre: en Glob es "pattern"; en Grep es "glob" ("pattern" es el texto a buscar).
  const patronArchivos = String((herramienta === "Glob" ? entrada.pattern : entrada.glob) ?? "");
  if (patronArchivos.includes("..") || isAbsolute(patronArchivos) || /^[a-z]:/i.test(patronArchivos)) {
    return deny("El patrón no puede salir de la carpeta indicada (sin '..' ni rutas absolutas).");
  }
  const { rel, fuera } = rutaRelativa(raiz, entrada.path ?? ".");
  if (fuera) return deny(`${agente} no puede buscar fuera del proyecto.`);
  if (esSecreto(rel) || /\.env/i.test(patronArchivos)) return deny("Ningún agente busca dentro de los archivos .env.");
  return coincide(politica.explorar, rel)
    ? ok
    : deny(`${agente} solo puede buscar en: ${(politica.explorar ?? []).map(String).join(", ") || "ninguna carpeta"}. Indica "path".`);
}

function revisarEscritura(politica, agente, raiz, ruta) {
  if (!ruta) return deny("Falta la ruta del archivo.");
  const { rel, fuera } = rutaRelativa(raiz, ruta);
  if (fuera) return deny(`${agente} no puede escribir fuera del proyecto.`);
  if (esSecreto(rel)) return deny("Ningún agente escribe archivos .env.");
  return coincide(politica.escribir, rel) ? ok : deny(`${agente} no puede modificar ${rel}.`);
}

function revisarComando(politica, agente, comando) {
  const c = String(comando ?? "").trim().replace(/\s+/g, " ");
  if (METACARACTERES.test(c)) return deny("El comando no puede encadenar, redirigir ni expandir variables (; & | < > ` $ \\). Escribe las rutas con / en vez de \\.");
  if (!coincide(politica.comandos, c)) return deny(`${agente} no puede correr: ${c}`);
  if (agente !== "analizador-ofertas") return ok;

  // Lo que el jefe puede correr pero solo con el «sí» del usuario (ver docs/jerarquia-agentes.md).
  if (/^npm run olvidar /.test(c)) return ask("Borrar memoria o caché necesita tu aprobación.");
  if (/^npm run oferta -- \S+ (postulada|descartada|guardada)\b/.test(c)) return ask("Cambiar el estado de una oferta necesita tu aprobación.");
  const analizar = /--analizar=(\d+)/.exec(c);
  if (/^npm run buscar /.test(c) && (/--sin-cache\b/.test(c) || (analizar && Number(analizar[1]) > 10))) {
    return ask("Esta búsqueda gasta de más (--sin-cache o --analizar mayor a 10): necesita tu aprobación.");
  }
  return ok;
}

function revisarDominio(politica, agente, url) {
  if (politica.web) return ok;
  let host;
  try {
    host = new URL(String(url)).hostname.toLowerCase();
  } catch {
    return deny("La URL no es válida.");
  }
  const permitido = (politica.dominios ?? []).some((d) => host === d || host.endsWith(`.${d}`));
  return permitido ? ok : deny(`${agente} solo consulta la documentación de sus fuentes (${(politica.dominios ?? []).join(", ")}).`);
}

/** Decide si el agente puede hacer esta llamada. Función pura: es lo que prueban los tests. */
export function revisar(agente, llamada, raiz) {
  const politica = POLITICAS[agente];
  if (!politica) return deny(`Agente desconocido: ${agente}.`);
  const entrada = llamada.tool_input ?? {};
  switch (llamada.tool_name) {
    case "Read":
      return revisarLectura(politica, agente, raiz, entrada.file_path);
    case "Grep":
    case "Glob":
      return revisarExploracion(politica, agente, raiz, entrada, llamada.tool_name);
    case "Edit":
    case "Write":
    case "MultiEdit":
    case "NotebookEdit":
      return revisarEscritura(politica, agente, raiz, entrada.file_path ?? entrada.notebook_path);
    case "Bash":
      return revisarComando(politica, agente, entrada.command);
    case "WebFetch":
      return revisarDominio(politica, agente, entrada.url);
    case "WebSearch":
      return politica.web ? ok : deny(`${agente} no busca en la web.`);
    case "SubagentHandback": // entregarle el resultado al jefe
    case "ToolSearch": // cargar la descripción de una herramienta (no la habilita si no está en tools:)
    case "TodoWrite": // lista de pasos propia
      return ok;
    case "Agent":
    case "Task":
      // A quién puede llamar el jefe ya lo limita su campo tools: Agent(...).
      return agente === "analizador-ofertas" ? ok : deny("Solo el jefe llama a otros agentes.");
    default:
      return deny(`${agente} no usa la herramienta ${llamada.tool_name}.`);
  }
}

async function main() {
  let texto = "";
  for await (const trozo of process.stdin) texto += trozo;
  if (process.env.PERMISOS_LOG) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.PERMISOS_LOG, `${process.argv[2]} ${texto}\n`);
  }
  let llamada;
  try {
    llamada = JSON.parse(texto);
  } catch {
    llamada = { tool_name: "desconocida" };
  }
  // Dos formas de llamarlo: desde el frontmatter del agente (con su nombre) o desde .claude/settings.json
  // con --desde-settings, que toma el nombre del agente que Claude Code manda en la llamada.
  let agente = process.argv[2];
  if (agente === "--desde-settings") {
    agente = llamada.agent_type;
    // Sin agente (la sesión normal del usuario) o un agente ajeno al equipo: este control no aplica.
    if (!agente || !(agente in POLITICAS)) return;
  }
  const raiz = process.env.CLAUDE_PROJECT_DIR ?? llamada.cwd ?? process.cwd();
  const { decision, motivo } = revisar(agente, llamada, raiz);
  if (decision === "ok") return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: motivo },
    }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Si el control falla, se bloquea: nunca se deja pasar por error.
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `Falló el control de permisos: ${error}` },
      }),
    );
  });
}
