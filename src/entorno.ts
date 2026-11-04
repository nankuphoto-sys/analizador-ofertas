/**
 * Entornos: desarrollo, pruebas y producción (ver docs/entornos.md).
 *
 * El entorno sale de la variable APP_ENV, que ponen los scripts de package.json (`buscar:prod`, `buscar:test`, ...).
 * Sin APP_ENV es desarrollo: sin llave de Anthropic y con datos aparte, así que olvidar poner algo nunca toca producción.
 *
 * Este módulo no tiene efectos: solo decide nombres y rutas. Cargar el .env y avisar el entorno lo hace src/iniciar.ts.
 */
export const ENTORNOS = ["development", "test", "production"] as const;
export type Entorno = (typeof ENTORNOS)[number];

/** Sin valor es desarrollo. Un valor que no existe es un error: nunca se adivina un entorno. */
export function resolverEntorno(valor: string | undefined): Entorno {
  const limpio = valor?.trim();
  if (!limpio) return "development";
  if ((ENTORNOS as readonly string[]).includes(limpio)) return limpio as Entorno;
  throw new Error(`APP_ENV="${valor}" no es un entorno válido. Usa ${ENTORNOS.join(", ")}.`);
}

export interface Rutas {
  /** Historial de ofertas y caché de análisis. */
  memoria: string;
  /** Registro de gasto en la API. */
  gasto: string;
  /** Reportes y análisis. */
  salidas: string;
  /** Archivo con las variables de este entorno (llaves, modelo, límites). */
  env: string;
}

/**
 * Producción conserva las rutas de siempre (memoria/ y salidas/): así no se mueve ningún dato real ni cambian
 * las rutas que ya conocen los agentes y su control de permisos. Los otros entornos viven bajo datos/<entorno>/.
 */
export function rutasDe(entorno: Entorno): Rutas {
  const base = entorno === "production" ? "" : `datos/${entorno}/`;
  return { memoria: `${base}memoria/memoria.json`, gasto: `${base}memoria/gasto.json`, salidas: `${base}salidas`, env: `.env.${entorno}` };
}

export const ETIQUETAS: Record<Entorno, string> = { development: "DESARROLLO", test: "PRUEBAS", production: "PRODUCCIÓN" };

/** Sufijo del script de npm que corre en ese entorno: `oferta` (desarrollo), `oferta:test`, `oferta:prod`. */
export const sufijoScript = (entorno: Entorno): string => ({ development: "", test: ":test", production: ":prod" })[entorno];

/** Comando de npm de este entorno, para los mensajes que le sugieren un comando al usuario. */
export const comandoNpm = (script: string, entorno: Entorno = ENTORNO): string => `npm run ${script}${sufijoScript(entorno)}`;

export const ENTORNO: Entorno = resolverEntorno(process.env.APP_ENV);
export const RUTAS: Rutas = rutasDe(ENTORNO);
