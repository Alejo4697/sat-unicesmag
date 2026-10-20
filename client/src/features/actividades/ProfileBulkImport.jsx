import { useMemo, useState } from "react";
import * as XLSX from "@e965/xlsx";
import { registrarPerfilesMasivo, validarPerfilesMasivo } from "./participantesApi.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 500;
const ROLES = [
  { value: "EGRESADO", label: "Egresado" },
  { value: "COLABORADOR", label: "Colaborador" },
  { value: "EXTERNO", label: "Externo" },
];
const ROLE_LABELS = {
  ESTUDIANTE: "Estudiante",
  EGRESADO: "Egresado",
  COLABORADOR: "Colaborador",
  EXTERNO: "Externo",
};
const FIELDS = [
  { id: "identificacion", label: "Documento de identidad", aliases: ["DOCUMENTO", "IDENTIFICACION", "NUMERODOCUMENTO", "NUMEROIDENTIFICACION", "CEDULA", "CEDULADECIUDADANIA"], required: true },
  { id: "nombres", label: "Nombres", aliases: ["NOMBRES", "NOMBRE", "PRIMERNOMBRE"], required: true },
  { id: "apellidos", label: "Apellidos", aliases: ["APELLIDOS", "APELLIDO", "PRIMERAPELLIDO"], required: true },
  { id: "tipoDocumento", label: "Tipo de documento", aliases: ["TIPODOCUMENTO", "TIPODEDOCUMENTO", "TIPOIDENTIFICACION"], required: true },
  { id: "fechaNacimiento", label: "Fecha de nacimiento", aliases: ["FECHANACIMIENTO", "FECHADENACIMIENTO"], required: true },
  { id: "lugarNacimiento", label: "Lugar de nacimiento", aliases: ["LUGARDENACIMIENTO", "LUGARNACIMIENTO"], required: true },
  { id: "genero", label: "Género", aliases: ["GENERO", "SEXO"], required: true },
  { id: "correo", label: "Correo personal", aliases: ["CORREOPERSONAL", "CORREO", "EMAIL", "CORREOELECTRONICO"], required: true },
  { id: "celular", label: "Celular", aliases: ["CELULAR", "MOVIL", "TELEFONOMOVIL"], required: true },
  { id: "telefono", label: "Teléfono alternativo", aliases: ["TELEFONO", "TELEFONOFIJO", "TELEFONOALTERNATIVO"], required: true },
  { id: "direccion", label: "Dirección", aliases: ["DIRECCION", "DIRECCIONRESIDENCIA"], required: true },
  { id: "municipio", label: "Municipio", aliases: ["MUNICIPIO", "CIUDAD", "MUNICIPIORESIDENCIA"], required: true },
  { id: "fechaEgreso", label: "Fecha de egreso", aliases: ["FECHAEGRESO", "FECHADEEGRESO"] },
  { id: "programaAcademico", label: "Programa académico", aliases: ["PROGRAMAACADEMICO", "PROGRAMA"] },
  { id: "programaPosgradoDependencia", label: "Programa de posgrado", aliases: ["PROGRAMAPOSGRADO", "PROGRAMADEPOSGRADO"] },
  { id: "dependencia", label: "Dependencia", aliases: ["DEPENDENCIA", "DEPENDENCIADETRABAJO"] },
  { id: "cargo", label: "Cargo", aliases: ["CARGO", "CARGODESEMPENO", "PUESTO"] },
  { id: "etnia", label: "Etnia", aliases: ["ETNIA", "GRUPOETNICO"] },
  { id: "discapacidad", label: "Discapacidad", aliases: ["DISCAPACIDAD"] },
];

function cellText(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeHeader(value) {
  return cellText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("es")
    .replace(/[^A-Z0-9]/g, "");
}

function findHeaderRow(rows) {
  let bestIndex = -1;
  let bestScore = 0;
  rows.slice(0, 20).forEach((row, index) => {
    const normalized = row.map(normalizeHeader);
    const score = FIELDS.filter((field) => normalized.some((value) => field.aliases.includes(value))).length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestScore >= 2 ? bestIndex : -1;
}

function suggestMapping(headers) {
  return Object.fromEntries(FIELDS.map((field) => {
    const index = headers.findIndex((header) => field.aliases.includes(normalizeHeader(header)));
    return [field.id, index < 0 ? "" : String(index)];
  }));
}

function normalizeDate(value) {
  const raw = cellText(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return "";
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function normalizeDocumentType(value) {
  const type = normalizeHeader(value);
  const aliases = {
    CEDULA: "CC",
    CEDULADECIUDADANIA: "CC",
    TARJETAIDENTIDAD: "TI",
    TARJETADEIDENTIDAD: "TI",
    CEDULAEXTRANJERIA: "CE",
    CEDULADEEXTRANJERIA: "CE",
    PASAPORTE: "PA",
    REGISTROCIVIL: "RC",
    NIT: "NIT",
    PPT: "PPT",
    PEP: "PEP",
    CARNEDIPLOMATICO: "CD",
    SALVOCONDUCTO: "SC",
    NUIP: "NUIP",
    OTRO: "OTRO",
    CC: "CC",
    TI: "TI",
    CE: "CE",
    PA: "PA",
    RC: "RC",
    CD: "CD",
    SC: "SC",
  };
  return aliases[type] || cellText(value);
}

function normalizeGender(value) {
  const gender = normalizeHeader(value);
  const aliases = {
    F: "Femenino",
    FEMENINO: "Femenino",
    MUJER: "Femenino",
    M: "Masculino",
    MASCULINO: "Masculino",
    HOMBRE: "Masculino",
    NOBINARIO: "No binario",
    NB: "No binario",
    OTRO: "Otro",
    OTRA: "Otro",
    PREFIERONORESPONDER: "Prefiero no responder",
    PREFIERENORESPONDER: "Prefiero no responder",
    NR: "Prefiero no responder",
  };
  return aliases[gender] || cellText(value);
}

function readRows(file) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true, dateNF: "yyyy-mm-dd", codepage: 65001 });
    const sheets = workbook.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
        header: 1,
        defval: "",
        raw: false,
        blankrows: true,
        dateNF: "yyyy-mm-dd",
      }),
    })).filter((sheet) => sheet.rows.some((row) => row.some((cell) => cellText(cell))));
    if (!sheets.length) throw new Error("El archivo no contiene hojas con datos.");
    return sheets;
  });
}

function ProfileBulkImport({ onSaved }) {
  const [role, setRole] = useState("EGRESADO");
  const [sheets, setSheets] = useState([]);
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [results, setResults] = useState([]);
  const [selectedRows, setSelectedRows] = useState(() => new Set());
  const [confirmRows, setConfirmRows] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const activeSheet = sheets.find((sheet) => sheet.name === sheetName);
  const headers = activeSheet?.rows[headerRow === 0 ? 0 : headerRow - 1] || [];
  const readyResults = results.filter((result) => result.status === "ready");
  const confirmationResults = results.filter((result) => result.status === "requires-confirmation");
  const selectableResults = results.filter((result) => ["ready", "requires-confirmation"].includes(result.status));
  const selectedCount = selectableResults.filter((result) => (
    selectedRows.has(result.fila)
    && (result.status !== "requires-confirmation" || confirmRows.has(result.fila))
  )).length;
  const previewRows = useMemo(() => {
    if (!activeSheet || !results.length) return [];
    return results.map((result) => {
      const source = rows.find((row) => row.fila === result.fila) || {};
      return { ...source, ...result };
    });
  }, [activeSheet, rows, results]);

  async function onFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError("");
    setMessage("");
    setSheets([]);
    setSheetName("");
    setFileName("");
    setResults([]);
    setRows([]);
    setSelectedRows(new Set());
    setConfirmRows(new Set());
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "xlsm", "xlsb", "ods", "csv", "tsv"].includes(extension)) {
      setError("Sube un archivo Excel o CSV compatible.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("El archivo supera el límite de 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const nextSheets = await readRows(file);
      const first = nextSheets[0];
      const headerIndex = findHeaderRow(first.rows);
      const nextHeader = headerIndex < 0 ? 0 : headerIndex + 1;
      setSheets(nextSheets);
      setSheetName(first.name);
      setHeaderRow(nextHeader);
      setMapping(suggestMapping(first.rows[nextHeader === 0 ? 0 : nextHeader - 1] || []));
      setFileName(file.name);
    } catch (fileError) {
      setError(fileError.message || "No se pudo leer el archivo.");
      setSheets([]);
    } finally {
      setBusy(false);
    }
  }

  function updateSheet(name) {
    const sheet = sheets.find((item) => item.name === name);
    const foundHeaderIndex = findHeaderRow(sheet?.rows || []);
    const nextHeader = foundHeaderIndex < 0 ? 0 : foundHeaderIndex + 1;
    setSheetName(name);
    setHeaderRow(nextHeader);
    setMapping(suggestMapping(sheet?.rows[nextHeader === 0 ? 0 : nextHeader - 1] || []));
    setResults([]);
    setRows([]);
  }

  function updateHeaderRow(value) {
    const nextHeader = Math.max(0, Math.min(Number(value) || 0, activeSheet?.rows.length || 0));
    setHeaderRow(nextHeader);
    setMapping(suggestMapping(activeSheet?.rows[nextHeader === 0 ? 0 : nextHeader - 1] || []));
    setResults([]);
    setRows([]);
  }

  function buildRows() {
    if (!activeSheet) return [];
    const start = headerRow === 0 ? 0 : headerRow;
    return activeSheet.rows.slice(start).map((row, index) => {
      const participant = {};
      FIELDS.forEach((field) => {
        const column = mapping[field.id];
        const value = column === "" || column === undefined ? "" : cellText(row[Number(column)]);
        if (field.id === "tipoDocumento") participant[field.id] = normalizeDocumentType(value);
        else if (field.id === "genero") participant[field.id] = normalizeGender(value);
        else if (["fechaNacimiento", "fechaEgreso"].includes(field.id)) participant[field.id] = normalizeDate(value);
        else participant[field.id] = value;
      });
      return { ...participant, fila: start + index + 1 };
    }).filter((row) => Object.entries(row)
      .some(([field, value]) => field !== "fila" && String(value || "").trim()));
  }

  async function validateFile() {
    const parsed = buildRows();
    if (!parsed.length) {
      setError("No hay filas de participantes para validar.");
      return;
    }
    if (parsed.length > MAX_ROWS) {
      setError(`El archivo contiene ${parsed.length} filas; el máximo por carga es ${MAX_ROWS}.`);
      return;
    }
    const missingFields = FIELDS.filter((field) => field.required && (mapping[field.id] === "" || mapping[field.id] === undefined));
    if (missingFields.length) {
      setError(`Asigna las columnas obligatorias: ${missingFields.map((field) => field.label).join(", ")}.`);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    setRows(parsed);
    setResults([]);
    try {
      const response = await validarPerfilesMasivo({ rol: role, participantes: parsed });
      setResults(response.resultados || []);
      const selectable = (response.resultados || []).filter((item) => item.status === "ready");
      setSelectedRows(new Set(selectable.map((item) => item.fila)));
      setConfirmRows(new Set());
      setMessage("Revisa las coincidencias. Las personas ya existentes requieren confirmación explícita para agregarles el nuevo rol.");
    } catch (validationError) {
      setError(validationError.message || "No se pudo validar el archivo.");
    } finally {
      setBusy(false);
    }
  }

  function toggleRow(rowNumber, checked) {
    if (!checked) {
      setConfirmRows((confirmed) => {
        const nextConfirmed = new Set(confirmed);
        nextConfirmed.delete(rowNumber);
        return nextConfirmed;
      });
    }
    setSelectedRows((current) => {
      const next = new Set(current);
      if (checked) next.add(rowNumber);
      else next.delete(rowNumber);
      return next;
    });
  }

  function toggleRoleConfirmation(rowNumber, checked) {
    setConfirmRows((current) => {
      const next = new Set(current);
      if (checked) next.add(rowNumber);
      else next.delete(rowNumber);
      return next;
    });
    if (checked) {
      setSelectedRows((current) => new Set(current).add(rowNumber));
    } else {
      setSelectedRows((current) => {
        const next = new Set(current);
        next.delete(rowNumber);
        return next;
      });
    }
  }

  async function saveSelected() {
    const selected = selectableResults.filter((result) => (
      selectedRows.has(result.fila)
      && (result.status !== "requires-confirmation" || confirmRows.has(result.fila))
    ));
    if (!selected.length) {
      setDialogOpen(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await registrarPerfilesMasivo({
        rol,
        participantes: rows,
        confirmarFilas: [...confirmRows],
      });
      const updated = response.resultados || [];
      setResults(updated);
      const created = updated.filter((item) => item.status === "created").length;
      const omitted = updated.filter((item) => ["omitted", "already-has-role", "external-conflict"].includes(item.status)).length;
      setMessage(`${created} perfiles creados.${omitted ? ` ${omitted} filas omitidas o no compatibles; revisa sus resultados.` : ""}`);
      if (created > 0) onSaved?.();
      setSelectedRows(new Set());
      setConfirmRows(new Set());
      setDialogOpen(false);
    } catch (saveError) {
      setError(saveError.message || "No se pudieron guardar los perfiles.");
    } finally {
      setBusy(false);
    }
  }

  const roleLabel = ROLES.find((item) => item.value === role)?.label || role;

  return (
    <section className="card vec-profile-import" aria-labelledby="vec-profile-import-title">
      <div className="vec-profile-import__heading">
        <span className="vec-profile-import__icon" aria-hidden="true"><i className="fas fa-file-excel"></i></span>
        <div>
          <span className="vec-profile-import__eyebrow">GESTIÓN DE PERFILES</span>
          <h2 id="vec-profile-import-title">Carga masiva de roles</h2>
          <p>Importa Egresados, Colaboradores o Externos directamente a sus perfiles VEC, sin inscribirlos en una actividad.</p>
        </div>
      </div>

      {error && <div className="auth-error" role="alert">{error}</div>}
      {message && <p className="vec-profile-import__message" role="status">{message}</p>}

      <div className="vec-profile-import__controls">
        <label>
          <span>Rol para todo este archivo</span>
          <select className="form-select" value={role} onChange={(event) => {
            setRole(event.target.value);
            setResults([]);
            setRows([]);
            setMessage("");
          }} disabled={busy}>
            {ROLES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="vec-profile-import__file">
          <span>Archivo de participantes</span>
          <input
            type="file"
            accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.tsv"
            onChange={onFileChange}
            disabled={busy}
          />
          <small>{fileName || "Excel o CSV · máximo 5 MB · hasta 500 filas"}</small>
        </label>
      </div>

      {activeSheet && (
        <>
          <div className="vec-profile-import__mapping">
            <label>
              <span>Hoja</span>
              <select className="form-select" value={sheetName} onChange={(event) => updateSheet(event.target.value)} disabled={busy}>
                {sheets.map((sheet) => <option value={sheet.name} key={sheet.name}>{sheet.name}</option>)}
              </select>
            </label>
            <label>
              <span>Fila de encabezados (0 = sin encabezados)</span>
              <input className="form-control" type="number" min="0" max={activeSheet.rows.length} value={headerRow} onChange={(event) => updateHeaderRow(event.target.value)} disabled={busy} />
            </label>
            {FIELDS.map((field) => (
              <label key={field.id}>
                <span>{field.label}{field.required ? " *" : ""}</span>
                <select
                  className="form-select"
                  value={mapping[field.id] ?? ""}
                  onChange={(event) => {
                    setMapping((current) => ({ ...current, [field.id]: event.target.value }));
                    setResults([]);
                    setRows([]);
                  }}
                  disabled={busy}
                >
                  <option value="">No asignar</option>
                  {headers.map((header, index) => (
                    <option value={String(index)} key={`${index}-${cellText(header)}`}>
                      {headerRow === 0 ? `Columna ${index + 1} (${cellText(header) || "valor"})` : cellText(header) || `Columna ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {headerRow === 0 && <p className="vec-profile-import__hint">El archivo no tiene encabezados. Asigna las columnas manualmente para identificar los datos de cada persona.</p>}
          <button className="btn btn-outline" type="button" onClick={validateFile} disabled={busy}>
            <i className={`fas ${busy ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true"></i>
            {busy ? "Validando..." : "Validar archivo"}
          </button>
        </>
      )}

      {results.length > 0 && (
        <>
          <div className="vec-profile-import__summary">
            <span><strong>{readyResults.length}</strong> perfiles nuevos listos</span>
            <span><strong>{confirmationResults.length}</strong> personas requieren confirmar nuevo rol</span>
            <span><strong>{results.filter((item) => !["ready", "requires-confirmation"].includes(item.status)).length}</strong> omitidas o con errores</span>
          </div>
          <div className="table-responsive vec-profile-import__table-wrap">
            <table className="table">
              <thead><tr><th>Incluir</th><th>Fila</th><th>Documento</th><th>Persona</th><th>Roles actuales</th><th>Resultado</th></tr></thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.fila}>
                    <td>
                      {["ready", "requires-confirmation"].includes(row.status) ? (
                        <input
                          type="checkbox"
                          checked={selectedRows.has(row.fila)}
                          aria-label={`Incluir fila ${row.fila}`}
                          onChange={(event) => toggleRow(row.fila, event.target.checked)}
                          disabled={busy}
                        />
                      ) : "—"}
                    </td>
                    <td>{row.fila}</td>
                    <td>{row.identificacion || "—"}</td>
                    <td>{[row.nombres, row.apellidos].filter(Boolean).join(" ") || "—"}</td>
                    <td>{row.roles?.map((item) => ROLE_LABELS[item] || item).join(", ") || "Sin perfil previo"}</td>
                    <td><span className={`vec-profile-import__status vec-profile-import__status--${row.status}`}>{row.message}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {confirmationResults.some((item) => selectedRows.has(item.fila)) && (
            <div className="vec-profile-import__confirm-list">
              <strong>Confirma explícitamente la asignación de un rol nuevo:</strong>
              {confirmationResults.filter((item) => selectedRows.has(item.fila)).map((item) => {
                const row = rows.find((candidate) => candidate.fila === item.fila);
                return (
                  <label key={item.fila}>
                    <input
                      type="checkbox"
                      checked={confirmRows.has(item.fila)}
                      onChange={(event) => toggleRoleConfirmation(item.fila, event.target.checked)}
                      disabled={busy}
                    />
                    <span>{[row?.nombres, row?.apellidos].filter(Boolean).join(" ")} · {row?.identificacion}: agregar {roleLabel} a sus roles actuales ({item.roles?.map((currentRole) => ROLE_LABELS[currentRole] || currentRole).join(", ") || "persona ya existente"}).</span>
                  </label>
                );
              })}
            </div>
          )}
          <div className="vec-profile-import__footer">
            <span>Se crearán perfiles sin inscribir a las personas en actividades. Los roles Externo son exclusivos.</span>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setDialogOpen(true)}
              disabled={busy || selectedCount === 0}
            >
              Revisar y guardar ({selectedCount})
            </button>
          </div>
        </>
      )}

      {dialogOpen && (
        <div className="vec-profile-import__overlay" role="presentation">
          <section className="vec-profile-import__dialog" role="dialog" aria-modal="true" aria-labelledby="vec-profile-confirm-title">
            <span className="vec-profile-import__dialog-icon" aria-hidden="true"><i className="fas fa-user-check"></i></span>
            <h3 id="vec-profile-confirm-title">Confirmar carga de perfiles</h3>
            <p>Se crearán {selectedCount} perfil{selectedCount === 1 ? "" : "es"} con rol {roleLabel}. No se inscribirán en actividades.</p>
            {confirmationResults.some((item) => selectedRows.has(item.fila) && confirmRows.has(item.fila)) && (
              <p>También se agregará este rol a {confirmationResults.filter((item) => selectedRows.has(item.fila) && confirmRows.has(item.fila)).length} persona(s) existente(s), con tu confirmación explícita.</p>
            )}
            <div>
              <button className="btn btn-outline" type="button" onClick={() => setDialogOpen(false)} disabled={busy}>Volver</button>
              <button className="btn btn-primary" type="button" onClick={saveSelected} disabled={busy}>
                {busy ? "Guardando..." : "Confirmar y crear perfiles"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export default ProfileBulkImport;
