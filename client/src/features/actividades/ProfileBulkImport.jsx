import { useMemo, useState } from "react";
import * as XLSX from "@e965/xlsx";
import { registrarPerfilesMasivo, validarPerfilesMasivo } from "./participantesApi.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 500;
const ROLES = [
  { value: "COLABORADOR", label: "Colaboradores", singular: "Colaborador", icon: "fa-user-tie" },
  { value: "ADMINISTRATIVO", label: "Administrativos", singular: "Administrativo", icon: "fa-user-gear" },
  { value: "EGRESADO", label: "Egresados", singular: "Egresado", icon: "fa-user-graduate" },
  { value: "EXTERNO", label: "Externos", singular: "Externo", icon: "fa-user-group" },
];
const ROLE_LABELS = {
  ESTUDIANTE: "Estudiante",
  EGRESADO: "Egresado",
  COLABORADOR: "Colaborador",
  ADMINISTRATIVO: "Administrativo",
  EXTERNO: "Externo",
};
const FIELDS = [
  { id: "identificacion", label: "Documento de identidad", aliases: ["DOCUMENTO", "IDENTIFICACION", "NUMERODOCUMENTO", "NUMEROIDENTIFICACION", "CEDULA", "CEDULADECIUDADANIA"] },
  { id: "nombres", label: "Nombres", aliases: ["NOMBRES", "NOMBRE", "NOMBRECOMPLETO", "NOMBRESYAPELLIDOS", "PRIMERNOMBRE"] },
  { id: "apellidos", label: "Apellidos", aliases: ["APELLIDOS", "APELLIDO", "PRIMERAPELLIDO"] },
  { id: "tipoDocumento", label: "Tipo de documento", aliases: ["TIPODOCUMENTO", "TIPODEDOCUMENTO", "TIPOIDENTIFICACION"] },
  { id: "fechaNacimiento", label: "Fecha de nacimiento", aliases: ["FECHANACIMIENTO", "FECHADENACIMIENTO"] },
  { id: "lugarNacimiento", label: "Lugar de nacimiento", aliases: ["LUGARDENACIMIENTO", "LUGARNACIMIENTO"] },
  { id: "genero", label: "Género", aliases: ["GENERO", "SEXO"] },
  { id: "correo", label: "Correo", aliases: ["CORREOPERSONAL", "CORREO", "EMAIL", "CORREOELECTRONICO"] },
  { id: "celular", label: "Celular", aliases: ["CELULAR", "MOVIL", "TELEFONOMOVIL"] },
  { id: "telefono", label: "Teléfono alternativo", aliases: ["TELEFONO", "TELEFONOFIJO", "TELEFONOALTERNATIVO"] },
  { id: "direccion", label: "Dirección", aliases: ["DIRECCION", "DIRECCIONRESIDENCIA"] },
  { id: "municipio", label: "Municipio", aliases: ["MUNICIPIO", "CIUDAD", "MUNICIPIORESIDENCIA"] },
  { id: "fechaEgreso", label: "Fecha de egreso", aliases: ["FECHAEGRESO", "FECHADEEGRESO"] },
  { id: "programaAcademico", label: "Programa académico", aliases: ["PROGRAMAACADEMICO", "PROGRAMA"] },
  { id: "programaPosgradoDependencia", label: "Programa de posgrado", aliases: ["PROGRAMAPOSGRADO", "PROGRAMADEPOSGRADO"] },
  { id: "dependencia", label: "Dependencia", aliases: ["DEPENDENCIA", "DEPENDENCIADETRABAJO"] },
  { id: "cargo", label: "Cargo", aliases: ["CARGO", "CARGODESEMPENO", "PUESTO"] },
  { id: "etnia", label: "Etnia", aliases: ["ETNIA", "GRUPOETNICO"] },
  { id: "discapacidad", label: "Discapacidad", aliases: ["DISCAPACIDAD"] },
];

function requiredFieldsForRole(selectedRole) {
  return selectedRole === "ADMINISTRATIVO"
    ? ["identificacion", "nombres", "correo"]
    : ["identificacion", "nombres", "apellidos", "tipoDocumento", "correo"];
}

function isRequiredField(field, selectedRole) {
  return requiredFieldsForRole(selectedRole).includes(field.id);
}

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
  const [resultsFilter, setResultsFilter] = useState("todos");
  const [selectedRows, setSelectedRows] = useState(() => new Set());
  const [confirmRows, setConfirmRows] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cargaOpen, setCargaOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const activeSheet = sheets.find((sheet) => sheet.name === sheetName);
  const headers = activeSheet?.rows[headerRow === 0 ? 0 : headerRow - 1] || [];
  const readyResults = results.filter((result) => result.status === "ready");
  const confirmationResults = results.filter((result) => result.status === "requires-confirmation");
  const withExistingRolesResults = results.filter((result) => result.roles?.length > 0);
  const issuesResults = results.filter((result) => !["ready", "requires-confirmation"].includes(result.status));
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
  const visiblePreviewRows = useMemo(() => {
    if (resultsFilter === "roles-previos") {
      return previewRows.filter((row) => row.roles?.length > 0);
    }
    if (resultsFilter === "listos") {
      return previewRows.filter((row) => row.status === "ready");
    }
    if (resultsFilter === "inconvenientes") {
      return previewRows.filter((row) => !["ready", "requires-confirmation"].includes(row.status));
    }
    return previewRows;
  }, [previewRows, resultsFilter]);

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
      if (role === "ADMINISTRATIVO" && participant.nombres && !participant.apellidos) {
        const parts = participant.nombres.split(/\s+/).filter(Boolean);
        const splitAt = Math.ceil(parts.length / 2);
        participant.nombres = parts.slice(0, splitAt).join(" ");
        participant.apellidos = parts.slice(splitAt).join(" ");
      }
      if (role === "ADMINISTRATIVO" && !participant.tipoDocumento) {
        participant.tipoDocumento = "CC";
      }
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
    const requiredFields = requiredFieldsForRole(role);
    const missingFields = FIELDS.filter((field) => requiredFields.includes(field.id)
      && (mapping[field.id] === "" || mapping[field.id] === undefined));
    if (missingFields.length) {
      const labels = missingFields.map((field) => (
        role === "ADMINISTRATIVO" && field.id === "nombres" ? "Nombre completo" : field.label
      ));
      setError(`Asigna las columnas obligatorias: ${labels.join(", ")}.`);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    setRows(parsed);
    setResults([]);
    try {
      const response = await validarPerfilesMasivo({ rol: role, participantes: parsed });
      const validatedResults = response.resultados || [];
      setResults(validatedResults);
      setResultsFilter(validatedResults.some((item) => item.roles?.length > 0) ? "roles-previos" : "todos");
      const selectable = validatedResults.filter((item) => (
        ["ready", "requires-confirmation"].includes(item.status)
      ));
      setSelectedRows(new Set(selectable.map((item) => item.fila)));
      setConfirmRows(new Set());
      setMessage("Revisa las coincidencias. Para personas existentes, confirma también la casilla que autoriza agregar el nuevo rol.");
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
        rol: role,
        participantes: rows.filter((row) => selectedRows.has(row.fila)),
        confirmarFilas: [...confirmRows].filter((fila) => selectedRows.has(fila)),
      });
      const updated = response.resultados || [];
      setResults(updated);
      const created = updated.filter((item) => item.status === "created").length;
      const omitted = updated.filter((item) => ["omitted", "already-has-role", "external-conflict"].includes(item.status)).length;
      const failed = updated.filter((item) => item.status === "failed").length;
      setMessage(
        `${created} perfiles creados.`
        + (omitted ? ` ${omitted} filas omitidas o no compatibles; revisa sus resultados.` : "")
        + (failed ? ` ${failed} filas no se pudieron guardar; revisa el mensaje de cada fila.` : ""),
      );
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

  const roleLabel = ROLES.find((item) => item.value === role)?.singular || role;

  function selectRole(nextRole) {
    if (busy || role === nextRole) return;
    setRole(nextRole);
    setResults([]);
    setRows([]);
    setSelectedRows(new Set());
    setConfirmRows(new Set());
    setMessage("");
    setError("");
  }

  function openImporter(nextRole) {
    if (role !== nextRole) selectRole(nextRole);
    setCargaOpen(true);
  }

  return (
    <section className="card vec-profile-import" aria-labelledby="vec-profile-import-title">
      <div className="vec-profile-import__heading">
        <span className="vec-profile-import__icon" aria-hidden="true"><i className="fas fa-file-excel"></i></span>
        <div>
          <span className="vec-profile-import__eyebrow">GESTIÓN DE PERFILES</span>
          <h2 id="vec-profile-import-title">Carga masiva de roles</h2>
          <p>Selecciona el rol, carga su listado y revisa los registros antes de crearlos en sus perfiles VEC, sin inscribirlos en actividades.</p>
        </div>
      </div>

      {!cargaOpen && error && <div className="auth-error" role="alert">{error}</div>}
      {!cargaOpen && message && <p className="vec-profile-import__message" role="status">{message}</p>}

      <div className="vec-profile-import__role-shortcuts" role="group" aria-label="Seleccionar rol para importar">
        {ROLES.map((item) => (
          <button
            className={`vec-profile-import__role-shortcut is-role-${item.value.toLowerCase()}${role === item.value ? " is-active" : ""}`}
            type="button"
            key={item.value}
            aria-pressed={role === item.value}
            onClick={() => openImporter(item.value)}
            disabled={busy}
          >
            <i className={`fas ${item.icon}`} aria-hidden="true"></i>
            <span>Cargar {item.label.toLowerCase()}</span>
            <i className="fas fa-arrow-right vec-profile-import__role-arrow" aria-hidden="true"></i>
          </button>
        ))}
      </div>

      {cargaOpen && (
        <div
          className="vec-profile-import__workspace-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setCargaOpen(false);
          }}
        >
          <section
            className={`vec-profile-import__workspace is-role-${role.toLowerCase()}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="vec-profile-import-workspace-title"
          >
            <header className="vec-profile-import__workspace-heading">
              <span className="vec-profile-import__icon" aria-hidden="true">
                <i className={`fas ${ROLES.find((item) => item.value === role)?.icon || "fa-file-excel"}`}></i>
              </span>
              <div>
                <span className="vec-profile-import__eyebrow">CARGA SEGURA DE PERSONAS</span>
                <h2 id="vec-profile-import-workspace-title">Cargar {roleLabel.toLowerCase()} desde Excel</h2>
                <p>Primero escoges el archivo, luego revisas la lista y al final decides qué personas guardar.</p>
              </div>
              <button
                className="vec-profile-import__workspace-close"
                type="button"
                onClick={() => setCargaOpen(false)}
                disabled={busy}
                aria-label="Cerrar ventana de carga"
              >
                <i className="fas fa-xmark" aria-hidden="true"></i>
              </button>
            </header>

            {!dialogOpen && error && <div className="auth-error" role="alert">{error}</div>}
            {!dialogOpen && message && <p className="vec-profile-import__message" role="status">{message}</p>}

            <div className="vec-profile-import__instructions">
              <h3><i className="fas fa-circle-info" aria-hidden="true"></i> ¿Cómo debe estar organizado el Excel?</h3>
              <p>Piensa en el Excel como una tabla: la primera fila dice qué significa cada columna y cada fila de abajo es una persona. No necesitas usar exactamente estos nombres; también aceptamos los nombres alternativos.</p>
              <div className="vec-profile-import__requirements">
                <section>
                  <strong><i className="fas fa-asterisk" aria-hidden="true"></i> Estas columnas sí son necesarias</strong>
                  {role === "ADMINISTRATIVO" ? (
                    <ul>
                      <li><b>Cédula o documento de identidad</b></li>
                      <li><b>Nombre completo</b> (una sola columna)</li>
                      <li><b>Correo</b></li>
                    </ul>
                  ) : (
                    <ul>
                      <li><b>Documento de identidad</b></li>
                      <li><b>Nombres y apellidos</b></li>
                      <li><b>Tipo de documento:</b> CC, TI, CE, PA, entre otros.</li>
                      <li><b>Correo</b></li>
                    </ul>
                  )}
                </section>
                <section>
                  <strong><i className="fas fa-plus" aria-hidden="true"></i> Estas columnas son opcionales</strong>
                  <p>Puedes incluir Fecha de nacimiento, Género, celular, dirección, municipio, Lugar de nacimiento, Teléfono alternativo, Fecha de egreso, Programa académico, Programa de posgrado, Dependencia, Cargo, Etnia o Discapacidad. Si no los tienes, déjalos fuera.</p>
                </section>
              </div>
              <p className="vec-profile-import__example">
                <strong>Ejemplo de encabezados:</strong> {role === "ADMINISTRATIVO"
                  ? "Cédula | Nombre completo | Correo"
                  : "Documento | Nombres | Apellidos | Tipo de documento | Correo"}
              </p>
              <ol className="vec-profile-import__steps">
                <li>Pon los títulos arriba y una persona en cada fila.</li>
                <li>Usa fechas como <b>21/10/2000</b> o <b>2000-10-21</b> y deja los documentos como texto para no perder ceros al inicio.</li>
                <li>Guarda como Excel o CSV. Aceptamos archivos de hasta 5 MB y 500 personas.</li>
                <li>El sistema busca los títulos en las primeras 20 filas. Si no los reconoce o tienen otros nombres, podrás escoger qué columna corresponde a cada dato antes de revisar.</li>
              </ol>
              <p className="vec-profile-import__privacy-note">
                <i className="fas fa-shield-halved" aria-hidden="true"></i>
                El archivo se usa para revisar y crear perfiles de {roleLabel.toLowerCase()}; no inscribe a las personas en actividades.
              </p>
            </div>

      <div className="vec-profile-import__controls">
        <label className="vec-profile-import__role-control">
          <span><i className="fas fa-user-tag" aria-hidden="true"></i> Rol que tendrán las personas de este archivo</span>
          <select className="form-select" value={role} onChange={(event) => {
            selectRole(event.target.value);
          }} disabled={busy}>
            {ROLES.map((item) => <option value={item.value} key={item.value}>{item.singular}</option>)}
          </select>
          <small>Este rol se aplicará a todos los perfiles que guardes en esta carga.</small>
        </label>
        <label className="vec-profile-import__file vec-profile-import__file-picker">
          <input
            type="file"
            accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.tsv"
            onChange={onFileChange}
            disabled={busy}
          />
          <span className="vec-profile-import__file-picker-icon" aria-hidden="true">
            <i className={`fas ${busy ? "fa-spinner fa-spin" : "fa-file-excel"}`}></i>
          </span>
          <span className="vec-profile-import__file-picker-copy">
            <strong>{busy ? "Procesando archivo..." : fileName || "Selecciona tu archivo Excel o CSV"}</strong>
            <small>Máximo 5 MB · hasta 500 personas · revisa antes de guardar</small>
          </span>
          <span className="vec-profile-import__file-picker-action">
            <i className="fas fa-folder-open" aria-hidden="true"></i>
            Explorar archivos
          </span>
        </label>
      </div>

      {activeSheet && (
        <>
          <details className="vec-profile-import__advanced">
            <summary>
              <span><i className="fas fa-sliders" aria-hidden="true"></i> Opciones avanzadas</span>
              <small>Para corregir cómo se leen las columnas</small>
            </summary>
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
                  <span>
                    {role === "ADMINISTRATIVO" && field.id === "nombres" ? "Nombre completo / nombres" : field.label}
                    {isRequiredField(field, role) ? " *" : ""}
                  </span>
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
          </details>
          <button className="btn btn-outline" type="button" onClick={validateFile} disabled={busy}>
            <i className={`fas ${busy ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true"></i>
            {busy ? "Validando..." : "Validar archivo"}
          </button>
        </>
      )}

      {results.length > 0 && (
        <>
          <div className="vec-profile-import__summary">
            <span><strong>{readyResults.length}</strong> perfiles de {roleLabel.toLowerCase()} listos</span>
            <span><strong>{confirmationResults.length}</strong> personas requieren confirmar nuevo rol</span>
            <span><strong>{issuesResults.length}</strong> omitidas o con errores</span>
          </div>
          <div className="vec-profile-import__result-filters" role="group" aria-label="Filtrar personas validadas">
            <button
              type="button"
              className={resultsFilter === "todos" ? "is-active" : ""}
              aria-pressed={resultsFilter === "todos"}
              onClick={() => setResultsFilter("todos")}
            >
              Todas <span>{results.length}</span>
            </button>
            <button
              type="button"
              className={resultsFilter === "roles-previos" ? "is-active" : ""}
              aria-pressed={resultsFilter === "roles-previos"}
              onClick={() => setResultsFilter("roles-previos")}
            >
              Con roles previos <span>{withExistingRolesResults.length}</span>
            </button>
            <button
              type="button"
              className={resultsFilter === "listos" ? "is-active" : ""}
              aria-pressed={resultsFilter === "listos"}
              onClick={() => setResultsFilter("listos")}
            >
              Listas para crear <span>{readyResults.length}</span>
            </button>
            <button
              type="button"
              className={resultsFilter === "inconvenientes" ? "is-active" : ""}
              aria-pressed={resultsFilter === "inconvenientes"}
              onClick={() => setResultsFilter("inconvenientes")}
            >
              Omitidas o con errores <span>{issuesResults.length}</span>
            </button>
          </div>
          <div className="table-responsive vec-profile-import__table-wrap">
            <table className="table">
              <thead><tr><th>Incluir</th><th>Fila</th><th>Documento</th><th>Persona</th><th>Roles actuales</th><th>Agregar rol</th><th>Resultado</th></tr></thead>
              <tbody>
                {visiblePreviewRows.map((row) => (
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
                    <td>
                      {row.roles?.length ? (
                        <div className="vec-profile-import__role-badges">
                          {row.roles.map((item) => (
                            <span key={item}>{ROLE_LABELS[item] || item}</span>
                          ))}
                        </div>
                      ) : "Sin perfil previo"}
                    </td>
                    <td>
                      {row.status === "requires-confirmation" ? (
                        <label className="vec-profile-import__inline-role">
                          <input
                            type="checkbox"
                            checked={confirmRows.has(row.fila)}
                            aria-label={`Agregar ${roleLabel} al perfil de ${row.nombres || "esta persona"}`}
                            onChange={(event) => toggleRoleConfirmation(row.fila, event.target.checked)}
                            disabled={busy}
                          />
                          <span><i className="fas fa-user-plus" aria-hidden="true"></i> Agregar {roleLabel}</span>
                        </label>
                      ) : row.status === "ready" ? (
                        <span className="vec-profile-import__new-role">Se creará {roleLabel}</span>
                      ) : "—"}
                    </td>
                    <td><span className={`vec-profile-import__status vec-profile-import__status--${row.status}`}>{row.message}</span></td>
                  </tr>
                ))}
                {visiblePreviewRows.length === 0 && (
                  <tr>
                    <td colSpan="7" className="vec-profile-import__filter-empty">
                      No hay personas en esta categoría.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
          </section>
        </div>
      )}

      {dialogOpen && (
        <div className="vec-profile-import__overlay" role="presentation">
          <section className="vec-profile-import__dialog" role="dialog" aria-modal="true" aria-labelledby="vec-profile-confirm-title">
            <span className="vec-profile-import__dialog-icon" aria-hidden="true"><i className="fas fa-user-check"></i></span>
            <h3 id="vec-profile-confirm-title">Confirmar carga de perfiles</h3>
            {error && <div className="auth-error" role="alert">{error}</div>}
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
