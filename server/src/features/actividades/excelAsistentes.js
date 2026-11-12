import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const TEMPLATE_PATH = fileURLToPath(
  new URL("./plantilla-registro-actividades.xlsm", import.meta.url),
);
const SUPPORTED_PARTICIPANT_TYPES = new Set([
  "DOCENTE",
  "ESTUDIANTE",
  "COLABORADOR",
  "ADMINISTRATIVO",
  "EGRESADO",
  "EXTERNO",
  "POR_CONFIRMAR",
]);
const TEMPLATE_OUTPUT_SHEET_NAME = "COLABORADORES";
const OUTPUT_SHEET_NAME = "PARTICIPANTES";
const COLUMNS = [
  "periodo",
  "identificacion",
  "tipoDocumento",
  "codigo",
  "apellidosNombres",
  "programaPregrado",
  "programaPosgrado",
  "semestre",
  "genero",
  "jornada",
  "correo",
  "contacto",
  "detalleTipoParticipante",
  "edad",
  "etnia",
  "municipio",
  "conflictoArmado",
  "discapacidad",
  "actividad",
  "descripcionActividad",
  "proyecto",
  "tipoActividad",
  "tipoActividadOtra",
  "alianzaInterinstitucional",
  "entidadAlianza",
  "articulacionInstitucional",
  "dependencia",
  "dependenciaOtra",
  "modalidad",
  "fechaInicio",
  "fechaFinalizacion",
  "programaBienestar",
  "componente",
  "lineaAccion",
  "estrategiaBienestar",
  "estrategiaPermanencia",
  "estrategiaInclusiva",
  "tipoApoyo",
  "rolEgresado",
  "rolEstudiante",
  "rolColaborador",
  "rolAdministrativo",
  "rolExterno",
];
const DATE_COLUMNS = new Set([30, 31]);
const WRAPPED_TEXT_COLUMNS = new Set([
  "E",
  "F",
  "G",
  "K",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "AA",
  "AB",
  "AC",
  "AF",
  "AG",
  "AH",
  "AI",
  "AJ",
  "AK",
  "AL",
]);
const MISSING_VALUE = "—";
const NOT_APPLICABLE = "No aplica";
const PENDING_VALUE = "Pendiente";
const ROLE_COLUMNS = {
  rolEgresado: "EGRESADO",
  rolEstudiante: "ESTUDIANTE",
  rolColaborador: "COLABORADOR",
  rolAdministrativo: "ADMINISTRATIVO",
  rolExterno: "EXTERNO",
};
const ROLE_LABELS = {
  DOCENTE: "Docente",
  ESTUDIANTE: "Estudiante",
  COLABORADOR: "Docente",
  ADMINISTRATIVO: "Administrativo",
  EGRESADO: "Egresado",
  EXTERNO: "Externo",
  POR_CONFIRMAR: "Por confirmar",
};
const ROLE_ORDER = [
  "ESTUDIANTE",
  "ADMINISTRATIVO",
  "COLABORADOR",
  "EGRESADO",
  "EXTERNO",
];
const ROLE_COMBINATION_KEYS = (() => {
  const combinations = [];
  function addCombinations(start, roles) {
    if (roles.length > 1) combinations.push(roles.join("|"));
    for (let index = start; index < ROLE_ORDER.length; index += 1) {
      addCombinations(index + 1, [...roles, ROLE_ORDER[index]]);
    }
  }
  addCombinations(0, []);
  return combinations;
})();

function pastelRoleCombinationColor(key) {
  const index = ROLE_COMBINATION_KEYS.indexOf(key);
  if (index < 0) {
    throw new Error("No se pudo determinar la combinación de roles del asistente.");
  }
  const hue = (index * 137.508) % 360;
  const saturation = 0.72;
  const lightness = 0.91;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hueSector = hue / 60;
  const secondary = chroma * (1 - Math.abs((hueSector % 2) - 1));
  const [red, green, blue] =
    hueSector < 1
      ? [chroma, secondary, 0]
      : hueSector < 2
        ? [secondary, chroma, 0]
        : hueSector < 3
          ? [0, chroma, secondary]
          : hueSector < 4
            ? [0, secondary, chroma]
            : hueSector < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const offset = lightness - chroma / 2;
  const channel = (value) =>
    Math.round((value + offset) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `FF${channel(red)}${channel(green)}${channel(blue)}`;
}

function roleCombinationKey(roles) {
  return [...roles]
    .sort(
      (first, second) =>
        ROLE_ORDER.indexOf(first) - ROLE_ORDER.indexOf(second),
    )
    .join("|");
}

function normalizarRol(role) {
  const normalized = String(role).trim().toUpperCase();
  return normalized === "DOCENTE" ? "COLABORADOR" : normalized;
}

function periodoAcademicoVisible(value) {
  const text = String(value || "").trim();
  const match = text.match(/\b((?:19|20)\d{2})[-/](\d{1,2})[-/]\d{1,2}\b/);
  if (!match) return text;
  return `${match[1]}-${Number(match[2]) <= 6 ? 1 : 2}`;
}

function rolesAsistente(asistente) {
  return [
    ...new Set(
      [
        ...(Array.isArray(asistente.roles) ? asistente.roles : []),
        asistente.rolParticipacion,
      ]
        .filter(Boolean)
        .map(normalizarRol),
    ),
  ].sort((left, right) => {
    const leftOrder = ROLE_ORDER.indexOf(left);
    const rightOrder = ROLE_ORDER.indexOf(right);
    return (
      (leftOrder < 0 ? ROLE_ORDER.length : leftOrder) -
        (rightOrder < 0 ? ROLE_ORDER.length : rightOrder) ||
      left.localeCompare(right)
    );
  });
}

function asistentesUnicosPorPersona(asistentes) {
  const porPersona = new Map();
  for (const asistente of asistentes) {
    const key = String(
      asistente.idPersona || asistente.identificacion || asistente.id,
    );
    const existente = porPersona.get(key);
    if (!existente) {
      porPersona.set(key, {
        ...asistente,
        roles: [...new Set(asistente.roles || [])],
      });
      continue;
    }
    existente.roles = [
      ...new Set([...(existente.roles || []), ...(asistente.roles || [])]),
    ];
    for (const field of ["tipoApoyo", "idTipoApoyo", "programaModalidad"]) {
      if (!String(existente[field] || "").trim() && String(asistente[field] || "").trim()) {
        existente[field] = asistente[field];
      }
    }
  }
  return [...porPersona.values()];
}

function detalleRolesAsistente(asistente) {
  const rolPrincipal = normalizarRol(
    asistente.rolParticipacion || asistente.tipoParticipante || "",
  );
  if (rolPrincipal === "COLABORADOR") return ROLE_LABELS[rolPrincipal];
  return asistente.detalleTipoParticipante ||
    ROLE_LABELS[rolPrincipal] ||
    rolPrincipal;
}

function valorVacioParticipante(column, assistant, roles) {
  if (column === "semestre" && !roles.has("ESTUDIANTE")) {
    return NOT_APPLICABLE;
  }
  if (column === "tipoActividadOtra") {
    const activityType = String(assistant.tipoActividad || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
    if (!activityType) return MISSING_VALUE;
    return /(^|[^A-Z])(OT(?:RA|RO)?|OTHER)([^A-Z]|$)/.test(activityType)
      ? PENDING_VALUE
      : NOT_APPLICABLE;
  }
  if (column === "entidadAlianza" || column === "articulacionInstitucional") {
    if (assistant.alianzaInterinstitucional === false
      || String(assistant.alianzaInterinstitucional).toLowerCase() === "false"
      || String(assistant.alianzaInterinstitucional).toLowerCase() === "no") {
      return NOT_APPLICABLE;
    }
    return assistant.alianzaInterinstitucional === true
      || String(assistant.alianzaInterinstitucional).toLowerCase() === "true"
      || String(assistant.alianzaInterinstitucional).toLowerCase() === "sí"
      || String(assistant.alianzaInterinstitucional).toLowerCase() === "si"
      ? PENDING_VALUE
      : MISSING_VALUE;
  }
  if (column === "dependenciaOtra") {
    const dependency = String(assistant.dependencia || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
    if (!dependency) return MISSING_VALUE;
    return /(^|[^A-Z])OT(?:RA|RO)?([^A-Z]|$)/.test(dependency)
      ? PENDING_VALUE
      : NOT_APPLICABLE;
  }
  return MISSING_VALUE;
}

function replaceWorksheetData(xml, transformRows) {
  const match = xml.match(/(<sheetData\b[^>]*>)([\s\S]*?)(<\/sheetData>)/);
  if (!match)
    throw new Error(
      "La hoja de cálculo no contiene la sección de datos esperada.",
    );
  const rows = [
    ...match[2].matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g),
  ];
  return xml.replace(
    /<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/,
    `${match[1]}${transformRows(rows.map((row) => row[0]))}${match[3]}`,
  );
}

function getRowNumber(xml) {
  return Number(xml.match(/<row\b[^>]*\br="(\d+)"/)?.[1] || 0);
}

function clearRowValues(rowXml) {
  return rowXml.replace(
    /<c\b([^>]*)>([\s\S]*?)<\/c>/g,
    (_match, attributes, content) => {
      const cleanAttributes = attributes.replace(/\s+t="[^"]*"/g, "");
      const cleanContent = content
        .replace(/<f\b[^>]*>[\s\S]*?<\/f>/g, "")
        .replace(/<v\b[^>]*>[\s\S]*?<\/v>/g, "")
        .replace(/<is\b[^>]*>[\s\S]*?<\/is>/g, "");
      return `<c${cleanAttributes}>${cleanContent}</c>`;
    },
  );
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
  const root = sharedXml.match(
    /^([\s\S]*?<sst\b[^>]*>)([\s\S]*)(<\/sst>[\s\S]*)$/,
  );
  if (!root)
    throw new Error(
      "No se pudo leer el catálogo de textos de la plantilla Excel.",
    );
  const entries = [...root[2].matchAll(/<si\b[^>]*>[\s\S]*?<\/si>/g)].map(
    (entry) => entry[0],
  );
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
    xml = xml.replace(
      /<c\b([^>]*)>([\s\S]*?)<\/c>/g,
      (cell, attributes, content) => {
        if (!/\bt="s"/.test(attributes)) return cell;
        return cell.replace(/<v>(\d+)<\/v>/, (_value, rawIndex) => {
          const nextIndex = remap.get(Number(rawIndex));
          if (nextIndex === undefined)
            throw new Error(
              "La plantilla contiene una referencia de texto inválida.",
            );
          return `<v>${nextIndex}</v>`;
        });
      },
    );
    zip.file(file.name, xml);
  }

  const openingTag = root[1]
    .replace(/\s+count="[^"]*"/, ` count="${referenceCount}"`)
    .replace(/\s+uniqueCount="[^"]*"/, ` uniqueCount="${compacted.length}"`);
  zip.file(
    "xl/sharedStrings.xml",
    `${openingTag}${compacted.join("")}${root[3]}`,
  );
}

export async function sanitizarPlantilla(inputPath, outputPath) {
  const zip = await JSZip.loadAsync(await readFile(inputPath));
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const sheetNames = [
    ...(workbookXml || "").matchAll(/<sheet\b[^>]*\bname="([^"]+)"/g),
  ].map((sheet) => sheet[1]);
  const expectedSheetNames = [
    "bd est 21082026",
    "bd colaboradores",
    "Listas",
    "Sis bienestar",
    "COLABORADORES",
    "ESTUDIANTES",
    "EGRESADOS",
    "EXTERNOS",
  ];
  if (JSON.stringify(sheetNames) !== JSON.stringify(expectedSheetNames)) {
    throw new Error(
      `La plantilla contiene hojas inesperadas: ${sheetNames.join(", ")}.`,
    );
  }
  if (!zip.file("xl/vbaProject.bin")) {
    throw new Error(
      "La plantilla no contiene el proyecto de macros requerido.",
    );
  }

  const templateSheetFiles = Object.values(zip.files).filter((file) =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(file.name),
  );
  if (templateSheetFiles.length !== 8) {
    throw new Error(
      `Se esperaban 8 hojas de plantilla y se encontraron ${templateSheetFiles.length}.`,
    );
  }

  for (const file of templateSheetFiles) {
    const sheetNumber = Number(file.name.match(/sheet(\d+)\.xml$/)[1]);
    const original = await file.async("string");
    const hasPrivateRows = sheetNumber === 1 || sheetNumber === 2;
    const isOutputSheet = sheetNumber >= 5 && sheetNumber <= 8;
    if (!hasPrivateRows && !isOutputSheet) continue;

    const sanitized = replaceWorksheetData(original, (rows) =>
      rows
        .filter((row) => {
          const number = getRowNumber(row);
          return hasPrivateRows ? number === 1 : number <= 9;
        })
        .map((row) =>
          isOutputSheet && getRowNumber(row) === 9 ? clearRowValues(row) : row,
        )
        .join(""),
    );
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
  const asistentesUnicos = asistentesUnicosPorPersona(asistentes);
  const zip = await JSZip.loadAsync(await readFile(TEMPLATE_PATH));
  const outputSheetPaths = await conservarHojasDeControl(zip);
  for (const assistant of asistentesUnicos) {
    if (!SUPPORTED_PARTICIPANT_TYPES.has(assistant.tipoParticipante)) {
      throw new Error(
        `No existe una hoja de plantilla para "${assistant.tipoParticipante}".`,
      );
    }
  }

  const path = outputSheetPaths.get(TEMPLATE_OUTPUT_SHEET_NAME);
  const file = zip.file(path);
  const xml = await file.async("string");
  const sortedAssistants = asistentesUnicos.sort((left, right) =>
    String(left.apellidosNombres || "").localeCompare(
      String(right.apellidosNombres || ""),
      "es",
      { sensitivity: "base", numeric: true },
    ),
  );
  const templateRow = [...xml.matchAll(/<row\b[^>]*\br="9"[^>]*>[\s\S]*?<\/row>/g)]
    .map((match) => match[0])[0];
  if (!templateRow) {
    throw new Error(
      "La hoja de participantes no contiene el formato de fila de datos.",
    );
  }
  const templateStyles = new Map(
    [...templateRow.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)]
      .map((cell) => {
        const reference = cell[1].match(/\br="([A-Z]+)\d+"/)?.[1];
        const styleId = cell[1].match(/\bs="(\d+)"/)?.[1];
        return reference && styleId ? [reference, Number(styleId)] : null;
      })
      .filter(Boolean),
  );
  const fallbackStyle = templateStyles.get("AL") ?? 0;
  const stylesForRow = new Set(
    COLUMNS.map((_, index) =>
      templateStyles.get(columnName(index + 1)) ?? fallbackStyle,
    ),
  );
  const textWrapColumns = new Set(
    [...WRAPPED_TEXT_COLUMNS].map(
      (column) => templateStyles.get(column) ?? fallbackStyle,
    ),
  );
  const roleCombinationKeys = [
    ...new Set(
      sortedAssistants
        .map((assistant) => rolesAsistente(assistant))
        .filter((roles) => roles.length > 1)
        .map(roleCombinationKey),
    ),
  ];
  const multipleRoleStyles = await appendMultipleRoleCellStyles(
    zip,
    [...stylesForRow],
    roleCombinationKeys,
  );
  const stylesToWrap = new Set(textWrapColumns);
  for (const roleStyles of multipleRoleStyles.values()) {
    for (const baseStyle of textWrapColumns) {
      const roleStyle = roleStyles.get(baseStyle);
      if (roleStyle != null) stylesToWrap.add(roleStyle);
    }
  }
  const wrappedStyles = await appendWrappedTextCellStyles(
    zip,
    [...stylesToWrap],
  );
  const dataStyleIds = new Set(stylesForRow);
  for (const roleStyles of multipleRoleStyles.values()) {
    for (const styleId of roleStyles.values()) dataStyleIds.add(styleId);
  }
  for (const styleId of wrappedStyles.values()) dataStyleIds.add(styleId);
  const professionalRowStyles = await appendProfessionalRowStyles(
    zip,
    [...dataStyleIds],
  );
  const updated = replaceWorksheetData(xml, (existingRows) => {
    const dataTemplateRow = existingRows.find((row) => getRowNumber(row) === 9);
    const headerAndTemplate = existingRows.filter(
      (row) => getRowNumber(row) < 9,
    );
    const generatedRows = sortedAssistants.map((assistant, index) =>
      createDataRow(
        dataTemplateRow,
        assistant,
        9 + index,
        multipleRoleStyles,
        wrappedStyles,
        professionalRowStyles,
      ),
    );
    if (generatedRows.length === 0)
      generatedRows.push(clearRowValues(dataTemplateRow));
    return [...headerAndTemplate, ...generatedRows].join("");
  })
    .replace(/<dataValidations\b[^>]*>[\s\S]*?<\/dataValidations>/g, "")
    .replace(/<extLst\b[^>]*>[\s\S]*?<\/extLst>/g, "");
  const lastRow = Math.max(9, 8 + sortedAssistants.length);
  zip.file(
    path,
    prepararPresentacionHoja(
      resizeWorksheetRanges(
        ajustarAnchosColumnasParticipantes(addRolesHeaderAndColumns(updated)),
        lastRow,
      ),
    ),
  );
  const withPeriod = await zip.file(path).async("string");
  zip.file(
    path,
    setInlineString(
      withPeriod,
      "C5",
      `BASE DE DATOS PERIODO ${
        periodoAcademicoVisible(periodo) || "TODOS LOS PERIODOS"
      }`,
    ),
  );

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
    throw new Error(
      "La plantilla de Excel no contiene el libro y las relaciones requeridas.",
    );
  }

  let workbookXml = await workbookFile.async("string");
  let relationshipsXml = await relationshipsFile.async("string");
  const sheetsMatch = workbookXml.match(/<sheets\b[^>]*>([\s\S]*?)<\/sheets>/);
  if (!sheetsMatch)
    throw new Error("La plantilla no contiene hojas de cálculo.");
  const sheetTags = [...sheetsMatch[1].matchAll(/<sheet\b[^>]*\/>/g)].map(
    (match) => match[0],
  );
  const relationships = [
    ...relationshipsXml.matchAll(/<Relationship\b[^>]*\/>/g),
  ].map((match) => match[0]);
  const selectedSheets = [TEMPLATE_OUTPUT_SHEET_NAME].map((name) => {
    const sheetTag = sheetTags.find(
      (tag) => getXmlAttribute(tag, "name") === name,
    );
    if (!sheetTag) throw new Error(`La plantilla no contiene la hoja ${name}.`);
    const relationshipId = getXmlAttribute(sheetTag, "r:id");
    const relationship = relationships.find(
      (tag) =>
        getXmlAttribute(tag, "Id") === relationshipId &&
        getXmlAttribute(tag, "Type").endsWith("/worksheet"),
    );
    if (!relationship)
      throw new Error(`No se encontró la relación de la hoja ${name}.`);
    const target = getXmlAttribute(relationship, "Target");
    const path = target.startsWith("/")
      ? target.slice(1)
      : posix.normalize(`xl/${target}`);
    return {
      name,
      relationshipId,
      path,
      sheetNumber: Number(path.match(/sheet(\d+)\.xml$/)?.[1]),
      tag: sheetTag
        .replace(/\s+state="(?:hidden|veryHidden)"/, "")
        .replace(/\bname="[^"]*"/, `name="${OUTPUT_SHEET_NAME}"`),
    };
  });
  const retainedRelationshipIds = new Set(
    selectedSheets.map((sheet) => sheet.relationshipId),
  );
  const retainedPaths = new Set(selectedSheets.map((sheet) => sheet.path));

  workbookXml = workbookXml.replace(
    /<sheets\b[^>]*>[\s\S]*?<\/sheets>/,
    `<sheets>${selectedSheets.map((sheet) => sheet.tag).join("")}</sheets>`,
  );
  workbookXml = workbookXml.replace(
    /<definedNames\b[^>]*>[\s\S]*?<\/definedNames>/g,
    "",
  );
  workbookXml = workbookXml.replace(
    /<workbookView\b([^>]*)\/>/,
    (_match, attributes) => {
      const normalizedAttributes = attributes
        .replace(/\s+activeTab="[^"]*"/, "")
        .replace(/\s+firstSheet="[^"]*"/, "");
      return `<workbookView${normalizedAttributes} activeTab="0" firstSheet="0"/>`;
    },
  );

  relationshipsXml = relationshipsXml.replace(
    /<Relationship\b[^>]*\/>/g,
    (relationship) => {
      const type = getXmlAttribute(relationship, "Type");
      const id = getXmlAttribute(relationship, "Id");
      if (type.endsWith("/worksheet")) {
        return retainedRelationshipIds.has(id) ? relationship : "";
      }
      if (type.endsWith("/vbaProject") || type.endsWith("/calcChain"))
        return "";
      return relationship;
    },
  );

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
        if (!type.endsWith("/comments") && !type.endsWith("/vmlDrawing"))
          return relationship;
        removedTargets.push(
          posix.normalize(
            posix.join(
              posix.dirname(file.name),
              getXmlAttribute(relationship, "Target"),
            ),
          ),
        );
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
    if (
      /^xl\/(comments\d+\.xml|drawings\/vmlDrawing\d+\.vml|calcChain\.xml|vbaProject\.bin)$/.test(
        file,
      )
    ) {
      zip.remove(file);
    }
  }

  const contentTypesFile = zip.file("[Content_Types].xml");
  if (!contentTypesFile)
    throw new Error(
      "La plantilla no contiene los tipos de contenido de Excel.",
    );
  let contentTypesXml = await contentTypesFile.async("string");
  contentTypesXml = contentTypesXml
    .replace(
      /<Override\b[^>]*PartName="\/xl\/workbook\.xml"[^>]*\/>/,
      (entry) =>
        entry.replace(
          /ContentType="[^"]+"/,
          'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"',
        ),
    )
    .replace(
      /<Override\b[^>]*PartName="\/(?:xl\/(?:worksheets\/sheet[1-4]\.xml|comments\d+\.xml|calcChain\.xml|vbaProject\.bin)|docProps\/(?:app|core)\.xml)"[^>]*\/>/g,
      "",
    )
    .replace(/<Default\b[^>]*Extension="vml"[^>]*\/>/g, "");
  zip.file("[Content_Types].xml", contentTypesXml);

  const packageRelsFile = zip.file("_rels/.rels");
  if (packageRelsFile) {
    let packageRels = await packageRelsFile.async("string");
    packageRels = packageRels.replace(
      /<Relationship\b[^>]*Target="docProps\/(?:app|core)\.xml"[^>]*\/>/g,
      "",
    );
    zip.file("_rels/.rels", packageRels);
  }
  zip.remove("docProps/app.xml");
  zip.remove("docProps/core.xml");
  zip.file("xl/workbook.xml", workbookXml);
  zip.file("xl/_rels/workbook.xml.rels", relationshipsXml);

  return new Map(selectedSheets.map(({ name, path }) => [name, path]));
}

function getXmlAttribute(tag, name) {
  const escapedName = name.replace(":", "\\:");
  return tag.match(new RegExp(`(?:^|\\s)${escapedName}="([^"]*)"`))?.[1] || "";
}

function resizeWorksheetRanges(xml, lastRow) {
  return xml.replace(
    /<(dimension|autoFilter)\b([^>]*\bref=")([A-Z]+\d+):[A-Z]+\d+("[^>]*)\/>/g,
    (_match, tag, prefix, start, suffix) =>
      `<${tag}${prefix}${start}:AQ${lastRow}${suffix}/>`,
  ).replace(
    /(<conditionalFormatting\b[^>]*\bsqref=")B9("[^>]*>)/g,
    (_match, prefix, suffix) => `${prefix}B9:B${lastRow}${suffix}`,
  );
}

function prepararPresentacionHoja(xml) {
  return xml.replace(
    /<sheetView\b([^>]*)>([\s\S]*?)<\/sheetView>/,
    (_match, attributes, content) => {
      const updatedContent = content
        .replace(
          /<pane\b([^>]*)\/>/,
          (_pane, paneAttributes) => {
            const nextAttributes = paneAttributes
              .replace(/\bxSplit="[^"]*"/, 'xSplit="5"')
              .replace(/\bySplit="[^"]*"/, 'ySplit="8"')
              .replace(/\btopLeftCell="[^"]*"/, 'topLeftCell="F9"');
            return `<pane${nextAttributes}/>`;
          },
        )
        .replace(
          /<selection\b([^>]*\bpane="topRight"[^>]*)\/>/,
          (_selection, selectionAttributes) =>
            `<selection${selectionAttributes
              .replace(/\bactiveCell="[^"]*"/, 'activeCell="F1"')
              .replace(/\bsqref="[^"]*"/, 'sqref="F1"')}/>`,
        )
        .replace(
          /<selection\b([^>]*\bpane="bottomRight"[^>]*)\/>/,
          (_selection, selectionAttributes) =>
            `<selection${selectionAttributes
              .replace(/\bactiveCell="[^"]*"/, 'activeCell="F9"')
              .replace(/\bsqref="[^"]*"/, 'sqref="F9"')}/>`,
        );
      return `<sheetView${attributes}>${updatedContent}</sheetView>`;
    },
  );
}

function ajustarAnchosColumnasParticipantes(xml) {
  const widths = new Map([
    [2, 16],
    [3, 13],
    [4, 18],
    [5, 34],
    [6, 48],
    [7, 48],
  ]);
  return xml.replace(
    /<cols\b([^>]*)>([\s\S]*?)<\/cols>/,
    (_match, attributes, content) => {
      const remainingColumns = [];
      for (const match of content.matchAll(/<col\b([^>]*?)\/>/g)) {
        const column = match[1];
        const min = Number(column.match(/\bmin="(\d+)"/)?.[1]);
        const max = Number(column.match(/\bmax="(\d+)"/)?.[1]);
        if (!Number.isInteger(min) || !Number.isInteger(max)) {
          throw new Error("La plantilla contiene un rango de columnas no válido.");
        }
        if (max < 2 || min > 7) {
          remainingColumns.push(`<col${column}/>`);
          continue;
        }
        if (min < 2) {
          remainingColumns.push(
            `<col${column.replace(/\bmax="\d+"/, 'max="1"')}/>`,
          );
        }
        if (max > 7) {
          remainingColumns.push(
            `<col${column.replace(/\bmin="\d+"/, 'min="8"')}/>`,
          );
        }
      }

      const participantColumns = [...widths]
        .map(([index, width]) => (
          `<col min="${index}" max="${index}" width="${width}" customWidth="1"/>`
        ))
        .join("");
      return `<cols${attributes}>${[...remainingColumns, participantColumns].join("")}</cols>`;
    },
  );
}

async function appendWrappedTextCellStyles(zip, baseStyleIds) {
  const stylesFile = zip.file("xl/styles.xml");
  if (!stylesFile) {
    throw new Error("La plantilla no contiene los estilos de Excel.");
  }
  const stylesXml = await stylesFile.async("string");
  const xfsMatch = stylesXml.match(
    /<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/,
  );
  if (!xfsMatch) {
    throw new Error("No se pudieron leer los estilos de la plantilla Excel.");
  }
  const xfs = [...xfsMatch[2].matchAll(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g)]
    .map((match) => match[0]);
  const wrappedStyles = new Map();
  const newStyles = [];
  for (const styleId of baseStyleIds) {
    const baseXf = xfs[styleId];
    if (!baseXf) {
      throw new Error("Un formato de celda de la plantilla Excel no es válido.");
    }
    const alignment = baseXf.match(/<alignment\b[^>]*\/>|<alignment\b[^>]*>[\s\S]*?<\/alignment>/)?.[0];
    let wrappedAlignment = '<alignment wrapText="1" vertical="center"/>';
    if (alignment) {
      const attributes = (alignment.match(/^<alignment\b([^>]*)>/)?.[1] || "")
        .replace(/\/\s*$/, "");
      let updatedAttributes = attributes
        .replace(/\bwrapText="[^"]*"/, 'wrapText="1"')
        .replace(/\bvertical="[^"]*"/, 'vertical="center"');
        if (!/\bwrapText="[^"]*"/.test(updatedAttributes)) {
          updatedAttributes += ' wrapText="1"';
        }
        if (!/\bvertical="[^"]*"/.test(updatedAttributes)) {
          updatedAttributes += ' vertical="center"';
        }
      wrappedAlignment = `<alignment${updatedAttributes}/>`;
    }
    let wrappedXf = baseXf.replace(
      /<alignment\b[^>]*\/>|<alignment\b[^>]*>[\s\S]*?<\/alignment>/,
      wrappedAlignment,
    );
    if (!alignment) {
      wrappedXf = wrappedXf.replace(
        /<xf\b([^>]*?)\/>/,
        (_match, attributes) => {
          const updatedAttributes = /\bapplyAlignment=/.test(attributes)
            ? attributes.replace(/\bapplyAlignment="[^"]*"/, 'applyAlignment="1"')
            : `${attributes} applyAlignment="1"`;
          return `<xf${updatedAttributes}>${wrappedAlignment}</xf>`;
        },
      );
      if (wrappedXf === baseXf) {
        wrappedXf = wrappedXf.replace(/<xf\b([^>]*)>/, (_match, attributes) => {
          const updatedAttributes = /\bapplyAlignment=/.test(attributes)
            ? attributes.replace(/\bapplyAlignment="[^"]*"/, 'applyAlignment="1"')
            : `${attributes} applyAlignment="1"`;
          return `<xf${updatedAttributes}>`;
        }).replace(/<\/xf>$/, `${wrappedAlignment}</xf>`);
      }
    } else {
      wrappedXf = wrappedXf.replace(/<xf\b([^>]*)>/, (_match, attributes) => (
        `<xf${/\bapplyAlignment=/.test(attributes)
          ? attributes.replace(/\bapplyAlignment="[^"]*"/, 'applyAlignment="1"')
          : `${attributes} applyAlignment="1"`}>`
      ));
    }
    wrappedStyles.set(styleId, xfs.length + newStyles.length);
    newStyles.push(wrappedXf);
  }

  const updatedXml = stylesXml.replace(
    /<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/,
    (_match, attributes, content) => {
      const count = Number(attributes.match(/\bcount="(\d+)"/)?.[1]) || xfs.length;
      return `<cellXfs${attributes.replace(/\bcount="\d+"/, `count="${count + newStyles.length}"`)}>${content}${newStyles.join("")}</cellXfs>`;
    },
  );
  zip.file("xl/styles.xml", updatedXml);
  return wrappedStyles;
}

async function appendProfessionalRowStyles(zip, baseStyleIds) {
  const stylesFile = zip.file("xl/styles.xml");
  if (!stylesFile) {
    throw new Error("La plantilla no contiene los estilos de Excel.");
  }
  let stylesXml = await stylesFile.async("string");
  const xfsMatch = stylesXml.match(
    /<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/,
  );
  const fillsMatch = stylesXml.match(
    /<fills\b([^>]*)>([\s\S]*?)<\/fills>/,
  );
  const bordersMatch = stylesXml.match(
    /<borders\b([^>]*)>([\s\S]*?)<\/borders>/,
  );
  if (!xfsMatch || !fillsMatch || !bordersMatch) {
    throw new Error("No se pudieron leer los estilos de la plantilla Excel.");
  }
  const xfs = [...xfsMatch[2].matchAll(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g)]
    .map((match) => match[0]);
  const fills = [...fillsMatch[2].matchAll(/<fill\b[^>]*>[\s\S]*?<\/fill>/g)]
    .map((match) => match[0]);
  const borders = [...bordersMatch[2].matchAll(/<border\b[^>]*>[\s\S]*?<\/border>/g)]
    .map((match) => match[0]);
  const stripeFillId = fills.length;
  const rowBorderId = borders.length;
  const updatedFills = stylesXml.replace(
    /<fills\b([^>]*)>([\s\S]*?)<\/fills>/,
    (_match, attributes, content) => {
      const count = Number(attributes.match(/\bcount="(\d+)"/)?.[1]) || fills.length;
      return `<fills${attributes.replace(/\bcount="\d+"/, `count="${count + 1}"`)}>${content}<fill><patternFill patternType="solid"><fgColor rgb="FFF4F7FB"/><bgColor rgb="FFF4F7FB"/></patternFill></fill></fills>`;
    },
  );
  const updatedBorders = updatedFills.replace(
    /<borders\b([^>]*)>([\s\S]*?)<\/borders>/,
    (_match, attributes, content) => {
      const count = Number(attributes.match(/\bcount="(\d+)"/)?.[1]) || borders.length;
      const border = '<border><left/><right/><top/><bottom style="thin"><color rgb="FFD9E2F3"/></bottom><diagonal/></border>';
      return `<borders${attributes.replace(/\bcount="\d+"/, `count="${count + 1}"`)}>${content}${border}</borders>`;
    },
  );
  const rowStyles = new Map();
  const newStyles = [];
  for (const styleId of baseStyleIds) {
    const baseXf = xfs[styleId];
    if (!baseXf) {
      throw new Error("Un formato de celda de la plantilla Excel no es válido.");
    }
    const openingTag = baseXf.match(/^<xf\b[^>]*\/>|^<xf\b[^>]*>/)?.[0];
    if (!openingTag) {
      throw new Error("El formato de celda de la plantilla Excel no es válido.");
    }
    const styleWithBorder = updateStyleOpeningTag(
      openingTag,
      "borderId",
      rowBorderId,
      "applyBorder",
    );
    const regularStyleId = xfs.length + newStyles.length;
    newStyles.push(baseXf.replace(openingTag, styleWithBorder));
    const fillId = Number(baseXf.match(/\bfillId="(\d+)"/)?.[1] || 0);
    let stripedStyleId = regularStyleId;
    if (fillId === 0) {
      const stripedOpeningTag = updateStyleOpeningTag(
        styleWithBorder,
        "fillId",
        stripeFillId,
        "applyFill",
      );
      stripedStyleId = xfs.length + newStyles.length;
      newStyles.push(baseXf.replace(openingTag, stripedOpeningTag));
    }
    rowStyles.set(styleId, {
      regular: regularStyleId,
      striped: stripedStyleId,
    });
  }
  stylesXml = updatedBorders.replace(
    /<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/,
    (_match, attributes, content) => {
      const count = Number(attributes.match(/\bcount="(\d+)"/)?.[1]) || xfs.length;
      return `<cellXfs${attributes.replace(/\bcount="\d+"/, `count="${count + newStyles.length}"`)}>${content}${newStyles.join("")}</cellXfs>`;
    },
  );
  zip.file("xl/styles.xml", stylesXml);
  return rowStyles;
}

function updateStyleOpeningTag(openingTag, attribute, value, applyAttribute) {
  let updated = openingTag.replace(
    new RegExp(`\\b${attribute}="[^"]*"`),
    `${attribute}="${value}"`,
  );
  if (!new RegExp(`\\b${attribute}="[^"]*"`).test(updated)) {
    updated = updated.replace(/\/?>$/, (close) => ` ${attribute}="${value}"${close}`);
  }
  updated = updated.replace(
    new RegExp(`\\b${applyAttribute}="[^"]*"`),
    `${applyAttribute}="1"`,
  );
  if (!new RegExp(`\\b${applyAttribute}="[^"]*"`).test(updated)) {
    updated = updated.replace(/\/?>$/, (close) => ` ${applyAttribute}="1"${close}`);
  }
  return updated;
}

function addRolesHeaderAndColumns(xml) {
  let hasHeader = false;
  let updated = xml.replace(
    /<row\b([^>]*\br="8"[^>]*)>([\s\S]*?)<\/row>/,
    (_match, attributes, content) => {
      const finalHeaderCell = content.match(
        /<c\b[^>]*\br="AL8"[^>]*\/>|<c\b[^>]*\br="AL8"[^>]*>[\s\S]*?<\/c>/,
      );
      if (!finalHeaderCell) {
        throw new Error(
          "La plantilla no contiene el encabezado final esperado en la fila 8.",
        );
      }
      const style = finalHeaderCell[0].match(/\bs="([^"]+)"/)?.[1];
      const styleAttribute = style ? ` s="${style}"` : "";
      const headers =
        ["EGRESADO", "ESTUDIANTE", "DOCENTE", "ADMINISTRATIVO", "EXTERNO"]
          .map(
            (header, index) =>
              `<c r="${columnName(39 + index)}8"${styleAttribute} t="inlineStr"><is><t>${header}</t></is></c>`,
          )
          .join("");
      hasHeader = true;
      return `<row${attributes.replace(/\bspans="1:38"/, 'spans="1:43"')}>${content}${headers}</row>`;
    },
  );
  if (!hasHeader)
    throw new Error(
      "La plantilla no contiene la fila de encabezados esperada.",
    );

  if (!/<cols\b[^>]*>[\s\S]*?<\/cols>/.test(updated)) {
    throw new Error(
      "La plantilla no define anchos para las columnas de salida.",
    );
  }
  updated = updated.replace(
    /<cols\b([^>]*)>([\s\S]*?)<\/cols>/,
    (_match, attributes, columns) => {
      let splitDefaultColumns = false;
      const remainingColumns = columns.replace(
        /<col\b([^>]*\bmin="39"[^>]*\bmax="16384"[^>]*)\/>/,
        (column) => {
          splitDefaultColumns = true;
          const remainder = column
            .replace(/\bmin="39"/, 'min="44"')
            .replace(/\bmax="16384"/, 'max="16384"');
          return `<col min="39" max="43" width="16" customWidth="1"/>${remainder}`;
        },
      );
      const roleColumnWidths = splitDefaultColumns
        ? remainingColumns
        : `${remainingColumns}<col min="39" max="43" width="16" customWidth="1"/>`;
      return `<cols${attributes}>${roleColumnWidths}</cols>`;
    },
  );
  return updated.replace(/spans="1:38"/g, 'spans="1:43"');
}

async function appendMultipleRoleCellStyles(
  zip,
  baseStyleIds,
  roleCombinationKeys,
) {
  const stylesFile = zip.file("xl/styles.xml");
  if (!stylesFile) {
    throw new Error("La plantilla no contiene los estilos de Excel.");
  }
  let stylesXml = await stylesFile.async("string");
  const fontsMatch = stylesXml.match(
    /<fonts\b([^>]*)>([\s\S]*?)<\/fonts>/,
  );
  const fillsMatch = stylesXml.match(
    /<fills\b([^>]*)>([\s\S]*?)<\/fills>/,
  );
  const xfsMatch = stylesXml.match(
    /<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/,
  );
  if (!fontsMatch || !fillsMatch || !xfsMatch) {
    throw new Error("No se pudieron leer los estilos de la plantilla Excel.");
  }
  const fonts = [...fontsMatch[2].matchAll(/<font\b[^>]*>[\s\S]*?<\/font>/g)]
    .map((match) => match[0]);
  const fills = [...fillsMatch[2].matchAll(/<fill\b[^>]*>[\s\S]*?<\/fill>/g)]
    .map((match) => match[0]);
  const xfs = [...xfsMatch[2].matchAll(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g)]
    .map((match) => match[0]);
  const fontIds = new Set(
    baseStyleIds.map((styleId) => {
      const baseXf = xfs[styleId];
      if (!baseXf) {
        throw new Error("Un formato de celda de la plantilla Excel no es válido.");
      }
      return Number(baseXf.match(/\bfontId="(\d+)"/)?.[1] || 0);
    }),
  );
  const roleFontIds = new Map();
  const deunderlinedFonts = [];
  for (const fontId of fontIds) {
    const baseFont = fonts[fontId];
    if (!baseFont) {
      throw new Error("Un formato de texto de la plantilla Excel no es válido.");
    }
    const deunderlinedFont = baseFont.replace(
      /<u\b[^>]*(?:\/>|>[\s\S]*?<\/u>)/g,
      "",
    );
    if (deunderlinedFont === baseFont) {
      roleFontIds.set(fontId, fontId);
      continue;
    }
    roleFontIds.set(fontId, fonts.length + deunderlinedFonts.length);
    deunderlinedFonts.push(deunderlinedFont);
  }
  const updatedFonts = deunderlinedFonts.length
    ? stylesXml.replace(
        /<fonts\b([^>]*)>([\s\S]*?)<\/fonts>/,
        (_match, attributes, content) => {
          const count = Number(attributes.match(/\bcount="(\d+)"/)?.[1]) || fonts.length;
          return `<fonts${attributes.replace(/\bcount="\d+"/, `count="${count + deunderlinedFonts.length}"`)}>${content}${deunderlinedFonts.join("")}</fonts>`;
        },
      )
    : stylesXml;

  const combinationFillIds = new Map(
    roleCombinationKeys.map((key, index) => [key, fills.length + index]),
  );
  const pastelFills = roleCombinationKeys
    .map((key) => {
      const color = pastelRoleCombinationColor(key);
      return `<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor rgb="${color}"/></patternFill></fill>`;
    })
    .join("");
  const updatedFills = updatedFonts.replace(
    /<fills\b([^>]*)>([\s\S]*?)<\/fills>/,
    (_match, attributes, content) => {
      const count = Number(fillsMatch[1].match(/\bcount="(\d+)"/)?.[1]) || fills.length;
      const updatedAttributes = attributes.replace(
        /\bcount="\d+"/,
        `count="${count + roleCombinationKeys.length}"`,
      );
      return `<fills${updatedAttributes}>${content}${pastelFills}</fills>`;
    },
  );
  const stylesByRoleCombination = new Map();
  let updatedXfs = updatedFills.replace(
    /<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/,
    (_match, attributes, content) => {
      const xfCount =
        Number(attributes.match(/\bcount="(\d+)"/)?.[1]) || xfs.length;
      let nextXfId = xfCount;
      const newStyles = roleCombinationKeys.flatMap((key) => {
        const baseStyleToPastelStyle = new Map();
        stylesByRoleCombination.set(key, baseStyleToPastelStyle);
        const fillId = combinationFillIds.get(key);
        return baseStyleIds.map((baseStyleId) => {
          const baseXf = xfs[baseStyleId];
          const baseOpeningTag = baseXf.match(/^<xf\b[^>]*>/)?.[0];
          if (!baseOpeningTag) {
            throw new Error("El formato de celda de la plantilla Excel no es válido.");
          }
          let openingTag = baseOpeningTag.replace(
            /\bfontId="\d+"/,
            `fontId="${roleFontIds.get(
              Number(baseXf.match(/\bfontId="(\d+)"/)?.[1] || 0),
            )}"`,
          );
          if (!/\bfontId="\d+"/.test(baseOpeningTag)) {
            openingTag = openingTag.replace(/\/?>$/, (close) =>
              ` fontId="${roleFontIds.get(0)}"${close}`,
            );
          }
          openingTag = openingTag.replace(/\bfillId="\d+"/, `fillId="${fillId}"`);
          if (!/\bfillId="\d+"/.test(baseOpeningTag)) {
            openingTag = openingTag.replace(/\/?>$/, (close) =>
              ` fillId="${fillId}"${close}`,
            );
          }
          openingTag = openingTag.replace(/\bapplyFont="[^"]+"/, 'applyFont="1"');
          if (!/\bapplyFont="[^"]+"/.test(baseOpeningTag)) {
            openingTag = openingTag.replace(/\/?>$/, (close) =>
              ` applyFont="1"${close}`,
            );
          }
          openingTag = openingTag.replace(/\bapplyFill="[^"]+"/, 'applyFill="1"');
          if (!/\bapplyFill="[^"]+"/.test(baseOpeningTag)) {
            openingTag = openingTag.replace(/\/?>$/, (close) =>
              ` applyFill="1"${close}`,
            );
          }
          baseStyleToPastelStyle.set(baseStyleId, nextXfId++);
          return baseXf.replace(baseOpeningTag, openingTag);
        });
      });
      const updatedAttributes = attributes.replace(
        /\bcount="\d+"/,
        `count="${nextXfId}"`,
      );
      return `<cellXfs${updatedAttributes}>${content}${newStyles.join("")}</cellXfs>`;
    },
  );
  zip.file("xl/styles.xml", updatedXfs);
  return stylesByRoleCombination;
}

function createDataRow(
  templateRow,
  assistant,
  rowNumber,
  multipleRoleStyles,
  wrappedStyles,
  professionalRowStyles,
) {
  const rowAttributes = templateRow.match(/<row\b([^>]*)>/)?.[1] || "";
  const styles = new Map();
  for (const cell of templateRow.matchAll(
    /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
  )) {
    const reference = cell[1].match(/\br="([A-Z]+)\d+"/)?.[1];
    const style = cell[1].match(/\bs="([^"]+)"/)?.[1];
    if (reference && style) styles.set(reference, style);
  }

  const roles = new Set(rolesAsistente(assistant));
  const multipleRoles = roles.size > 1;
  const roleStyles = multipleRoles
    ? multipleRoleStyles.get(roleCombinationKey([...roles]))
    : null;
  const values = COLUMNS.map((column) => {
    const role = ROLE_COLUMNS[column];
    if (role) return roles.has(role) ? "X" : "";
    const value =
      column === "detalleTipoParticipante"
        ? detalleRolesAsistente(assistant)
        : assistant[column];
    return value == null || value === ""
      ? valorVacioParticipante(column, assistant, roles)
      : value;
  });
  const cells = values
    .map((value, index) => {
      const columnNumber = index + 1;
      const column = columnName(columnNumber);
      const reference = `${column}${rowNumber}`;
      const originalStyle = Number(styles.get(column) || styles.get("AL"));
      const roleStyle = multipleRoles
        ? roleStyles?.get(originalStyle) ?? originalStyle
        : originalStyle;
      const textStyle = WRAPPED_TEXT_COLUMNS.has(column)
        ? wrappedStyles.get(roleStyle) ?? roleStyle
        : roleStyle;
      const rowStyle = professionalRowStyles.get(textStyle);
      const style = rowStyle
        ? rowStyle[rowNumber % 2 === 0 && !multipleRoles ? "striped" : "regular"]
        : textStyle;
      const styleAttribute = style ? ` s="${style}"` : "";
      if (value === "")
        return styleAttribute ? `<c r="${reference}"${styleAttribute}/>` : "";
      if (DATE_COLUMNS.has(columnNumber) && value !== NOT_APPLICABLE) {
        const serial = excelDate(value);
        if (serial !== "")
          return `<c r="${reference}"${styleAttribute}><v>${serial}</v></c>`;
        if (!value)
          return style ? `<c r="${reference}"${styleAttribute}/>` : "";
      }
      if (columnNumber === 14 && value !== "") {
        const numericValue = Number(value);
        if (Number.isFinite(numericValue)) {
          return `<c r="${reference}"${styleAttribute}><v>${numericValue}</v></c>`;
        }
      }
      if (columnNumber === 24 && typeof value === "boolean") {
        return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t>${value ? "Sí" : "No"}</t></is></c>`;
      }
      const text = String(value);
      if (!text) return style ? `<c r="${reference}"${styleAttribute}/>` : "";
      return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
    })
    .join("");

  const attributes = rowAttributes
    .replace(/\br="9"/, `r="${rowNumber}"`)
    .replace(/\bspans="1:38"/, 'spans="1:43"');
  return `<row${attributes}>${cells}</row>`;
}

function setInlineString(xml, reference, value) {
  const rowNumber = Number(reference.match(/\d+$/)?.[0]);
  let replaced = false;
  const updated = replaceWorksheetData(xml, (rows) =>
    rows
      .map((row) => {
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
      })
      .join(""),
  );
  if (!replaced) {
    throw new Error(
      `No se pudo actualizar el periodo en la celda ${reference}.`,
    );
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
  const isoDate =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  return (
    (Date.parse(`${isoDate}T00:00:00.000Z`) - Date.UTC(1899, 11, 30)) / 86400000
  );
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
