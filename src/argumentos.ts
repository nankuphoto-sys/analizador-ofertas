/**
 * Lee una opción numérica de la línea de comandos (`--nombre=valor`).
 * Si no viene, usa el valor por defecto; si viene y no es un entero >= 0, lanza un error claro
 * en vez de dejar pasar un NaN que desactiva filtros sin avisar.
 */
export function opcionEntera(args: string[], nombre: string, porDefecto: number, maximo = Infinity): number {
  const crudo = args.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
  if (crudo === undefined) return porDefecto;
  return enteroEnRango(crudo, `--${nombre}`, 0, maximo);
}

/** Convierte texto a entero entre minimo y maximo, o lanza un error que dice qué valores se aceptan. */
export function enteroEnRango(crudo: string, nombre: string, minimo: number, maximo = Infinity): number {
  const valor = Number(crudo);
  if (crudo.trim() === "" || !Number.isInteger(valor) || valor < minimo || valor > maximo) {
    const rango = maximo === Infinity ? `mayor o igual a ${minimo}` : `entre ${minimo} y ${maximo}`;
    throw new Error(`${nombre} debe ser un número entero ${rango} (recibí "${crudo}").`);
  }
  return valor;
}
