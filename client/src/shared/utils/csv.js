/* ==========================================================================
   Descarga de archivos CSV en el navegador - portado de descargarArchivo()
   en assets/js/export.js, ahora recibiendo filas (objetos) en vez de un
   string armado a mano. Reutilizable por cualquier feature que exporte.
   ========================================================================== */

export function descargarCSV(filas, columnas, nombreArchivo) {
  const encabezado = columnas.map((c) => c.header).join(",");
  const cuerpo = filas
    .map((fila) =>
      columnas
        .map((c) => {
          const valor = fila[c.key] ?? "";
          const texto = String(valor);
          return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
        })
        .join(",")
    )
    .join("\n");

  const blob = new Blob([`${encabezado}\n${cuerpo}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nombreArchivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
