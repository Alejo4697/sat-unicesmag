import { useMemo, useState } from "react";
import * as XLSX from "@e965/xlsx";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const COLUMN_FIELDS = [
  { id: "identificacion", label: "Documento de identidad", aliases: ["DOCUMENTO", "IDENTIFICACION", "NUMERODOCUMENTO", "NUMEROIDENTIFICACION", "CEDULA", "CEDULADECIUDADANIA"] },
  { id: "identificador", label: "Documento o código en una sola columna", aliases: ["IDENTIFICACIONOCODIGO", "IDENTIFICACIONOCODIGOINSTITUCIONAL", "DOCUMENTOOCODIGOINSTITUCIONAL", "IDENTIFICADORUNICO"] },
  { id: "codigo", label: "Código institucional / estudiantil", aliases: ["CODIGO", "CODIGOINSTITUCIONAL", "CODIGOESTUDIANTE", "CODIGODEESTUDIANTE", "CODIGOESTUDIANTIL", "CODIGOACADEMICO", "CODIGOALUMNO", "CODIGOALUMNA", "CODIGOUNICESMAG", "MATRICULA", "CARNET"] },
  { id: "correo", label: "Correo electrónico", aliases: ["CORREO", "EMAIL", "CORREOELECTRONICO", "DIRECCIONDECORREOELECTRONICO"] },
  { id: "nombre", label: "Nombre (solo referencia)", aliases: ["NOMBRE", "NOMBRECOMPLETO", "NOMBRES", "APELLIDOSYNOMBRES", "NOMBRESYAPELLIDOS"] },
  { id: "asistencia", label: "Respuesta de asistencia (opcional)", aliases: ["ASISTENCIA", "ASISTIO", "ASISTENCIAREGISTRADA", "PRESENTE", "CONFIRMACION", "ASISTIOALAACTIVIDAD"] },
];

function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("es")
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeIdentifier(value) {
  return String(value ?? "").trim().replace(/\.0$/, "").replace(/[^a-z0-9]/gi, "").toLocaleUpperCase("es");
}

function normalizeMatchKey(field, value) {
  if (field === "correo") return String(value ?? "").trim().toLocaleLowerCase("es");
  return normalizeIdentifier(value);
}

function cellText(value) {
  return value == null ? "" : String(value).trim();
}

function detectedHeaderRow(rows) {
  const limit = Math.min(rows.length, 20);
  let best = 0;
  let bestScore = 0;
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const headers = (rows[rowIndex] || []).map(normalizeHeader);
    const score = COLUMN_FIELDS
      .filter((field) => headers.some((header) => field.aliases.includes(header)))
      .length;
    if (score > bestScore) {
      best = rowIndex;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : -1;
}

function detectedColumns(headers) {
  const mapping = {};
  COLUMN_FIELDS.forEach((field) => {
    const match = headers.findIndex((header) => field.aliases.includes(normalizeHeader(header)));
    mapping[field.id] = match >= 0 ? String(match) : "";
  });
  return mapping;
}

function detectedCodeColumn(rows, dataStart, asistentes) {
  const codes = new Set(
    asistentes
      .map((attendee) => normalizeIdentifier(attendee.codigo))
      .filter(Boolean),
  );
  if (!codes.size) return "";

  const scores = new Map();
  rows.slice(dataStart).forEach((row) => {
    row.forEach((value, index) => {
      const candidate = normalizeIdentifier(value);
      if (candidate && codes.has(candidate)) {
        scores.set(index, (scores.get(index) || 0) + 1);
      }
    });
  });
  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  if (!ranked.length || (ranked[1] && ranked[1][1] === ranked[0][1])) return "";
  return String(ranked[0][0]);
}

function suggestedHeaderRow(rows, asistentes) {
  const namedHeaderIndex = detectedHeaderRow(rows);
  if (namedHeaderIndex >= 0) return namedHeaderIndex + 1;

  const inferredColumn = detectedCodeColumn(rows, 0, asistentes);
  const firstValue = inferredColumn === ""
    ? ""
    : normalizeIdentifier(rows[0]?.[Number(inferredColumn)]);
  if (firstValue && asistentes.some((attendee) => normalizeIdentifier(attendee.codigo) === firstValue)) {
    return 0;
  }
  return detectedCodeColumn(rows, 1, asistentes) !== "" ? 1 : 0;
}

function attendanceValue(value) {
  const normalized = normalizeHeader(value);
  if (!normalized) return "unknown";
  if (["NO", "N", "0", "FALSE", "FALSO", "AUSENTE", "NOASISTIO"].includes(normalized)
    || normalized.startsWith("NOASISTI")) return "absent";
  if (["SI", "S", "1", "TRUE", "VERDADERO", "PRESENTE", "ASISTIO", "ASISTENCIA", "X", "OK"].includes(normalized)
    || normalized.startsWith("SI")
    || (normalized.includes("ASISTI") && !normalized.includes("NO"))) return "present";
  return "unknown";
}

function indexAttendees(asistentes) {
  const maps = { identificacion: new Map(), codigo: new Map(), correo: new Map() };
  asistentes.forEach((attendee) => {
    [
      ["identificacion", attendee.identificacion],
      ["codigo", attendee.codigo],
      ["correo", attendee.correo],
    ].forEach(([field, rawValue]) => {
      const value = normalizeMatchKey(field, rawValue);
      if (!value) return;
      const matches = maps[field].get(value) || [];
      matches.push(attendee);
      maps[field].set(value, matches);
    });
  });
  return maps;
}

function mapFileRows({ rows, headerIndex, mapping, asistentes }) {
  const selectedKeys = ["identificacion", "identificador", "codigo", "correo"]
    .filter((field) => mapping[field] !== undefined && mapping[field] !== "");
  const attendeesByKey = indexAttendees(asistentes);
  const sourceRows = rows
    .slice(headerIndex + 1)
    .map((row, index) => ({ row, rowNumber: headerIndex + index + 2 }))
    .filter(({ row }) => row.some((value) => cellText(value)));
  const matchedIds = new Set();

  return sourceRows.map(({ row, rowNumber }) => {
    const identifiers = selectedKeys
      .map((field) => ({
        field,
        value: normalizeMatchKey(field, row[Number(mapping[field])]),
      }))
      .filter(({ value }) => value);
    const displayName = mapping.nombre === ""
      ? ""
      : cellText(row[Number(mapping.nombre)]);
    const asistenciaRaw = mapping.asistencia === ""
      ? ""
      : cellText(row[Number(mapping.asistencia)]);
    const asistencia = mapping.asistencia === "" ? "present" : attendanceValue(asistenciaRaw);

    if (!identifiers.length) {
      return { rowNumber, displayName, asistencia, status: "missing-id", message: "Sin identificador para validar." };
    }

    const attendeeMatches = [];
    let ambiguous = false;
    let unmatchedIdentifier = false;
    const matchedBy = [];
    identifiers.forEach(({ field, value }) => {
      const matches = field === "identificador"
        ? [...(attendeesByKey.identificacion.get(value) || []), ...(attendeesByKey.codigo.get(value) || [])]
        : attendeesByKey[field].get(value) || [];
      const uniqueMatches = [...new Map(matches.map((attendee) => [attendee.id, attendee])).values()];
      if (uniqueMatches.length > 1) ambiguous = true;
      if (uniqueMatches.length === 0) unmatchedIdentifier = true;
      if (uniqueMatches.length === 1) matchedBy.push(field);
      if (uniqueMatches.length === 1 && !attendeeMatches.some((candidate) => candidate.id === uniqueMatches[0].id)) {
        attendeeMatches.push(uniqueMatches[0]);
      }
    });

    if (ambiguous || attendeeMatches.length > 1) {
      return { rowNumber, displayName, asistencia, status: "ambiguous", message: "Los identificadores no señalan una única inscripción." };
    }
    if (attendeeMatches.length === 0) {
      return { rowNumber, displayName, asistencia, status: "not-found", message: "No coincide con una persona inscrita en esta actividad." };
    }
    if (unmatchedIdentifier) {
      return { rowNumber, displayName, asistencia, status: "mismatch", attendee: attendeeMatches[0], message: "Uno de los identificadores no coincide; requiere revisión manual." };
    }

    const attendee = attendeeMatches[0];
    if (matchedIds.has(attendee.id)) {
      return { rowNumber, displayName, asistencia, attendee, status: "duplicate", message: "La persona aparece más de una vez en el archivo." };
    }
    matchedIds.add(attendee.id);

    if (asistencia === "absent") {
      return { rowNumber, displayName, asistencia, attendee, status: "absent", message: "Marcada como no asistió." };
    }
    if (asistencia === "unknown") {
      return { rowNumber, displayName, asistencia, attendee, status: "unknown-answer", message: "La respuesta de asistencia no se reconoce; requiere revisión." };
    }
    if (attendee.asistenciaVerificada) {
      return { rowNumber, displayName, asistencia, attendee, status: "already-confirmed", message: "La asistencia ya estaba confirmada." };
    }
    const matchLabel = matchedBy.includes("codigo")
      ? "código institucional"
      : matchedBy.includes("identificador")
        ? "documento o código"
        : matchedBy.includes("identificacion")
          ? "documento"
          : "correo";
    return {
      rowNumber,
      displayName,
      asistencia,
      attendee,
      status: "ready",
      message: `Coincidencia exacta por ${matchLabel}; lista para confirmar.`,
    };
  });
}

export default function AttendanceSpreadsheetImport({ asistentes, busy, onConfirm }) {
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState([]);
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [savedMessage, setSavedMessage] = useState("");

  const activeSheet = sheets.find((sheet) => sheet.name === sheetName);
  const headers = activeSheet?.rows[headerRow === 0 ? 0 : headerRow - 1] || [];
  const preview = useMemo(() => {
    if (!activeSheet || !activeSheet.rows.length) return [];
    return mapFileRows({
      rows: activeSheet.rows,
      headerIndex: headerRow - 1,
      mapping,
      asistentes,
    });
  }, [activeSheet, headerRow, mapping, asistentes, headers.length]);
  const readyRows = preview.filter((row) => row.status === "ready");
  const selectedReadyIds = readyRows
    .filter((row) => selectedIds.has(row.attendee.id))
    .map((row) => row.attendee.id);
  const usableKeys = ["identificacion", "identificador", "codigo", "correo"]
    .filter((field) => mapping[field] !== undefined && mapping[field] !== "");

  function clearFileState() {
    setFileName("");
    setSheets([]);
    setSheetName("");
    setHeaderRow(0);
    setMapping({});
    setSelectedIds(new Set());
    setSavedMessage("");
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError("");
    setSavedMessage("");
    setSelectedIds(new Set());
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLocaleLowerCase("es");
    if (!["xlsx", "xls", "xlsm", "xlsb", "ods", "csv", "tsv"].includes(extension)) {
      setError("Formato no compatible. Sube un archivo Excel o CSV.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("El archivo supera el límite de 5 MB.");
      return;
    }

    setLoading(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, codepage: 65001 });
      const nextSheets = workbook.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
          header: 1,
          defval: "",
          raw: false,
          blankrows: true,
        }),
      })).filter((sheet) => sheet.rows.some((row) => row.some((value) => cellText(value))));
      if (!nextSheets.length) throw new Error("El archivo no contiene hojas con datos.");
      const firstSheet = nextSheets[0];
      const nextHeaderRow = suggestedHeaderRow(firstSheet.rows, asistentes);
      const detectedHeaders = firstSheet.rows[nextHeaderRow === 0 ? 0 : nextHeaderRow - 1] || [];
      const nextMapping = detectedColumns(detectedHeaders);
      if (nextMapping.codigo === "") {
        nextMapping.codigo = detectedCodeColumn(
          firstSheet.rows,
          nextHeaderRow,
          asistentes,
        );
      }
      setFileName(file.name);
      setSheets(nextSheets);
      setSheetName(firstSheet.name);
      setHeaderRow(nextHeaderRow);
      setMapping(nextMapping);
    } catch (loadError) {
      setError(loadError.message || "No se pudo leer el archivo.");
      clearFileState();
    } finally {
      setLoading(false);
    }
  }

  function changeSheet(nextSheetName) {
    const nextSheet = sheets.find((sheet) => sheet.name === nextSheetName);
    const nextHeaderRow = suggestedHeaderRow(nextSheet?.rows || [], asistentes);
    const detectedHeaders = nextSheet?.rows[nextHeaderRow === 0 ? 0 : nextHeaderRow - 1] || [];
    const nextMapping = detectedColumns(detectedHeaders);
    if (nextMapping.codigo === "") {
      nextMapping.codigo = detectedCodeColumn(nextSheet?.rows || [], nextHeaderRow, asistentes);
    }
    setSheetName(nextSheetName);
    setHeaderRow(nextHeaderRow);
    setMapping(nextMapping);
    setSelectedIds(new Set());
    setSavedMessage("");
  }

  function changeHeaderRow(value) {
    const nextRow = Math.min(Math.max(Number(value) || 0, 0), activeSheet?.rows.length || 0);
    const headerValues = activeSheet?.rows[nextRow === 0 ? 0 : nextRow - 1] || [];
    const nextMapping = detectedColumns(headerValues);
    if (nextMapping.codigo === "") {
      nextMapping.codigo = detectedCodeColumn(activeSheet?.rows || [], nextRow, asistentes);
    }
    setHeaderRow(nextRow);
    setMapping(nextMapping);
    setSelectedIds(new Set());
    setSavedMessage("");
  }

  function toggleAllReady(checked) {
    setSelectedIds(checked ? new Set(readyRows.map((row) => row.attendee.id)) : new Set());
    setSavedMessage("");
  }

  function toggleReady(id, checked) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    setSavedMessage("");
  }

  async function confirmImport() {
    if (!selectedReadyIds.length) return;
    setError("");
    try {
      const confirmed = await onConfirm(selectedReadyIds, fileName);
      if (confirmed) {
        setSavedMessage(`${selectedReadyIds.length} ${selectedReadyIds.length === 1 ? "asistencia importada y confirmada" : "asistencias importadas y confirmadas"} desde ${fileName}.`);
        setSelectedIds(new Set());
      }
    } catch (confirmError) {
      setError(confirmError.message || "No se pudieron confirmar las asistencias del archivo.");
    }
  }

  const previewCount = Math.min(preview.length, MAX_ROWS);
  const tooManyRows = preview.length > MAX_ROWS;

  return (
    <section className="vec-attendance-import" aria-labelledby="vec-attendance-import-title">
      <div className="vec-attendance-import__heading">
        <span className="vec-attendance-import__icon" aria-hidden="true"><i className="fas fa-file-import"></i></span>
        <div>
          <h4 id="vec-attendance-import-title">Importar lista de asistencia</h4>
          <p>Usa el Excel o CSV exportado desde cualquier formulario. No necesita una plantilla fija.</p>
        </div>
      </div>
      <label className="vec-attendance-import__upload">
        <input
          type="file"
          accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.tsv"
          onChange={handleFile}
          disabled={loading || busy}
        />
        <span className="vec-attendance-import__upload-icon" aria-hidden="true">
          <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-cloud-arrow-up"}`}></i>
        </span>
        <span><strong>{loading ? "Leyendo archivo..." : fileName || "Seleccionar archivo"}</strong>
          <small>Excel o CSV · máximo 5 MB</small>
        </span>
        <span className="btn btn-outline btn-sm">Explorar</span>
      </label>
      {error && <p className="vec-attendance-import__message vec-attendance-import__message--error" role="alert">{error}</p>}

      {activeSheet && (
        <>
          <div className="vec-attendance-import__config">
            <label>
              <span>Hoja del archivo</span>
              <select className="form-select" value={sheetName} onChange={(event) => changeSheet(event.target.value)}>
                {sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
              </select>
            </label>
            <label>
              <span>Fila de encabezados (0 = sin encabezados)</span>
              <input
                className="form-control"
                type="number"
                min="0"
                max={activeSheet.rows.length}
                value={headerRow}
                onChange={(event) => changeHeaderRow(event.target.value)}
              />
            </label>
            <p className="vec-attendance-import__hint">
              Elige las columnas que correspondan, aunque tengan otro nombre u orden. Al menos un identificador es obligatorio.
            </p>
          </div>
          {headerRow === 0 && (
            <p className="vec-attendance-import__message vec-attendance-import__message--info" role="note">
              El archivo se está leyendo sin encabezados. Se buscan códigos institucionales directamente entre los valores y se comparan con las inscripciones de esta actividad.
            </p>
          )}

          <div className="vec-attendance-import__mapping">
            {COLUMN_FIELDS.map((field) => (
              <label key={field.id}>
                <span>{field.label}</span>
                <select
                  className="form-select"
                  value={mapping[field.id] ?? ""}
                  onChange={(event) => {
                    setMapping((current) => ({ ...current, [field.id]: event.target.value }));
                    setSelectedIds(new Set());
                    setSavedMessage("");
                  }}
                >
                  <option value="">No asignar</option>
                  {headers.map((header, index) => (
                    <option key={`${index}-${cellText(header)}`} value={String(index)}>
                      {headerRow === 0
                        ? `Columna ${index + 1} (ej. ${cellText(header) || "vacía"})`
                        : cellText(header) || `Columna ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {mapping.asistencia === "" && (
            <p className="vec-attendance-import__message vec-attendance-import__message--info" role="note">
              No se asignó una columna de asistencia: cada fila con una coincidencia válida se interpretará como presente.
            </p>
          )}
          {mapping.codigo !== undefined && mapping.codigo !== "" && (
            <p className="vec-attendance-import__message vec-attendance-import__message--info" role="note">
              Para estudiantes, el código institucional o estudiantil se valida contra el código de la inscripción. Si el archivo incluye código y documento, ambos deben coincidir con la misma persona.
            </p>
          )}
          {!usableKeys.length && (
            <p className="vec-attendance-import__message vec-attendance-import__message--error" role="alert">
              Asigna al menos una columna de documento, código institucional, identificador combinado o correo para validar la identidad.
            </p>
          )}

          <div className="vec-attendance-import__summary" aria-label="Resumen de coincidencias">
            <span><strong>{readyRows.length}</strong> listas para confirmar</span>
            <span><strong>{preview.filter((row) => ["not-found", "ambiguous", "missing-id", "unknown-answer", "mismatch"].includes(row.status)).length}</strong> requieren revisión</span>
            <span><strong>{preview.filter((row) => row.status === "duplicate").length}</strong> duplicadas</span>
          </div>

          {tooManyRows && (
            <p className="vec-attendance-import__message vec-attendance-import__message--error" role="alert">
              El archivo tiene {preview.length} filas de datos. El límite por importación es {MAX_ROWS}; divide el archivo y carga cada parte por separado.
            </p>
          )}
          <div className="table-responsive vec-attendance-import__table-wrap">
            <table className="table vec-attendance-import__table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todas las coincidencias listas"
                      checked={readyRows.length > 0 && selectedReadyIds.length === readyRows.length}
                      onChange={(event) => toggleAllReady(event.target.checked)}
                      disabled={!readyRows.length || busy}
                    />
                  </th>
                  <th>Fila</th>
                  <th>Persona / inscripción</th>
                  <th>Respuesta</th>
                  <th>Resultado de validación</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, MAX_ROWS).map((row) => (
                  <tr className={`is-${row.status}`} key={`${row.rowNumber}-${row.attendee?.id || row.status}`}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar fila ${row.rowNumber}`}
                        checked={Boolean(row.attendee && selectedIds.has(row.attendee.id))}
                        onChange={(event) => row.attendee && toggleReady(row.attendee.id, event.target.checked)}
                        disabled={row.status !== "ready" || busy}
                      />
                    </td>
                    <td>{row.rowNumber}</td>
                    <td>
                      <div className="vec-attendance-import__person">
                        <strong>{row.attendee?.apellidosNombres || row.displayName || "Sin coincidencia"}</strong>
                        {row.attendee && <small>{row.attendee.identificacion || row.attendee.codigo || row.attendee.correo || "Identificador disponible"}</small>}
                        {row.displayName && row.attendee && row.displayName.toLocaleLowerCase("es") !== row.attendee.apellidosNombres?.toLocaleLowerCase("es")
                          && <small>Archivo: {row.displayName}</small>}
                      </div>
                    </td>
                    <td>{mapping.asistencia === "" ? "Presente (por defecto)" : row.asistencia === "present" ? "Presente" : row.asistencia === "absent" ? "No asistió" : "Revisar respuesta"}</td>
                    <td><span className={`vec-attendance-import__status vec-attendance-import__status--${row.status}`}>{row.message}</span></td>
                  </tr>
                ))}
                {previewCount === 0 && (
                  <tr><td colSpan="5">No hay filas de datos debajo del encabezado seleccionado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {savedMessage && <p className="vec-attendance-import__message vec-attendance-import__message--success" role="status">{savedMessage}</p>}
          <div className="vec-attendance-import__footer">
            <span>{selectedReadyIds.length} coincidencias seleccionadas. Las filas dudosas no se confirman automáticamente.</span>
            <button
              className="btn btn-primary"
              type="button"
              onClick={confirmImport}
              disabled={!selectedReadyIds.length || busy || tooManyRows || !usableKeys.length}
            >
              <i className={`fas ${busy ? "fa-spinner fa-spin" : "fa-circle-check"}`} aria-hidden="true"></i>
              {busy ? "Guardando..." : `Confirmar seleccionadas (${selectedReadyIds.length})`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
