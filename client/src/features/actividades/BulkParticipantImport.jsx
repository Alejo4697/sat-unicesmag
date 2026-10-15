import { useEffect, useState } from "react";
import {
  getCatalogoMaestroActividades,
  getEventosProximos,
  registrarParticipantesMasivo,
  validarParticipantesMasivo,
} from "./participantesApi.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 500;
const ROLE_ALIASES = new Map([
  ["ESTUDIANTE", "ESTUDIANTE"],
  ["COLABORADOR", "COLABORADOR"],
  ["DOCENTE", "COLABORADOR"],
  ["ADMINISTRATIVO", "COLABORADOR"],
  ["DIRECTIVO", "COLABORADOR"],
  ["PROFESIONAL", "COLABORADOR"],
  ["EGRESADO", "EGRESADO"],
  ["EXTERNO", "EXTERNO"],
]);

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("es");
}

function cellText(cell) {
  const value = cell?.value;
  if (value == null) return "";
  if (typeof value === "object" && !Array.isArray(value)) {
    if ("text" in value) return String(value.text || "").trim();
    if ("result" in value) return String(value.result ?? "").trim();
    if ("richText" in value) return value.richText.map((part) => part.text || "").join("").trim();
  }
  return String(value).trim().replace(/\.0$/, "");
}

function normalizeHeader(value) {
  return normalizeText(value)
    .replace(/^\d+/, "")
    .replace(/[^A-Z0-9]/g, "");
}

function findColumn(headers, aliases, matchesHeader) {
  const matches = [...headers.entries()]
    .filter(([header]) => aliases.includes(header) || matchesHeader(header))
    .map(([, column]) => column);
  const uniqueMatches = [...new Set(matches)];
  if (uniqueMatches.length > 1) {
    throw new Error("El archivo tiene más de una columna posible para el mismo dato. Deja solo una columna de cada dato requerido.");
  }
  return uniqueMatches[0] || null;
}

function modalityLabel(modality) {
  return modality?.subdivision || modality?.programaCompleto || "";
}

function displayDate(value) {
  const date = String(value || "").slice(0, 10);
  if (!date) return "";
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function eventLabel(event) {
  return [
    event.actividad,
    event.periodo,
    `${displayDate(event.fechaInicio)} – ${displayDate(event.fechaFinalizacion)}`,
  ].filter(Boolean).join(" · ");
}

function parseWorkbook(workbook, activity) {
  const sheet = workbook.worksheets.find((worksheet) => worksheet.actualRowCount > 0);
  if (!sheet) throw new Error("El archivo no contiene una hoja con participantes.");
  const headerRow = sheet.getRow(1);
  const headers = new Map();
  headerRow.eachCell((cell, column) => {
    const header = normalizeHeader(cellText(cell));
    if (header && headers.has(header)) {
      throw new Error(`El encabezado "${cellText(cell)}" aparece más de una vez. Revisa la primera fila del archivo.`);
    }
    if (header) headers.set(header, column);
  });

  const columnDefinitions = {
    identificacion: {
      aliases: [
        "CEDULA", "CEDULADECIUDADANIA", "NUMERODECEDULA", "NUMEROCEDULA",
        "NUMERODEIDENTIFICACION", "NUMEROIDENTIFICACION", "NOIDENTIFICACION",
        "NROIDENTIFICACION", "IDENTIFICACION", "NUMERODOCUMENTO",
        "NDEIDENTIFICACION", "NIDENTIFICACION", "DOCUMENTOIDENTIDAD",
        "DOCUMENTODEIDENTIDAD", "DOCUMENTO",
      ],
      matches: (header) => /(?:NUMERO|NO|NRO|N)(?:DE)?(?:IDENTIFICACION|DOCUMENTO)/.test(header)
        || /CEDULA/.test(header)
        || /DOCUMENTO(?:DE)?IDENTIDAD/.test(header),
    },
    rol: {
      aliases: ["ROL", "TIPO", "TIPODEPARTICIPANTE", "ROLDELPARTICIPANTE"],
      matches: (header) => /(?:ROL|TIPO).*(?:PARTICIPANTE|PERSONA)/.test(header),
    },
    nombres: {
      aliases: ["NOMBRES", "NOMBRE", "PRIMERNOMBRE"],
      matches: (header) => /^(?:NOMBRES?|PRIMERNOMBRE)$/.test(header),
    },
    apellidos: {
      aliases: ["APELLIDOS", "APELLIDO", "PRIMERAPELLIDO"],
      matches: (header) => /^(?:APELLIDOS?|PRIMERAPELLIDO)$/.test(header),
    },
    modalidad: {
      aliases: ["MODALIDADVARIABLE", "VARIABLEMODALIDAD", "MODALIDAD", "VARIABLE"],
      matches: (header) => /(?:MODALIDAD|VARIABLE)/.test(header),
    },
  };
  const columns = Object.fromEntries(Object.entries(columnDefinitions).map(([key, definition]) => [
    key,
    findColumn(headers, definition.aliases, definition.matches),
  ]));
  const requiredColumns = ["identificacion", "rol", "nombres", "apellidos"];
  if (activity.variablesModalidades?.length) requiredColumns.push("modalidad");
  const columnLabels = {
    identificacion: "Cédula",
    rol: "Rol",
    nombres: "Nombres",
    apellidos: "Apellidos",
    modalidad: "Modalidad / Variable",
  };
  const missing = requiredColumns.filter((key) => !columns[key]);
  if (missing.length) {
    throw new Error(`Faltan columnas requeridas: ${missing.map((key) => columnLabels[key]).join(", ")}.`);
  }

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const entry = {
      rowNumber,
      identificacion: columns.identificacion ? cellText(row.getCell(columns.identificacion)) : "",
      rolOriginal: columns.rol ? cellText(row.getCell(columns.rol)) : "",
      nombres: columns.nombres ? cellText(row.getCell(columns.nombres)) : "",
      apellidos: columns.apellidos ? cellText(row.getCell(columns.apellidos)) : "",
      modalidad: columns.modalidad ? cellText(row.getCell(columns.modalidad)) : "",
    };
    if (Object.values(entry).some((value) => String(value || "").trim())) rows.push(entry);
  });

  if (!rows.length) throw new Error("El archivo no contiene filas de participantes.");
  if (rows.length > MAX_ROWS) throw new Error(`El archivo supera el máximo de ${MAX_ROWS} participantes.`);

  return rows.map((entry) => {
    const role = ROLE_ALIASES.get(normalizeText(entry.rolOriginal)) || "";
    const base = { ...entry, id: `${entry.rowNumber}-${entry.identificacion}`, tipo: role };
    if (!entry.identificacion || !entry.nombres || !entry.apellidos) {
      return { ...base, status: "invalid", message: "Completa cédula, nombres y apellidos." };
    }
    if (!role) {
      return { ...base, status: "invalid", message: "Rol no válido. Usa Estudiante, Colaborador, Egresado o Externo." };
    }
    if (entry.identificacion.length > 64) {
      return { ...base, status: "invalid", message: "La cédula supera el máximo de 64 caracteres." };
    }
    const modality = (activity.variablesModalidades || []).find((item) => (
      normalizeText(modalityLabel(item)) === normalizeText(entry.modalidad)
      || normalizeText(item.programaCompleto) === normalizeText(entry.modalidad)
    ));
    if (activity.variablesModalidades?.length && !modality) {
      return { ...base, status: "invalid", message: "La modalidad no coincide con las opciones de esta actividad." };
    }
    if (modality && !modality.idTipoApoyo) {
      return { ...base, status: "invalid", message: "La modalidad no tiene un apoyo activo asociado." };
    }
    if (!activity.variablesModalidades?.length && entry.modalidad) {
      return { ...base, status: "invalid", message: "Esta actividad no tiene modalidades configuradas; deja esa celda vacía." };
    }
    return { ...base, modalidadSeleccionada: modality || null, status: "waiting", message: "Pendiente de validar." };
  });
}

async function createWorkbook() {
  const { default: ExcelJS } = await import("exceljs");
  return new ExcelJS.Workbook();
}

export default function BulkParticipantImport() {
  const [events, setEvents] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([getEventosProximos(), getCatalogoMaestroActividades()])
      .then(([availableEvents, masterCatalog]) => {
        if (!active) return;
        setEvents(availableEvents);
        setCatalog(masterCatalog);
      })
      .catch(() => active && setError("Hubo un error al cargar las actividades disponibles."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const selectedCatalog = catalog.find((item) => item.id === selectedEvent?.idCatalogoActividad);
  const validCount = rows.filter((row) => ["valid", "registered"].includes(row.status)).length;
  const invalidCount = rows.filter((row) => row.status === "invalid").length;
  const completedCount = rows.filter((row) => row.status === "registered").length;
  const readyToRegister = rows.length > 0 && rows.every((row) => row.status === "valid");
  const allRegistered = rows.length > 0 && completedCount === rows.length;
  function resetImport() {
    setRows([]);
    setMessage("");
    setError("");
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    resetImport();
    if (!file) return;
    if (!selectedEvent) {
      setError("Selecciona primero la actividad a la que se registrarán los participantes.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Carga un archivo Excel con formato .xlsx.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("El archivo supera el límite de 5 MB.");
      return;
    }

    setValidating(true);
    try {
      const workbook = await createWorkbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const parsedRows = parseWorkbook(workbook, selectedEvent);
      setRows(parsedRows.map((row) => ({
        ...row,
        status: "waiting",
        message: "Validando en el servidor...",
      })));
      try {
        const validation = await validarParticipantesMasivo({
          idActividad: selectedEvent.id,
          participantes: parsedRows.map((row) => ({
            fila: row.rowNumber,
            identificacion: row.identificacion,
            tipo: row.tipo,
            tipoDocumento: "CC",
            nombres: row.nombres,
            apellidos: row.apellidos,
            modalidadVariable: row.modalidadSeleccionada?.programaCompleto || row.modalidad,
            idTipoApoyo: selectedCatalog?.idTipoApoyoSugerido || "",
          })),
        });
        const validationsByRow = new Map(validation.filas.map((row) => [row.fila, row]));
        const prepared = parsedRows.map((row) => {
          const validated = validationsByRow.get(row.rowNumber);
          return {
            ...row,
            status: validated?.status || "invalid",
            message: validated?.message || "No se recibió el resultado de validación.",
            idTipoApoyo: validated?.idTipoApoyo || "",
          };
        });
        setRows(prepared);
        if (prepared.every((row) => row.status === "valid")) {
          setMessage(`${prepared.length} participantes validados. Puedes confirmar el registro.`);
        } else {
          setError("Hay filas con errores. Corrige el archivo y vuelve a cargarlo; no se registrará ningún participante mientras haya errores.");
        }
      } catch (validationError) {
        const messageText = validationError.message || "No se pudo validar la carga en el servidor.";
        setRows(parsedRows.map((row) => ({ ...row, status: "invalid", message: messageText })));
        throw validationError;
      }
    } catch (loadError) {
      setError(loadError.message || "No se pudo leer el archivo Excel.");
    } finally {
      setValidating(false);
    }
  }

  async function registerParticipants() {
    if (!selectedEvent || !readyToRegister) return;
    setRegistering(true);
    setError("");
    setMessage("");
    try {
      const result = await registrarParticipantesMasivo({
        idActividad: selectedEvent.id,
        participantes: rows.map((row) => ({
          fila: row.rowNumber,
          identificacion: row.identificacion,
          tipo: row.tipo,
          tipoDocumento: "CC",
          nombres: row.nombres,
          apellidos: row.apellidos,
          modalidadVariable: row.modalidadSeleccionada?.programaCompleto || "",
          idTipoApoyo: row.idTipoApoyo || selectedCatalog?.idTipoApoyoSugerido || "",
        })),
      });
      setRows(rows.map((row) => ({
        ...row,
        status: "registered",
        message: "Registro completado.",
      })));
      setMessage(`${result.registrados} participantes registrados correctamente.`);
    } catch (requestError) {
      const messageText = requestError.message || "No se pudo completar el registro masivo.";
      setRows(rows.map((row) => ({
        ...row,
        status: "invalid",
        message: messageText,
      })));
      setError(messageText);
    } finally {
      setRegistering(false);
    }
  }

  async function downloadTemplate() {
    if (!selectedEvent) return;
    const workbook = await createWorkbook();
    const sheet = workbook.addWorksheet("Participantes", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.columns = [
      { header: "Cédula", key: "cedula", width: 20 },
      { header: "Rol", key: "rol", width: 22 },
      { header: "Nombres", key: "nombres", width: 26 },
      { header: "Apellidos", key: "apellidos", width: 26 },
      { header: "Modalidad / Variable", key: "modalidad", width: 42 },
    ];
    const header = sheet.getRow(1);
    header.height = 26;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002855" } };
      cell.alignment = { vertical: "middle" };
    });
    sheet.autoFilter = { from: "A1", to: "E1" };
    sheet.dataValidations.add("B2:B501", {
      type: "list",
      allowBlank: false,
      formulae: ['"ESTUDIANTE,COLABORADOR,EGRESADO,EXTERNO"'],
    });
    if (selectedEvent.variablesModalidades?.length) {
      const optionsSheet = workbook.addWorksheet("Opciones");
      selectedEvent.variablesModalidades.forEach((item, index) => {
        optionsSheet.getCell(index + 1, 1).value = modalityLabel(item);
      });
      optionsSheet.state = "veryHidden";
      const end = selectedEvent.variablesModalidades.length;
      workbook.definedNames.add(`'Opciones'!$A$1:$A$${end}`, "ModalidadesActividad");
      sheet.dataValidations.add("E2:E501", {
        type: "list",
        allowBlank: false,
        formulae: ["ModalidadesActividad"],
      });
    } else {
      sheet.getCell("E2").note = "Deja esta columna vacía. Esta actividad no tiene variables/modalidades.";
    }
    const instructions = workbook.addWorksheet("Instrucciones");
    instructions.addRows([
      ["Plantilla para registrar participantes"],
      ["Completa una fila por participante. No cambies los encabezados."],
      ["Cédula: documento de identidad sin puntos ni espacios."],
      ["Rol: usa ESTUDIANTE, COLABORADOR, EGRESADO o EXTERNO."],
      ["Nombres y Apellidos: deben coincidir con los datos institucionales."],
      ["Modalidad / Variable: selecciona la opción exacta correspondiente a esta actividad."],
      ["No se registrará ninguna fila si hay errores de formato, identidad, rol o modalidad."],
      ["Actividad", eventLabel(selectedEvent)],
    ]);
    instructions.getColumn(1).width = 28;
    instructions.getColumn(2).width = 90;
    instructions.getRow(1).font = { bold: true, size: 14, color: { argb: "FF002855" } };
    instructions.eachRow((row) => {
      row.alignment = { vertical: "middle", wrapText: true };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla-participantes-actividad.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  }

  function onActivityChange(value) {
    setSelectedEventId(value);
    setRows([]);
    setError("");
    setMessage("");
  }

  return (
    <section className="card vec-bulk-registration">
      <header className="vec-bulk-registration__header">
        <span className="vec-bulk-registration__icon"><i className="fas fa-file-excel" aria-hidden="true"></i></span>
        <div>
          <span className="vec-bulk-registration__eyebrow">CARGA MASIVA</span>
          <h2>Registrar participantes desde Excel</h2>
          <p>Selecciona una actividad, carga la lista y revisa todos los registros antes de confirmarlos.</p>
        </div>
      </header>

      <div className="vec-bulk-registration__section">
        <label className="form-label" htmlFor="bulk-activity">1. Actividad disponible o pendiente</label>
        <select
          className="form-select"
          id="bulk-activity"
          value={selectedEventId}
          onChange={(event) => onActivityChange(event.target.value)}
          disabled={loading || registering}
        >
          <option value="">{loading ? "Cargando actividades..." : "Selecciona una actividad"}</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>{eventLabel(event)}</option>
          ))}
        </select>
        {!loading && !events.length && (
          <p className="vec-bulk-registration__hint">No hay actividades disponibles para registrar participantes.</p>
        )}
      </div>

      {selectedEvent && (
        <div className="vec-bulk-registration__activity">
          <div>
            <span className="vec-bulk-registration__eyebrow">ACTIVIDAD SELECCIONADA</span>
            <strong>{selectedEvent.actividad}</strong>
            <span>{selectedEvent.periodo} · {selectedEvent.ubicacion || "Ubicación no especificada"}</span>
          </div>
          {selectedEvent.variablesModalidades?.length > 0 ? (
            <div className="vec-bulk-registration__modalities">
              <span>Modalidades que deben asignarse en cada fila del Excel</span>
              <div>
                {selectedEvent.variablesModalidades.map((item) => (
                  <span className="vec-bulk-registration__chip" key={item.programaCompleto}>
                    {modalityLabel(item)}
                    {item.tipoApoyo && <small>{item.tipoApoyo}</small>}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <span className="vec-bulk-registration__no-modalities">Sin variables / modalidades configuradas</span>
          )}
        </div>
      )}

      <div className="vec-bulk-registration__section">
        <div className="vec-bulk-registration__file-heading">
          <div>
            <label className="form-label" htmlFor="bulk-file">2. Archivo de participantes (.xlsx)</label>
            <p>También acepta Excel descargado de Google Forms: reconoce variantes comunes de los encabezados (como “Cédula” o “Número de identificación”).</p>
          </div>
          <button
            className="btn btn-outline btn-sm"
            type="button"
            onClick={() => {
              setError("");
              downloadTemplate().catch(() => setError("Hubo un error al generar la plantilla."));
            }}
            disabled={!selectedEvent || registering}
          >
            <i className="fas fa-download" aria-hidden="true"></i> Descargar plantilla
          </button>
        </div>
        <label className={`vec-bulk-registration__dropzone${!selectedEvent ? " is-disabled" : ""}`} htmlFor="bulk-file">
          <i className="fas fa-cloud-arrow-up" aria-hidden="true"></i>
          <strong>{validating ? "Leyendo y verificando archivo..." : "Selecciona el archivo Excel"}</strong>
          <span>Máximo {MAX_ROWS} participantes y 5 MB. Solo formato .xlsx.</span>
          <input
            id="bulk-file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFile}
            disabled={!selectedEvent || validating || registering}
          />
        </label>
      </div>

      {error && <div className="auth-error vec-bulk-registration__alert" role="alert">{error}</div>}
      {message && <div className="autosave-banner vec-bulk-registration__alert" role="status">{message}</div>}

      {rows.length > 0 && (
        <div className="vec-bulk-preview">
          <div className="vec-bulk-preview__header">
            <div>
              <span className="vec-bulk-registration__eyebrow">REVISIÓN</span>
              <h3>Participantes cargados</h3>
              <p>Se debe corregir cualquier fila marcada con error antes de iniciar el registro.</p>
            </div>
            <div className="vec-bulk-preview__counts" aria-label="Resumen de validación">
              <span><strong>{rows.length}</strong> total</span>
              <span className="is-valid"><strong>{validCount}</strong> válidos</span>
              <span className="is-invalid"><strong>{invalidCount}</strong> con error</span>
            </div>
          </div>

          {registering && (
            <div className="vec-bulk-progress" role="status">
              <span>Validando y registrando la lista completa de forma atómica...</span>
              <progress />
            </div>
          )}

          <div className="table-responsive vec-bulk-preview__table">
            <table className="table">
              <thead>
                <tr><th>Fila</th><th>Cédula</th><th>Participante</th><th>Rol</th><th>Modalidad / Variable</th><th>Validación</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.rowNumber}</td>
                    <td>{row.identificacion || "—"}</td>
                    <td>{[row.nombres, row.apellidos].filter(Boolean).join(" ") || "—"}</td>
                    <td>{row.tipo || row.rolOriginal || "—"}</td>
                    <td>{row.modalidadSeleccionada ? modalityLabel(row.modalidadSeleccionada) : row.modalidad || "—"}</td>
                    <td>
                      <span className={`vec-bulk-row-status vec-bulk-row-status--${row.status}`}>
                        {row.status === "valid" ? "Válido" : row.status === "invalid" ? "Corregir" : row.status === "registered" ? "Registrado" : row.status === "failed" ? "Falló" : row.status === "registering" ? "Registrando" : "Validando"}
                      </span>
                      <small className="vec-bulk-row-message">{row.message}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="vec-bulk-preview__actions">
            {completedCount > 0 && completedCount === rows.length && (
              <span className="vec-bulk-preview__complete"><i className="fas fa-check-circle" aria-hidden="true"></i> Proceso finalizado</span>
            )}
            <button
              className="btn btn-primary"
              type="button"
              onClick={registerParticipants}
              disabled={registering || validating || invalidCount > 0 || !readyToRegister}
            >
              <i className={`fas ${registering ? "fa-spinner fa-spin" : "fa-users"}`} aria-hidden="true"></i>
              {allRegistered ? "Participantes registrados" : registering ? "Registrando lista..." : `Registrar ${validCount} participantes`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}