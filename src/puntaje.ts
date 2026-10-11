import type { Estado, Requisito } from "./esquema.js";
import { normalizar } from "./hojaDeVida.js";

/** Lo que debería concluir el agente sobre un requisito, escrito a mano. */
export interface Verificacion {
  nombre: string;
  /** Términos para encontrar el requisito en la salida del agente (basta con uno). */
  buscar: string[];
  /** Términos que descartan una coincidencia ("react" no debe tomar "React Native"). */
  excluir?: string[];
  /** Estados correctos. Si hay ambigüedad real se acepta más de uno, pero nunca "cumple" si no se cumple. */
  aceptables: Estado[];
}

export interface Puntaje {
  total: number;
  aciertos: number;
  /** Dijo "cumple" cuando no se cumple: el error más caro, porque te hace postular con información falsa. */
  invenciones: number;
  /** El requisito no apareció en la salida del agente. */
  noDetectados: number;
  errores: string[];
}

/** ¿El término aparece en el texto al inicio de una palabra? ("prototip" encuentra "prototipado"). */
const aparece = (texto: string, termino: string) =>
  ` ${normalizar(texto)} `.includes(` ${normalizar(termino)}`);

export function encontrarRequisito(requisitos: Requisito[], v: Verificacion): Requisito | undefined {
  return requisitos.find(
    (r) => v.buscar.some((t) => aparece(r.requisito, t)) && !(v.excluir ?? []).some((t) => aparece(r.requisito, t)),
  );
}

export function puntuar(requisitos: Requisito[], verificaciones: Verificacion[]): Puntaje {
  const errores: string[] = [];
  let aciertos = 0;
  let invenciones = 0;
  let noDetectados = 0;

  for (const v of verificaciones) {
    const r = encontrarRequisito(requisitos, v);
    if (!r) {
      noDetectados++;
      errores.push(`No detectó: ${v.nombre}`);
      continue;
    }
    if (v.aceptables.includes(r.estado)) {
      aciertos++;
      continue;
    }
    if (r.estado === "cumple") invenciones++;
    errores.push(`${v.nombre}: esperaba ${v.aceptables.join(" o ")}, obtuvo ${r.estado} ("${r.requisito}")`);
  }

  return { total: verificaciones.length, aciertos, invenciones, noDetectados, errores };
}
