import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const TEMPLATE_PATH = fileURLToPath(
  new URL("./plantilla-registro-actividades.xlsm", import.meta.url),
);
const SHEETS_BY_TYPE = new Map([
  ["ESTUDIANTE", 6],
  ["COLABORADOR", 5],
  ["EGRESADO", 7],
  ["EXTERNO", 8],
]);
const OUTPUT_SHEET_NAMES = ["COLABORADORES", "ESTUDIANTES", "EGRESADOS", "EXTERNOS"];
const COLUMNS = [
  "periodo", "identificacion", "tipoDocumento", "codigo", "apellidosNombres",
  "programaPregrado", "programaPosgrado", "semestre", "genero", "jornada",
  "correo", "contacto", "tipoParticipante", "edad", "etnia", "municipio",
  "conflictoArmado", "discapacidad", "actividad", "descripcionActividad",
  "proyecto", "tipoActividad", "tipoActividadOtra", "alianzaInterinstitucional",
  "entidadAlianza", "articulacionInstitucional", "dependencia", "dependenciaOtra",
  "modalidad", "fechaInicio", "fechaFinalizacion", "programaBienestar",
  "componente", "lineaAccion", "estrategiaBienestar", "estrategiaPermanencia",
  "estrategiaInclusiva", "tipoApoyo",
];
const DATE_COLUMNS = new Set([30, 31]);

function replaceWorksheetData(xml, transformRows) {
  const match = xml.match(/(<sheetData\b[^>]*>)([\s\S]*?)(<\/sheetData>)/);
  if (!match) throw new Error("La hoja de cálculo no contiene la sección de datos esperada.");
  const rows = [...match[2].matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g)];
  return xml.replace(
    /<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/,
    `${match[1]}${transformRows(rows.map((row) => row[0]))}${match[3]}`,
  );
}

function getRowNumber(xml) {
  return Number(xml.match(/<row\b[^>]*\br="(\d+)"/)?.[1] || 0);
}

function clearRowValues(rowXml) {
  return rowXml.replace(/<c\b([^>]*)>([\s\S]*?)<\/c>/g, (_match, attributes, content) => {
    const cleanAttributes = attributes.replace(/\s+t="[^"]*"/g, "");
    const cleanContent = content
      .replace(/<f\b[^>]*>[\s\S]*?<\/f>/g, "")
      .replace(/<v\b[^>]*>[\s\S]*?<\/v>/g, "")
      .replace(/<is\b[^>]*>[\s\S]*?<\/is>/g, "");
    return `<c${cleanAttributes}>${cleanContent}</c>`;
  });
}

function sharedStringReferences(xml) {
  const references = [];
  for (const cell of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
    if (!/\bt="s"/.test(cell[1])) continue;
    const value = cell[2].match(/<v>(\d+)<\/v>/)?.[1];
    if (value !== undefined) references.push(Number(value));
  }
  return references;
}

async function compactSharedStrings(zip) {
  const sharedFile = zip.file("xl/sharedStrings.xml");
  if (!sharedFile) return;

  const sharedXml = await sharedFile.async("string");
  const root = sharedXml.match(/^([\s\S]*?<sst\b[^>]*>)([\s\S]*)(<\/sst>[\s\S]*)$/);
  if (!root) throw new Error("No se pudo leer el catálogo de textos de la plantilla Excel.");
  const entries = [...root[2].matchAll(/<si\b[^>]*>[\s\S]*?<\/si>/g)].map((entry) => entry[0]);
  const used = new Set();
  let referenceCount = 0;

  for (const file of Object.values(zip.files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(file.name)) continue;
    const xml = await file.async("string");
    for (const index of sharedStringReferences(xml)) {
      used.add(index);
      referenceCount += 1;
    }
  }

  const remap = new Map();
  const compacted = [];
  entries.forEach((entry, index) => {
    if (!used.has(index)) return;
    remap.set(index, compacted.length);
    compacted.push(entry);
  });

  for (const file of Object.values(zip.files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(file.name)) continue;
    let xml = await file.async("string");
    xml = xml.replace(/<c\b([^>]*)>([\s\S]*?)<\/c>/g, (cell, attributes, content) => {
      if (!/\bt="s"/.test(attributes)) return cell;
      return cell.replace(/<v>(\d+)<\/v>/, (_value, rawIndex) => {
        const nextIndex = remap.get(Number(rawIndex));
        if (nextIndex === undefined) throw new Error("La plantilla contiene una referencia de texto inválida.");
        return `<v>${nextIndex}</v>`;
      });
    });
    zip.file(file.name, xml);
  }

  const openingTag = root[1].replace(/\s+count="[^"]*"/, ` count="${referenceCount}"`)
    .replace(/\s+uniqueCount="[^"]*"/, ` uniqueCount="${compacted.length}"`);
  zip.file("xl/sharedStrings.xml", `${openingTag}${compacted.join("")}${root[3]}`);
}

export async function sanitizarPlantilla(inputPath, outputPath) {
  const zip = await JSZip.loadAsync(await readFile(inputPath));
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const sheetNames = [...(workbookXml || "").matchAll(/<sheet\b[^>]*\bname="([^"]+)"/g)]
    .map((sheet) => sheet[1]);
  const expectedSheetNames = [
    "bd est 21082026", "bd colaboradores", "Listas", "Sis bienestar",
    "COLABORADORES", "ESTUDIANTES", "EGRESADOS", "EXTERNOS",
  ];
  if (JSON.stringify(sheetNames) !== JSON.stringify(expectedSheetNames)) {
    throw new Error(`La plantilla contiene hojas inesperadas: ${sheetNames.join(", ")}.`);
  }
  if (!zip.file("xl/vbaProject.bin")) {
    throw new Error("La plantilla no contiene el proyecto de macros requerido.");
  }

  const templateSheetFiles = Object.values(zip.files)
    .filter((file) => /^xl\/worksheets\/sheet\d+\.xml$/.test(file.name));
  if (templateSheetFiles.length !== 8) {
    throw new Error(`Se esperaban 8 hojas de plantilla y se encontraron ${templateSheetFiles.length}.`);
  }

  for (const file of templateSheetFiles) {
    const sheetNumber = Number(file.name.match(/sheet(\d+)\.xml$/)[1]);
    const original = await file.async("string");
    const hasPrivateRows = sheetNumber === 1 || sheetNumber === 2;
    const isOutputSheet = sheetNumber >= 5 && sheetNumber <= 8;
    if (!hasPrivateRows && !isOutputSheet) continue;

    const sanitized = replaceWorksheetData(original, (rows) => rows
      .filter((row) => {
        const number = getRowNumber(row);
        return hasPrivateRows ? number === 1 : number <= 9;
      })
      .map((row) => (isOutputSheet && getRowNumber(row) === 9 ? clearRowValues(row) : row))
      .join(""));
    zip.file(file.name, sanitized);
  }

  await compactSharedStrings(zip);
  await mkdir(dirname(outputPath), { recursive: true });
  const output = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  await writeFile(outputPath, output);
  return output.length;
}

export async function generarExcelAsistentes(asistentes, periodo) {
  const zip = await JSZip.loadAsync(await readFile(TEMPLATE_PATH));
  const outputSheetPaths = await conservarHojasDeControl(zip);
  const grouped = new Map([...SHEETS_BY_TYPE.values()].map((sheet) => [sheet, []]));
  for (const assistant of asistentes) {
    const sheetNumber = SHEETS_BY_TYPE.get(assistant.tipoParticipante);
    if (!sheetNumber) {
      throw new Error(`No existe una hoja de plantilla para "${assistant.tipoParticipante}".`);
    }
    grouped.get(sheetNumber).push(assistant);
  }

  for (const [sheetNumber, rows] of grouped) {
    const path = outputSheetPaths.get(sheetNumber);
    const file = zip.file(path);
    const xml = await file.async("string");
    const updated = replaceWorksheetData(xml, (existingRows) => {
      const templateRow = existingRows.find((row) => getRowNumber(row) === 9);
      if (!templateRow) throw new Error(`La hoja ${sheetNumber} no contiene el formato de fila de datos.`);
      const headerAndTemplate = existingRows.filter((row) => getRowNumber(row) < 9);
      const generatedRows = rows.map((assistant, index) =>
        createDataRow(templateRow, assistant, 9 + index));
      if (generatedRows.length === 0) generatedRows.push(clearRowValues(templateRow));
      return [...headerAndTemplate, ...generatedRows].join("");
    })
      .replace(/<dataValidations\b[^>]*>[\s\S]*?<\/dataValidations>/g, "")
      .replace(/<extLst\b[^>]*>[\s\S]*?<\/extLst>/g, "");
    const lastRow = Math.max(9, 8 + rows.length);
    zip.file(path, resizeWorksheetRanges(updated, lastRow));
    if (sheetNumber >= 5 && sheetNumber <= 8) {
      const withPeriod = await zip.file(path).async("string");
      zip.file(path, setInlineString(withPeriod, "C5", `BASE DE DATOS PERIODO ${periodo || "TODOS LOS PERIODOS"}`));
    }
  }

  await compactSharedStrings(zip);
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

async function conservarHojasDeControl(zip) {
  const workbookFile = zip.file("xl/workbook.xml");
  const relationshipsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (!workbookFile || !relationshipsFile) {
    throw new Error("La plantilla de Excel no contiene el libro y las relaciones requeridas.");
  }

  let workbookXml = await workbookFile.async("string");
  let relationshipsXml = await relationshipsFile.async("string");
  const sheetsMatch = workbookXml.match(/<sheets\b[^>]*>([\s\S]*?)<\/sheets>/);
  if (!sheetsMatch) throw new Error("La plantilla no contiene hojas de cálculo.");
  const sheetTags = [...sheetsMatch[1].matchAll(/<sheet\b[^>]*\/>/g)].map((match) => match[0]);
  const relationships = [...relationshipsXml.matchAll(/<Relationship\b[^>]*\/>/g)].map((match) => match[0]);
  const selectedSheets = OUTPUT_SHEET_NAMES.map((name) => {
    const sheetTag = sheetTags.find((tag) => getXmlAttribute(tag, "name") === name);
    if (!sheetTag) throw new Error(`La plantilla no contiene la hoja ${name}.`);
    const relationshipId = getXmlAttribute(sheetTag, "r:id");
    const relationship = relationships.find((tag) => (
      getXmlAttribute(tag, "Id") === relationshipId
      && getXmlAttribute(tag, "Type").endsWith("/worksheet")
    ));
    if (!relationship) throw new Error(`No se encontró la relación de la hoja ${name}.`);
    const target = getXmlAttribute(relationship, "Target");
    const path = target.startsWith("/") ? target.slice(1) : posix.normalize(`xl/${target}`);
    return {
      name,
      relationshipId,
      path,
      sheetNumber: Number(path.match(/sheet(\d+)\.xml$/)?.[1]),
      tag: sheetTag.replace(/\s+state="(?:hidden|veryHidden)"/, ""),
    };
  });
  const retainedRelationshipIds = new Set(selectedSheets.map((sheet) => sheet.relationshipId));
  const retainedPaths = new Set(selectedSheets.map((sheet) => sheet.path));

  workbookXml = workbookXml.replace(
    /<sheets\b[^>]*>[\s\S]*?<\/sheets>/,
    `<sheets>${selectedSheets.map((sheet) => sheet.tag).join("")}</sheets>`,
  );
  workbookXml = workbookXml.replace(/<definedNames\b[^>]*>[\s\S]*?<\/definedNames>/g, "");
  workbookXml = workbookXml.replace(/<workbookView\b([^>]*)\/>/, (_match, attributes) => {
    const normalizedAttributes = attributes
      .replace(/\s+activeTab="[^"]*"/, "")
      .replace(/\s+firstSheet="[^"]*"/, "");
    return `<workbookView${normalizedAttributes} activeTab="0" firstSheet="0"/>`;
  });

  relationshipsXml = relationshipsXml.replace(/<Relationship\b[^>]*\/>/g, (relationship) => {
    const type = getXmlAttribute(relationship, "Type");
    const id = getXmlAttribute(relationship, "Id");
    if (type.endsWith("/worksheet")) {
      return retainedRelationshipIds.has(id) ? relationship : "";
    }
    if (type.endsWith("/vbaProject") || type.endsWith("/calcChain")) return "";
    return relationship;
  });

  for (const file of Object.values(zip.files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(file.name)) continue;
    if (!retainedPaths.has(file.name)) {
      zip.remove(file.name);
      zip.remove(`xl/worksheets/_rels/${posix.basename(file.name)}.rels`);
      continue;
    }

    const path = `xl/worksheets/_rels/${posix.basename(file.name)}.rels`;
    const relsFile = zip.file(path);
    if (relsFile) {
      let relsXml = await relsFile.async("string");
      const removedTargets = [];
      relsXml = relsXml.replace(/<Relationship\b[^>]*\/>/g, (relationship) => {
        const type = getXmlAttribute(relationship, "Type");
        if (!type.endsWith("/comments") && !type.endsWith("/vmlDrawing")) return relationship;
        removedTargets.push(posix.normalize(posix.join(posix.dirname(file.name), getXmlAttribute(relationship, "Target"))));
        return "";
      });
      for (const target of removedTargets) zip.remove(target);
      zip.file(path, relsXml);
    }

    let sheetXml = await zip.file(file.name).async("string");
    sheetXml = sheetXml
      .replace(/<legacyDrawing(?:HF)?\b[^>]*\/>/g, "")
      .replace(/<dataValidations\b[^>]*>[\s\S]*?<\/dataValidations>/g, "")
      .replace(/<extLst\b[^>]*>[\s\S]*?<\/extLst>/g, "");
    zip.file(file.name, sheetXml);
  }

  for (const file of Object.keys(zip.files)) {
    if (/^xl\/(comments\d+\.xml|drawings\/vmlDrawing\d+\.vml|calcChain\.xml|vbaProject\.bin)$/.test(file)) {
      zip.remove(file);
    }
  }

  const contentTypesFile = zip.file("[Content_Types].xml");
  if (!contentTypesFile) throw new Error("La plantilla no contiene los tipos de contenido de Excel.");
  let contentTypesXml = await contentTypesFile.async("string");
  contentTypesXml = contentTypesXml
    .replace(/<Override\b[^>]*PartName="\/xl\/workbook\.xml"[^>]*\/>/, (entry) => (
      entry.replace(/ContentType="[^"]+"/, 'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"')
    ))
    .replace(/<Override\b[^>]*PartName="\/(?:xl\/(?:worksheets\/sheet[1-4]\.xml|comments\d+\.xml|calcChain\.xml|vbaProject\.bin)|docProps\/(?:app|core)\.xml)"[^>]*\/>/g, "")
    .replace(/<Default\b[^>]*Extension="vml"[^>]*\/>/g, "");
  zip.file("[Content_Types].xml", contentTypesXml);

  const packageRelsFile = zip.file("_rels/.rels");
  if (packageRelsFile) {
    let packageRels = await packageRelsFile.async("string");
    packageRels = packageRels.replace(/<Relationship\b[^>]*Target="docProps\/(?:app|core)\.xml"[^>]*\/>/g, "");
    zip.file("_rels/.rels", packageRels);
  }
  zip.remove("docProps/app.xml");
  zip.remove("docProps/core.xml");
  zip.file("xl/workbook.xml", workbookXml);
  zip.file("xl/_rels/workbook.xml.rels", relationshipsXml);

  return new Map(selectedSheets.map(({ sheetNumber, path }) => [sheetNumber, path]));
}

function getXmlAttribute(tag, name) {
  const escapedName = name.replace(":", "\\:");
  return tag.match(new RegExp(`(?:^|\\s)${escapedName}="([^"]*)"`))?.[1] || "";
}

function resizeWorksheetRanges(xml, lastRow) {
  return xml.replace(/<(dimension|autoFilter)\b([^>]*\bref=")([A-Z]+\d+:[A-Z]+)(\d+)("[^>]*)\/>/g,
    (_match, tag, prefix, columns, _previousRow, suffix) => (
      `<${tag}${prefix}${columns}${lastRow}${suffix}/>`
    ));
}

function createDataRow(templateRow, assistant, rowNumber) {
  const rowAttributes = templateRow.match(/<row\b([^>]*)>/)?.[1] || "";
  const styles = new Map();
  for (const cell of templateRow.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const reference = cell[1].match(/\br="([A-Z]+)\d+"/)?.[1];
    const style = cell[1].match(/\bs="([^"]+)"/)?.[1];
    if (reference && style) styles.set(reference, style);
  }

  const values = COLUMNS.map((column) => assistant[column] ?? "");
  const cells = values.map((value, index) => {
    const columnNumber = index + 1;
    const reference = `${columnName(columnNumber)}${rowNumber}`;
    const style = styles.get(columnName(columnNumber));
    const styleAttribute = style ? ` s="${style}"` : "";
    if (DATE_COLUMNS.has(columnNumber) && value) {
      const serial = excelDate(value);
      if (serial !== "") return `<c r="${reference}"${styleAttribute}><v>${serial}</v></c>`;
      return style ? `<c r="${reference}"${styleAttribute}/>` : "";
    }
    if (columnNumber === 14 && value !== "") {
      return `<c r="${reference}"${styleAttribute}><v>${Number(value)}</v></c>`;
    }
    if (columnNumber === 24 && typeof value === "boolean") {
      return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t>${value ? "Sí" : "No"}</t></is></c>`;
    }
    const text = String(value);
    if (!text) return style ? `<c r="${reference}"${styleAttribute}/>` : "";
    return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
  }).join("");

  const attributes = rowAttributes.replace(/\br="9"/, `r="${rowNumber}"`);
  return `<row${attributes}>${cells}</row>`;
}

function setInlineString(xml, reference, value) {
  const rowNumber = Number(reference.match(/\d+$/)?.[0]);
  let replaced = false;
  const updated = replaceWorksheetData(xml, (rows) => rows.map((row) => {
    if (getRowNumber(row) !== rowNumber) return row;
    return row.replace(
      new RegExp(`<c\\b([^>]*\\br="${reference}"[^>]*)>[\\s\\S]*?<\\/c>`),
      (_cell, attributes) => {
        replaced = true;
        const style = attributes.match(/\bs="([^"]+)"/)?.[1];
        const styleAttribute = style ? ` s="${style}"` : "";
        return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
      },
    );
  }).join(""));
  if (!replaced) {
    throw new Error(`No se pudo actualizar el periodo en la celda ${reference}.`);
  }
  return updated;
}

function columnName(number) {
  let value = number;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function excelDate(value) {
  const isoDate = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  return (Date.parse(`${isoDate}T00:00:00.000Z`) - Date.UTC(1899, 11, 30)) / 86400000;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
