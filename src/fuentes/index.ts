import { fuenteGetOnBoard } from "./getonbrd.js";
import { fuenteGreenhouse } from "./greenhouse.js";
import { fuenteRemotive } from "./remotive.js";
import type { Fuente } from "./tipos.js";

/** Fuentes disponibles, en el orden en que se consultan. `npm run buscar -- --fuentes=getonbrd` usa solo algunas. */
export const fuentes: Fuente[] = [fuenteGetOnBoard, fuenteRemotive, fuenteGreenhouse];

export type { Fuente };
