/** Utilidades para armar el reporte en markdown de `buscar`. */

/** Texto seguro para una celda de tabla markdown: un "|" partiría la fila y "[ ]" romperían el enlace. */
export function celda(texto: string): string {
  return texto.replace(/[\\|[\]]/g, (c) => `\\${c}`).replace(/\s*\n\s*/g, " ");
}

/**
 * Nombre del archivo del reporte, con fecha y hora local (AAAA-MM-DD-HHMM),
 * para que correr la búsqueda dos veces el mismo día no sobrescriba el reporte anterior.
 */
export function nombreReporte(fecha: Date): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  return `busqueda-${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}-${dos(fecha.getHours())}${dos(fecha.getMinutes())}.md`;
}
