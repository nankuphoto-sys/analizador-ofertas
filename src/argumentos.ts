/**
 * Lee una opción numérica de la línea de comandos (`--nombre=valor`).
 * Si no viene, usa el valor por defecto; si viene y no es un entero >= 0, lanza un error claro
 * en vez de dejar pasar un NaN que desactiva filtros sin avisar.
 */
export function opcionEntera(args: string[], nombre: string, porDefecto: number): number {
  const crudo = args.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
  if (crudo === undefined) return porDefecto;
  const valor = Number(crudo);
  if (crudo.trim() === "" || !Number.isInteger(valor) || valor < 0) {
    throw new Error(`--${nombre} debe ser un número entero mayor o igual a 0 (recibí "${crudo}").`);
  }
  return valor;
}
