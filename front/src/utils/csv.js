/* ==========================================================================
   Descarga de archivos CSV en el navegador - portado de descargarArchivo()
   en assets/js/export.js, ahora recibiendo filas (objetos) en vez de un
   string armado a mano. Reutilizable por cualquier feature que exporte.
   ==========================================================================
   Pensado para que Excel en español lo abra bien:
     - separador ";" (Excel es-CO usa la coma como separador decimal, así
       que con "," metía toda la fila en una sola columna);
     - BOM UTF-8 al inicio, si no las tildes y las ñ salen como "Ã±";
     - fin de línea CRLF, que es lo que espera Excel;
     - los valores vacíos se escriben como "No aplica" (configurable) para
       no dejar celdas en blanco en el reporte impreso.

   Cada columna es { key, header, format? }:
     - `format(valor, fila)` opcional para fechas, números, etc.
   ========================================================================== */

const SEPARADOR = ";";
const BOM = "﻿";

function celda(texto) {
  // Se entrecomilla si trae el separador, comillas o saltos de línea.
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function filaComoTexto(fila, columna, vacio = "No aplica") {
  const valor = fila[columna.key];
  const formateado = columna.format ? columna.format(valor, fila) : valor;
  if (formateado === null || formateado === undefined || formateado === "") return vacio;
  return String(formateado);
}

export function descargarCSV(filas, columnas, nombreArchivo, { vacio = "No aplica" } = {}) {
  const encabezado = columnas.map((c) => celda(c.header)).join(SEPARADOR);
  const cuerpo = filas.map((fila) =>
    columnas.map((c) => celda(filaComoTexto(fila, c, vacio))).join(SEPARADOR)
  );

  const contenido = BOM + [encabezado, ...cuerpo].join("\r\n");
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nombreArchivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * "2025-08-21T08:00:00" -> "21/08/2025 8:00 a. m."
 * Acepta también "2025-08-21 08:00" (formato de las intervenciones mock).
 * Si el valor no es una fecha válida, se devuelve tal cual.
 */
export function formatFechaCSV(valor) {
  if (!valor) return "";
  const fecha = new Date(String(valor).replace(" ", "T"));
  if (Number.isNaN(fecha.getTime())) return String(valor);
  const texto = fecha.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
  // es-CO devuelve "21/08/2025, 8:00 a. m."; se quita la coma y el espacio
  // interno de "a. m." para que la celda quede más corta y legible.
  return texto.replace(",", "").replace(/\s+/g, " ").replace("a. m.", "a.m.").replace("p. m.", "p.m.");
}
