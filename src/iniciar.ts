/**
 * Arranque de cada comando: carga las variables del entorno y dice en cuál está corriendo.
 * Se importa primero en cada script (reemplaza a `dotenv/config`). Ver docs/entornos.md.
 *
 * Regla: una llave solo llega al programa desde el archivo de SU entorno. Si ese archivo no existe,
 * la llave se descarta aunque el sistema tenga una puesta (así una llave global no se gasta por accidente).
 */
import { existsSync } from "node:fs";
import { config } from "dotenv";
import { ENTORNO, ETIQUETAS, RUTAS } from "./entorno.js";

if (ENTORNO !== "development" && existsSync(RUTAS.env)) {
  // override: el archivo del entorno manda sobre lo que haya en el sistema, para no usar la llave equivocada.
  config({ path: RUTAS.env, override: true, quiet: true });
} else {
  // Desarrollo nunca tiene llave; pruebas y producción sin su archivo tampoco.
  delete process.env.ANTHROPIC_API_KEY;
  if (ENTORNO === "production") {
    console.error(
      `Falta ${RUTAS.env}. Producción lee sus llaves de ese archivo. Si ya tenías un .env con tu llave real, renómbralo a ${RUTAS.env}.`,
    );
    process.exit(1);
  }
}

console.log(`Entorno: ${ETIQUETAS[ENTORNO]} · datos en ${ENTORNO === "production" ? "memoria/ y salidas/" : `datos/${ENTORNO}/`}`);
