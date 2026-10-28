import { useMemo, useState } from "react";
import * as XLSX from "@e965/xlsx";
import {
  confirmarImportacionActividades,
  previsualizarImportacionActividades,
} from "./participantesApi.js";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const SHEET_ROLES = new Map([
  ["ESTUDIANTES", "ESTUDIANTE"],
  ["COLABORADORES", "COLABORADOR"],
  ["EGRESADOS", "EGRESADO"],
  ["EXTERNOS", "EXTERNO"],
  ["ADMINISTRATIVOS", "ADMINISTRATIVO"],
  ["ADMINISTRATIVO", "ADMINISTRATIVO"],
]);
const FIELD_ALIASES = {
  periodo: ["PERIODO", "PERIODOACADEMICO"],
  identificacion: [
    "IDENTIFICACION",
    "NOIDENTIFICACION",
    "NUMERODEIDENTIFICACION",
    "NUMEROIDENTIFICACION",
    "DOCUMENTO",
  ],
  codigo: [
    "CODIGO",
    "CODIGOESTUDIANTE",
    "CODIGOESTUDIANTIL",
    "CODIGOEXTERNO",
    "CODIGOINSTITUCIONAL",
  ],
  correo: [
    "CORREO",
    "CORREOELECTRONICO",
    "CORREOINSTITUCIONAL",
    "EMAIL",
    "MAIL",
  ],
  actividad: ["ACTIVIDAD", "NOMBREACTIVIDAD", "ACTIVIDADREALIZADA"],
  descripcion: ["DESCRIPCIONACTIVIDAD"],
  proyecto: ["PROYECTO"],
  tipoActividad: ["TIPOACTIVIDAD"],
  alianza: ["ALIANZASINTERINSTITUCIONAL", "ALIANZAINTERINSTITUCIONAL"],
  entidadAlianza: ["ENTIDADALIANZA"],
  articulacion: ["ARTICULACIONINSTITUCIONAL"],
  dependencia: ["DEPENDENCIA"],
  modalidad: ["MODALIDAD"],
  fechaInicio: [
    "FECHAINICIO",
    "FECHAINICIAL",
    "FECHAINICIODDMMYYYY",
    "FECHAINICIODDMMAAAA",
    "FECHADEINICIO",
  ],
  fechaFinalizacion: [
    "FECHAFINALIZACION",
    "FECHAFIN",
    "FECHAFINAL",
    "FECHAFINALIZACIONDDMMYYYY",
    "FECHAFINALIZACIONDDMMAAAA",
    "FECHADEFINALIZACION",
  ],
  programaBienestar: ["PROGRAMADEBIENESTAR", "PROGRAMA"],
  componente: ["COMPONENTE"],
  lineaAccion: ["LINEADEACCIONAREA", "LINEADEACCION"],
  estrategiaBienestar: ["ESTRATEGIAPOLITICADEBIENESTAR"],
  estrategiaPermanencia: ["ESTRATEGIAPOLITICADEPERMANENCIAYGRADUACION"],
  estrategiaInclusiva: ["ESTRATEGIAPOLITICADEEDUCACIONINCLUSIVA"],
  tipoApoyo: ["TIPOAPOYO", "TIPODEAPOYO", "APOYO"],
};

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("es");
}

function normalizeHeader(value) {
  return normalizeText(value).replace(/[^A-Z0-9]/g, "");
}

function hasHeader(headers, field) {
  return headers.some((header) => columnMatchesHeader(header, field));
}

function columnMatchesHeader(header, field) {
  if (FIELD_ALIASES[field].includes(header)) return true;
  if (field === "fechaInicio") {
    return /^(FECHA)?INICIO$/.test(header) || header.includes("FECHAINICIO");
  }
  if (field === "fechaFinalizacion") {
    return /^(FECHA)?(FIN|FINAL|FINALIZACION)$/.test(header)
      || header.includes("FECHAFINAL");
  }
  if (field !== "programaBienestar" || !header.startsWith("PROGRAMA"))
    return false;
  return !/(ACADEMICO|PREGRADO|POSGRADO|ESTUDIO|CURSA)/.test(header);
}

function findColumn(headers, field, aliases) {
  const exactMatch = headers.findIndex((header) => aliases.includes(header));
  if (exactMatch >= 0) return exactMatch;
  return field === "programaBienestar"
    ? headers.findIndex((header) => columnMatchesHeader(header, field))
    : -1;
}

function cellText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function periodoAcademicoDesdeFecha(value) {
  const text = cellText(value);
  const matches = text.match(
    /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/g,
  );
  if (!matches?.length) return text;
  const firstDate = matches[0].match(/\d{4}[-/](\d{1,2})[-/]\d{1,2}/);
  if (!firstDate) return text;
  const year = Number(firstDate[0].slice(0, 4));
  const month = Number(firstDate[0].split(/[-/]/)[1]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return text;
  return `${year}-${month <= 6 ? 1 : 2}`;
}

function normalizarPeriodoAcademico(value) {
  const text = normalizeText(value);
  const yearMatch = text.match(/((?:19|20)\d{2})/);
  if (!yearMatch) return cellText(value);
  const prefix = text.slice(0, yearMatch.index);
  const suffix = text.slice(yearMatch.index + yearMatch[0].length);
  if (/SEGUNDO|IIP|II/.test(prefix) || /^2/.test(suffix)) {
    return `${yearMatch[1]}-2`;
  }
  if (/PRIMER|IP$|(?:^|[^I])I$/.test(prefix) || /^[1I]/.test(suffix)) {
    return `${yearMatch[1]}-1`;
  }
  return cellText(value);
}

function programaBienestarGeneral(value) {
  const nombre = cellText(value);
  const separador = nombre.indexOf(" - ");
  if (separador >= 0) return nombre.slice(0, separador).trim();
  const agregadoFinal = nombre.match(
    / \((participantes|grupos?)(?=[ )])([^()]*)\)$/i,
  );
  return agregadoFinal ? nombre.slice(0, agregadoFinal.index).trim() : nombre;
}

function fechaIsoSegura(year, month, day) {
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === iso
    ? iso
    : "";
}

function toIsoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return fechaIsoSegura(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + Math.floor(value) * 86400000);
    return fechaIsoSegura(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  const text = cellText(value).replace(/[.]/g, "/");
  if (!text) return "";
  let year;
  let month;
  let day;
  let match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (match) {
    [, year, month, day] = match;
    return fechaIsoSegura(year, month, day);
  }
  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (match) {
    let first;
    let second;
    [, first, second, year] = match;
    if (year.length === 2) year = Number(year) >= 50 ? `19${year}` : `20${year}`;
    if (Number(first) > 12) {
      day = first;
      month = second;
    } else if (Number(second) > 12) {
      month = first;
      day = second;
    } else {
      // When both parts are possible, prefer the commonly used day/month format.
      day = first;
      month = second;
    }
    return fechaIsoSegura(year, month, day);
  }
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    return fechaIsoSegura(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }
  return "";
}

function parseSupportNumber(value) {
  const match = normalizeText(value).match(/\bAPOYO\s*(\d{1,2})\b/);
  return match ? Number(match[1]) : null;
}

function valueAt(row, columns, field) {
  const index = columns[field];
  return index < 0 ? "" : cellText(row[index]);
}

function rawValueAt(row, columns, field) {
  const index = columns[field];
  return index < 0 ? "" : row[index];
}

function makeActivity(row, columns) {
  const allianceValue = normalizeText(valueAt(row, columns, "alianza"));
  return {
    period: normalizarPeriodoAcademico(
      periodoAcademicoDesdeFecha(valueAt(row, columns, "periodo")),
    ),
    activity: valueAt(row, columns, "actividad"),
    project: valueAt(row, columns, "proyecto"),
    start: toIsoDate(rawValueAt(row, columns, "fechaInicio")),
    end: toIsoDate(rawValueAt(row, columns, "fechaFinalizacion")),
    wellbeing: programaBienestarGeneral(
      valueAt(row, columns, "programaBienestar"),
    ),
    description: valueAt(row, columns, "descripcion"),
    activityType: valueAt(row, columns, "tipoActividad"),
    alliance: ["SI", "SÍ", "YES", "1", "TRUE"].includes(allianceValue)
      ? true
      : ["NO", "0", "FALSE"].includes(allianceValue)
        ? false
        : null,
    allianceEntity: valueAt(row, columns, "entidadAlianza"),
    articulation: valueAt(row, columns, "articulacion"),
    dependency: valueAt(row, columns, "dependencia"),
    modality: valueAt(row, columns, "modalidad"),
    component: valueAt(row, columns, "componente"),
    actionLine: valueAt(row, columns, "lineaAccion"),
    strategyWellbeing: valueAt(row, columns, "estrategiaBienestar"),
    strategyRetention: valueAt(row, columns, "estrategiaPermanencia"),
    strategyInclusive: valueAt(row, columns, "estrategiaInclusiva"),
  };
}

function activityKey(activity) {
  return [
    activity.period,
    activity.activity,
    activity.project,
    activity.start,
    activity.end,
    activity.wellbeing,
  ]
    .map(normalizeText)
    .join("\u001f");
}

function readWorkbook(file) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
      codepage: 65001,
    });
    const activities = [];
    const registrations = [];
    const activitiesByKey = new Map();
    let skippedRows = 0;

    for (const sheetName of workbook.SheetNames) {
      const role = SHEET_ROLES.get(normalizeHeader(sheetName));
      if (!role) continue;
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: "",
        raw: true,
        blankrows: true,
      });
      const headerIndex = rows.findIndex((row) => {
        const headers = row.map(normalizeHeader);
        return (
          hasHeader(headers, "periodo") &&
          (hasHeader(headers, "identificacion") ||
            hasHeader(headers, "codigo") ||
            hasHeader(headers, "correo")) &&
          headers.includes("ACTIVIDAD")
        );
      });
      if (headerIndex < 0) {
        throw new Error(
          `No se encontró la fila de encabezados en la hoja "${sheetName}".`,
        );
      }
      const headers = rows[headerIndex].map(normalizeHeader);
      const columns = Object.fromEntries(
        Object.entries(FIELD_ALIASES).map(([field, aliases]) => [
          field,
          findColumn(headers, field, aliases),
        ]),
      );
      if (
        columns.identificacion < 0 ||
        columns.actividad < 0 ||
        columns.fechaInicio < 0 ||
        columns.fechaFinalizacion < 0 ||
        columns.programaBienestar < 0
      ) {
        throw new Error(
          `Faltan columnas requeridas para importar la hoja "${sheetName}".`,
        );
      }

      for (const row of rows.slice(headerIndex + 1)) {
        if (!row.some((value) => cellText(value))) continue;
        const identifier = valueAt(row, columns, "identificacion");
        const activity = makeActivity(row, columns);
        const codigo = valueAt(row, columns, "codigo");
        const correo = valueAt(row, columns, "correo").toLocaleLowerCase("es");
        if (!identifier && !codigo && !correo && !activity.activity && !activity.project) {
          skippedRows += 1;
          continue;
        }
        const key = activityKey(activity);
        let activityIndex = activitiesByKey.get(key);
        if (activityIndex === undefined) {
          activityIndex = activities.length;
          activitiesByKey.set(key, activityIndex);
          activities.push(activity);
        } else {
          const existing = activities[activityIndex];
          for (const field of Object.keys(existing).filter(
            (key) => key !== "conflicts",
          )) {
            const existingHasValue =
              existing[field] !== null &&
              existing[field] !== undefined &&
              existing[field] !== "";
            const incomingHasValue =
              activity[field] !== null &&
              activity[field] !== undefined &&
              activity[field] !== "";
            if (!existingHasValue && incomingHasValue)
              existing[field] = activity[field];
            else if (
              existingHasValue &&
              incomingHasValue &&
              existing[field] !== activity[field]
            ) {
              existing.conflicts = [
                ...new Set([...(existing.conflicts || []), field]),
              ];
            }
          }
        }

        const support = valueAt(row, columns, "tipoApoyo");
        registrations.push({
          activityIndex,
          identifier,
          codigo,
          correo,
          role,
          supportNumber: parseSupportNumber(support),
          supportLabel: support,
          programaModalidad: valueAt(row, columns, "programaBienestar"),
        });
      }
    }

    if (!registrations.length) {
      throw new Error(
        "No se encontraron filas de participantes en las hojas principales del Excel.",
      );
    }
    return { activities, registrations, skippedRows };
  });
}

function maskIdentifier(value) {
  const identifier = String(value || "");
  return identifier.length <= 4
    ? "••••"
    : `${"•".repeat(Math.min(identifier.length - 4, 8))}${identifier.slice(-4)}`;
}

export default function ImportarActividadesRealizadas() {
  const [file, setFile] = useState(null);
  const [payload, setPayload] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const matchedRows = useMemo(
    () =>
      preview?.participantStatuses?.filter((row) => row.status === "LISTO")
        .length || 0,
    [preview],
  );
  const programasNoEncontrados = useMemo(
    () =>
      preview?.activities?.filter((activity) =>
        activity.messages?.some((message) =>
          /programa.*(no coincide|no est[aá] activo)/i.test(message),
        ),
      ) || [],
    [preview],
  );

  async function handleFileChange(event) {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setPayload(null);
    setPreview(null);
    setError("");
    setMessage("");
    if (!selected) return;
    if (selected.size > MAX_FILE_BYTES) {
      setFile(null);
      setError("El archivo supera el límite de 25 MB.");
      return;
    }

    setLoading(true);
    try {
      const parsed = await readWorkbook(selected);
      setPayload(parsed);
      const result = await previsualizarImportacionActividades(parsed);
      setPreview(result);
    } catch (requestError) {
      setError(requestError.message || "No se pudo leer o validar el archivo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!payload || !preview || matchedRows === 0) return;
    const accepted = window.confirm(
      `Se registrarán las actividades válidas como FINALIZADAS y se inscribirán ${matchedRows} participantes encontrados por documento, código o correo institucional. Si falta su perfil VEC, se completará desde la base institucional. La asistencia no se modificará. ¿Deseas continuar?`,
    );
    if (!accepted) return;

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await confirmarImportacionActividades({
        ...payload,
        activarProgramas: true,
      });
      setMessage(
        `Importación terminada: ${result.actividadesCreadas} actividades creadas, ` +
          `${result.actividadesReutilizadas} reutilizadas y ${result.participantesInscritos} participantes inscritos. ` +
          `${result.participantesYaInscritos} ya estaban inscritos; ${result.participantesPendientes} quedaron pendientes.`,
      );
      const refreshed = await previsualizarImportacionActividades(payload);
      setPreview(refreshed);
    } catch (requestError) {
      setError(requestError.message || "No se pudo confirmar la importación.");
    } finally {
      setSaving(false);
    }

  }

  async function crearProgramasFaltantes() {
    if (!payload || !programasNoEncontrados.length) return;
    const accepted = window.confirm(
      "No encontramos uno o más programas de Bienestar. Se crearán vinculados a la línea y componente indicados en el Excel para que puedan reutilizarse en futuras cargas. ¿Deseas continuar?",
    );
    if (!accepted) return;
    setLoading(true);
    setError("");
    try {
      const siguientePayload = { ...payload, crearProgramas: true };
      setPayload(siguientePayload);
      setPreview(await previsualizarImportacionActividades(siguientePayload));
    } catch (requestError) {
      setError(requestError.message || "No se pudieron crear los programas faltantes.");
    } finally {
      setLoading(false);
    }
  }

  async function cambiarModalidad(registrationIndex, programaModalidad) {
    const siguientePayload = {
      ...payload,
      registrations: payload.registrations.map((row, index) =>
        index === registrationIndex ? { ...row, programaModalidad } : row,
      ),
    };
    setPayload(siguientePayload);
    setLoading(true);
    setError("");
    try {
      setPreview(await previsualizarImportacionActividades(siguientePayload));
    } catch (requestError) {
      setError(
        requestError.message || "No se pudo validar la modalidad seleccionada.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="activity-import"
      aria-label="Importar actividades realizadas"
    >
      <div className="activity-import__intro">
        <h2>
          <i className="fas fa-file-import" aria-hidden="true"></i> Importar
          desde Excel
        </h2>
        <p>
          Carga las hojas de estudiantes, colaboradores, egresados o externos.
          Revisa la previsualización antes de confirmar. Los estudiantes se
          buscan por documento, código o correo institucional; el archivo no
          marca asistencia.
        </p>
      </div>

      <div className="activity-import__controls">
        <label className={`activity-import__file-picker${file ? " has-file" : ""}`}>
          <input
            id="activities-import-file"
            type="file"
            accept=".xlsx,.xlsm,.xls"
            onChange={handleFileChange}
            disabled={loading || saving}
            aria-label="Seleccionar archivo institucional de actividades"
          />
          <span className="activity-import__file-picker-icon" aria-hidden="true">
            <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-file-excel"}`}></i>
          </span>
          <span className="activity-import__file-picker-copy">
            <strong>{loading ? "Leyendo y validando el archivo..." : file?.name || "Selecciona el archivo institucional"}</strong>
            <small>
              Excel .xlsx, .xlsm o .xls · máximo 25 MB · hojas con encabezados reconocibles
            </small>
          </span>
          <span className="activity-import__file-picker-action">
            <i className="fas fa-folder-open" aria-hidden="true"></i>
            Elegir archivo
          </span>
        </label>
      </div>

      {loading && (
        <p role="status">
          Leyendo el Excel y consultando catálogos y perfiles…
        </p>
      )}
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="alert alert-success" role="status">
          {message}
        </div>
      )}

      {preview && (
        <>
          <div
            className="activity-import__summary"
            aria-label="Resumen de la previsualización"
          >
            <article>
              <strong>{preview.summary.totalActivities}</strong>
              <span>grupos encontrados</span>
            </article>
            <article>
              <strong>{preview.summary.validActivities}</strong>
              <span>grupos listos</span>
            </article>
            <article>
              <strong>{preview.summary.totalParticipants}</strong>
              <span>filas de participantes</span>
            </article>
            <article>
              <strong>{matchedRows}</strong>
              <span>perfiles listos</span>
            </article>
            <article>
              <strong>{preview.summary.participantsNotFound}</strong>
              <span>perfiles pendientes</span>
            </article>
          </div>

          {payload?.skippedRows > 0 && (
            <p className="text-muted">
              {payload.skippedRows} filas vacías o sin datos de actividad fueron
              omitidas.
            </p>
          )}

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Actividad / proyecto</th>
                  <th>Periodo</th>
                  <th>Programa</th>
                  <th>Modalidades</th>
                  <th>Fechas</th>
                  <th>Participantes listos</th>
                  <th>Estado</th>
                  <th>Observación</th>
                </tr>
              </thead>
              <tbody>
                {preview.activities.map((activity, index) => (
                  <tr key={`${activity.activityIndex}-${index}`}>
                    <td>
                      <strong>
                        {payload.activities[activity.activityIndex]?.activity ||
                          "Sin nombre"}
                      </strong>
                      <small className="d-block">
                        {payload.activities[activity.activityIndex]?.project ||
                          "Sin proyecto"}
                      </small>
                    </td>
                    <td>
                      {payload.activities[activity.activityIndex]?.period ||
                        "Sin periodo"}
                    </td>
                    <td>
                      {payload.activities[activity.activityIndex]?.wellbeing ||
                        "Sin programa"}
                    </td>
                    <td>
                      {activity.modalidades?.join(" · ") ||
                        "Sin modalidad asociada"}
                    </td>
                    <td>
                      {payload.activities[activity.activityIndex]?.start ||
                        "Sin fecha"}
                      {" – "}
                      {payload.activities[activity.activityIndex]?.end ||
                        "Sin fecha"}
                    </td>
                    <td>
                      {activity.participantsReady} /{" "}
                      {activity.participantsTotal}
                    </td>
                    <td>{activity.status === "LISTA" ? "Lista" : "Revisar"}</td>
                    <td>
                      {activity.messages?.join(" ") ||
                        (activity.existing
                          ? "Se reutilizará."
                          : "Se creará como finalizada.")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {programasNoEncontrados.length > 0 && (
            <div className="activity-import__missing-catalog" role="alert">
              <div>
                <strong>Hay programas de Bienestar que no están disponibles</strong>
                <p>
                  Puedes crear los programas indicados en el Excel y dejarlos
                  vinculados a su línea y componente para reutilizarlos después.
                </p>
              </div>
              <button
                className="btn btn-outline"
                type="button"
                onClick={crearProgramasFaltantes}
                disabled={loading || saving}
              >
                <i className="fas fa-plus" aria-hidden="true"></i>
                Crear programas y volver a validar
              </button>
            </div>
          )}

          {preview.participantStatuses.some(
            (row) => !["LISTO", "YA_INSCRITO"].includes(row.status),
          ) && (
            <details className="activity-import__pending">
              <summary>
                Ver filas pendientes (
                {
                  preview.participantStatuses.filter(
                    (row) => !["LISTO", "YA_INSCRITO"].includes(row.status),
                  ).length
                }
                )
              </summary>
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Identificación</th>
                      <th>Rol</th>
                      <th>Programa / modalidad</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.participantStatuses
                      .filter(
                        (row) => !["LISTO", "YA_INSCRITO"].includes(row.status),
                      )
                      .slice(0, 200)
                      .map((row) => {
                        const source =
                          payload.registrations[row.registrationIndex];
                        return (
                          <tr key={row.registrationIndex}>
                            <td>{maskIdentifier(source?.identifier)}</td>
                            <td>{source?.role || "—"}</td>
                            <td>
                              {row.status === "MODALIDAD_REQUERIDA" ? (
                                <select
                                  className="form-select"
                                  value={source?.programaModalidad || ""}
                                  onChange={(event) =>
                                    cambiarModalidad(
                                      row.registrationIndex,
                                      event.target.value,
                                    )
                                  }
                                  disabled={loading || saving}
                                  aria-label={`Seleccionar modalidad para la fila ${row.registrationIndex + 1}`}
                                >
                                  <option value="">
                                    Selecciona la modalidad correcta
                                  </option>
                                  {(row.modalidadesDisponibles || []).map(
                                    (modalidad) => (
                                      <option
                                        key={modalidad.programaCompleto}
                                        value={modalidad.programaCompleto}
                                      >
                                        {modalidad.subdivision ||
                                          modalidad.programaCompleto}{" "}
                                        · {modalidad.tipoApoyo}
                                      </option>
                                    ),
                                  )}
                                </select>
                              ) : (
                                source?.programaModalidad || "—"
                              )}
                            </td>
                            <td>{row.message || row.status}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                {preview.participantStatuses.filter(
                  (row) => !["LISTO", "YA_INSCRITO"].includes(row.status),
                ).length > 200 && (
                  <p className="text-muted">
                    Se muestran las primeras 200 filas pendientes.
                  </p>
                )}
              </div>
            </details>
          )}

          <div className="activity-import__footer">
            <p className="text-muted">
              Las actividades se registrarán como FINALIZADAS. La asistencia no
              se modifica.
            </p>
            <button
              className="btn btn-primary"
              type="button"
              onClick={handleConfirm}
              disabled={saving || loading || matchedRows === 0}
            >
              <i className="fas fa-check" aria-hidden="true"></i>
              {saving
                ? "Guardando…"
                : `Confirmar importación (${matchedRows} participantes)`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
