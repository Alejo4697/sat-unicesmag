/* ==========================================================================
   Utilidad institucional UNICESMAG para la exportación a Microsoft Excel (.xlsx)
   Genera archivos XLSX nativos con la biblioteca ExcelJS, aplicando estilos
   corporativos de la Universidad CESMAG (#002855), autoajuste de columnas,
   encabezados estilizados y bordes de tabla limpios.
   ========================================================================== */

export function valorCeldaExcel(fila, columna, vacio = "No aplica") {
  const valor = fila[columna.key];
  const formateado = columna.format ? columna.format(valor, fila) : valor;
  if (formateado === null || formateado === undefined || formateado === "") {
    return vacio;
  }
  return formateado;
}

/**
 * Genera y descarga un archivo Microsoft Excel (.xlsx) nativo en el navegador.
 *
 * @param {Array<Object>} filas - Arreglo con los objetos de datos.
 * @param {Array<Object>} columnas - Definición de columnas [{ key, header, format? }].
 * @param {string} nombreArchivo - Nombre del archivo a descargar (ej: "REPORTE_SNIES.xlsx").
 * @param {Object} [opciones]
 * @param {string} [opciones.hoja="Reporte"] - Nombre de la hoja de cálculo.
 * @param {string} [opciones.vacio="No aplica"] - Texto para celdas nulas o vacías.
 */
export async function descargarExcel(
  filas,
  columnas,
  nombreArchivo,
  { hoja = "Reporte", vacio = "No aplica" } = {}
) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Universidad CESMAG - SAT";
  workbook.lastModifiedBy = "Universidad CESMAG - SAT";
  workbook.created = new Date();
  workbook.modified = new Date();

  // Nombre de hoja seguro (máximo 31 caracteres, sin caracteres prohibidos)
  const safeSheetName = (hoja || "Reporte")
    .replace(/[\\/*?[\]:]/g, "")
    .trim()
    .slice(0, 31) || "Reporte";

  const worksheet = workbook.addWorksheet(safeSheetName, {
    views: [{ state: "frozen", ySplit: 1 }] // Fila 1 fija al hacer scroll
  });

  // Configurar columnas y anchos base
  worksheet.columns = columnas.map((col) => {
    const titulo = (col.header || col.label || col.key).replaceAll("_", " ");
    return {
      header: titulo,
      key: col.key,
      width: Math.max(16, titulo.length + 5)
    };
  });

  // Estilo de la fila de encabezado
  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = {
      name: "Calibri",
      size: 11,
      bold: true,
      color: { argb: "FFFFFFFF" }
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF002855" } // Azul Institucional UNICESMAG
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF001B3A" } },
      left: { style: "thin", color: { argb: "FF001B3A" } },
      bottom: { style: "medium", color: { argb: "FF001B3A" } },
      right: { style: "thin", color: { argb: "FF001B3A" } }
    };
  });

  // Agregar filas de datos con formato y bordes
  filas.forEach((fila, index) => {
    const rowValues = {};
    columnas.forEach((col) => {
      rowValues[col.key] = valorCeldaExcel(fila, col, vacio);
    });

    const row = worksheet.addRow(rowValues);
    row.height = 20;

    const esPar = index % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = {
        name: "Calibri",
        size: 10,
        color: { argb: "FF1A202C" }
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: typeof cell.value === "number" ? "right" : "left"
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: esPar ? "FFF8FAFC" : "FFFFFFFF" } // Sutil alternancia de color
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } }
      };
    });
  });

  // Autoajuste dinámico de anchos según contenido
  worksheet.columns.forEach((column) => {
    let maxLength = column.header ? column.header.length : 12;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const cellLength = cell.value ? String(cell.value).length : 0;
      if (cellLength > maxLength) {
        maxLength = cellLength;
      }
    });
    column.width = Math.min(45, Math.max(14, maxLength + 3));
  });

  // Generar buffer XLSX y descargar en el navegador
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  let nombreFinal = nombreArchivo || "REPORTE_UNICESMAG.xlsx";
  if (!nombreFinal.toLowerCase().endsWith(".xlsx")) {
    nombreFinal = nombreFinal.replace(/\.[^/.]+$/, "") + ".xlsx";
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nombreFinal;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
