const FILA_INICIAL_DATOS = 7;
const NOMBRE_HOJA_REPORTE = "ACTIVIDAD_BIENESTAR";
const COLUMNA_ACTIVIDAD_BIENESTAR = 3;
const TOTAL_COLUMNAS = 19;
const COLUMNAS_CON_FORMULA = [12, 13];

function textoCelda(value) {
  if (Array.isArray(value)) {
    return value.map(textoCelda).filter(Boolean).join(" · ");
  }
  if (value && typeof value === "object" && Array.isArray(value.richText)) {
    return value.richText.map((item) => item.text || "").join("").trim();
  }
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizarCategoria(value) {
  return textoCelda(value)
    .replace(/^\s*\d+\s*[.)-]\s*/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function fechaExcel(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function cantidad(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function valoresCantidad(activity) {
  return [
    cantidad(activity.participantesEstudiantes),
    cantidad(activity.participantesDocentes),
    cantidad(activity.participantesAdministrativos),
    cantidad(activity.participantesEgresados),
    cantidad(activity.participantesPadresFamilia),
  ];
}

function resultadoBeneficiarios(cantidades) {
  return [
    [cantidades[0], "Estudiantes"],
    [cantidades[1], "Docentes"],
    [cantidades[2], "Administrativos"],
    [cantidades[3], "Egresados"],
    [cantidades[4], "Padres de familia"],
  ]
    .filter(([count]) => count > 0)
    .map(([, label]) => label)
    .join(", ");
}

function establecerResultadoFormula(cell, result) {
  if (cell.value?.formula) {
    cell.value = { ...cell.value, result };
  }
}

function establecerFormatoNumero(cell, numFmt) {
  cell.style = { ...cell.style, numFmt };
}

function traducirFormula(formula, rowNumber) {
  return formula.replace(/(\$?[A-Z]{1,3}\$?)7\b/g, `$1${rowNumber}`);
}

function numeroColumna(letras) {
  return [...letras].reduce(
    (total, letra) => total * 26 + letra.charCodeAt(0) - 64,
    0,
  );
}

function letrasColumna(numero) {
  let letras = "";
  let restante = numero;
  while (restante > 0) {
    const indice = (restante - 1) % 26;
    letras = String.fromCharCode(65 + indice) + letras;
    restante = Math.floor((restante - 1) / 26);
  }
  return letras;
}

function desplazarFormulaAlEliminarColumna(formula, columnaEliminada) {
  return formula.replace(
    /(\$?)([A-Z]{1,3})(\$?)(\d+)/g,
    (referencia, prefijoAbsoluto, letras, filaAbsoluta, fila) => {
      const columna = numeroColumna(letras);
      if (columna < columnaEliminada) return referencia;
      return `${prefijoAbsoluto}${letrasColumna(columna - 1)}${filaAbsoluta}${fila}`;
    },
  );
}

function ajustarCeldaPorColumna(celda, columnaEliminada) {
  const [letras, fila] = celda.match(/^[A-Z]+|\d+$/g);
  const columna = numeroColumna(letras);
  return `${letrasColumna(columna > columnaEliminada ? columna - 1 : columna)}${fila}`;
}

function quitarColumnaActividadBienestar(worksheet) {
  const rangosCombinados = [...worksheet.model.merges];
  const anclasCombinadasEliminadas = rangosCombinados
    .filter((rango) => numeroColumna(rango.split(":")[0].match(/^[A-Z]+/)[0]) === COLUMNA_ACTIVIDAD_BIENESTAR)
    .map((rango) => {
      const celda = rango.split(":")[0];
      return {
        celda: ajustarCeldaPorColumna(celda, COLUMNA_ACTIVIDAD_BIENESTAR),
        value: structuredClone(worksheet.getCell(celda).value),
        style: structuredClone(worksheet.getCell(celda).style),
      };
    });

  rangosCombinados.forEach((rango) => worksheet.unMergeCells(rango));
  worksheet.spliceColumns(COLUMNA_ACTIVIDAD_BIENESTAR, 1);
  if (worksheet.columnCount > TOTAL_COLUMNAS) {
    worksheet.spliceColumns(TOTAL_COLUMNAS + 1, worksheet.columnCount - TOTAL_COLUMNAS);
  }

  for (const rango of rangosCombinados) {
    const [inicio, fin] = rango.split(":");
    const inicioOriginal = numeroColumna(inicio.match(/^[A-Z]+/)[0]);
    const finOriginal = numeroColumna(fin.match(/^[A-Z]+/)[0]);
    if (inicioOriginal === finOriginal && inicioOriginal === COLUMNA_ACTIVIDAD_BIENESTAR) {
      continue;
    }
    const inicioAjustado = ajustarCeldaPorColumna(inicio, COLUMNA_ACTIVIDAD_BIENESTAR);
    const finAjustado = ajustarCeldaPorColumna(fin, COLUMNA_ACTIVIDAD_BIENESTAR);
    worksheet.mergeCells(`${inicioAjustado}:${finAjustado}`);
  }

  for (const ancla of anclasCombinadasEliminadas) {
    const cell = worksheet.getCell(ancla.celda);
    cell.value = ancla.value;
    cell.style = ancla.style;
  }
}

function extenderFilaPlantilla(worksheet, rowNumber, formulasPlantilla) {
  const sourceRow = worksheet.getRow(FILA_INICIAL_DATOS);
  const targetRow = worksheet.getRow(rowNumber);
  targetRow.height = sourceRow.height;

  for (let column = 1; column <= TOTAL_COLUMNAS; column += 1) {
    const sourceCell = sourceRow.getCell(column);
    const targetCell = targetRow.getCell(column);
    targetCell.style = structuredClone(sourceCell.style);
    if (sourceCell.dataValidation) {
      targetCell.dataValidation = structuredClone(sourceCell.dataValidation);
    }
    const formula = formulasPlantilla.get(column);
    if (formula) {
      targetCell.value = { formula: traducirFormula(formula, rowNumber) };
    }
  }
}

function obtenerCategorias(workbook) {
  const listas = workbook.getWorksheet("LISTAS");
  if (!listas) {
    throw new Error("La plantilla no contiene la hoja LISTAS.");
  }
  const categorias = new Map();
  for (let rowNumber = 31; rowNumber <= 49; rowNumber += 1) {
    const category = textoCelda(listas.getRow(rowNumber).getCell(2));
    if (category) {
      categorias.set(normalizarCategoria(category), {
        category,
        strategy: textoCelda(listas.getRow(rowNumber).getCell(3)),
      });
    }
  }
  return categorias;
}

function prepararFilasPlantilla(worksheet, rowCount, formulasPlantilla) {
  const lastRow = FILA_INICIAL_DATOS + rowCount - 1;
  while (worksheet.rowCount < lastRow) {
    extenderFilaPlantilla(worksheet, worksheet.rowCount + 1, formulasPlantilla);
  }

  for (let rowNumber = FILA_INICIAL_DATOS; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let column = 1; column <= TOTAL_COLUMNAS; column += 1) {
      const formula = formulasPlantilla.get(column);
      row.getCell(column).value = formula
        ? { formula: traducirFormula(formula, rowNumber) }
        : null;
    }
  }
}

export async function generarLibroReporteActividades(activities, templateBuffer) {
  if (!Array.isArray(activities)) {
    throw new Error("La respuesta de actividades no tiene un formato válido.");
  }
  if (!activities.length) {
    throw new Error("No hay actividades registradas para exportar.");
  }

  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);

  const worksheet = workbook.getWorksheet(NOMBRE_HOJA_REPORTE);
  if (!worksheet) {
    throw new Error(`La plantilla no contiene la hoja ${NOMBRE_HOJA_REPORTE}.`);
  }
  quitarColumnaActividadBienestar(worksheet);
  worksheet.getCell("A6").value = "LÍNEA DE ACCIÓN QUE ORGANIZA LA ACTIVIDAD";
  worksheet.getCell("G6").value = "ID_TIPO_ACTIVIDAD_BIENESTAR (APOYOS)";

  const formulasPlantilla = new Map(
    COLUMNAS_CON_FORMULA.map((column) => [
      column,
      desplazarFormulaAlEliminarColumna(
        worksheet.getRow(FILA_INICIAL_DATOS).getCell(column).value?.formula || "",
        COLUMNA_ACTIVIDAD_BIENESTAR,
      ),
    ]),
  );
  if ([...formulasPlantilla.values()].some((formula) => !formula)) {
    throw new Error("La plantilla no contiene las fórmulas requeridas para el reporte.");
  }
  const categorias = obtenerCategorias(workbook);
  prepararFilasPlantilla(worksheet, activities.length, formulasPlantilla);
  for (const row of worksheet.getRows(1, worksheet.rowCount) || []) {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.dataValidation = undefined;
    });
  }
  workbook.definedNames.model = [];
  for (const sheet of [...workbook.worksheets]) {
    if (sheet.id !== worksheet.id) workbook.removeWorksheet(sheet.id);
  }

  activities.forEach((activity, index) => {
    const rowNumber = FILA_INICIAL_DATOS + index;
    const row = worksheet.getRow(rowNumber);
    const categoria = categorias.get(normalizarCategoria(activity.tipoActividad));
    const cantidades = valoresCantidad(activity);

    row.getCell(1).value = textoCelda(activity.lineaAccion);
    row.getCell(2).value =
      textoCelda(activity.programaAcademico) || "Sin especificar";
    row.getCell(3).value = textoCelda(activity.actividad);
    row.getCell(4).value = textoCelda(activity.descripcion);
    row.getCell(5).value = textoCelda(
      activity.componenteBienestarReal || activity.componenteBienestar,
    );
    row.getCell(6).value =
      textoCelda(activity.estrategiaPoliticaBienestar) || categoria?.strategy || "";
    const apoyos = (activity.apoyosModalidades || [])
      .map((item) => item.tipoApoyo)
      .filter(Boolean);
    row.getCell(7).value =
      textoCelda(apoyos) || textoCelda(activity.tipoApoyoPrograma);
    row.getCell(8).value = fechaExcel(activity.fechaInicio);
    establecerFormatoNumero(row.getCell(8), "dd/mm/yyyy");
    row.getCell(9).value = fechaExcel(activity.fechaFinalizacion);
    establecerFormatoNumero(row.getCell(9), "dd/mm/yyyy");
    row.getCell(10).value = textoCelda(activity.tipoDocumentoResponsable);
    row.getCell(11).value = textoCelda(activity.identificacionResponsable);
    cantidades.forEach((value, countIndex) => {
      const cell = row.getCell(14 + countIndex);
      cell.value = value;
      establecerFormatoNumero(cell, "0");
    });
    establecerFormatoNumero(row.getCell(13), "0");
    row.getCell(19).value = textoCelda(activity.modalidad);

    establecerResultadoFormula(row.getCell(12), resultadoBeneficiarios(cantidades));
    establecerResultadoFormula(row.getCell(13), cantidades.reduce((total, value) => total + value, 0));
  });

  const lastDataRow = FILA_INICIAL_DATOS + activities.length - 1;
  worksheet.autoFilter = { from: "A6", to: `S${lastDataRow}` };
  worksheet.views = [
    {
      ...(worksheet.views[0] || {}),
      state: "frozen",
      ySplit: 6,
      topLeftCell: "A7",
      activeCell: "A7",
    },
  ];
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  return workbook.xlsx.writeBuffer();
}

export async function descargarReporteActividades(activities, fileName) {
  const baseUrl = import.meta.env?.BASE_URL || "/";
  const templateUrl = new URL(
    `${baseUrl}plantillas/actividad_bienestar.xlsx`,
    window.location.origin,
  );
  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error("No se pudo cargar la plantilla institucional del reporte.");
  }

  const buffer = await generarLibroReporteActividades(
    activities,
    await response.arrayBuffer(),
  );
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
