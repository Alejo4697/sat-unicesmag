import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "@e965/xlsx";
import {
  confirmarImportacionActividades,
  previsualizarImportacionActividades,
} from "./participantesApi.js";
import { toIsoDate } from "./excelDate.js";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const PENDING_PAGE_SIZE = 200;
const SHEET_ROLES = new Map([
  ["DOCENTES", "COLABORADOR"],
  ["DOCENTE", "COLABORADOR"],
  ["DOCENTEPERMANENCIA", "COLABORADOR"],
  ["PROFESORES", "COLABORADOR"],
  ["PROFESOR", "COLABORADOR"],
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
  tipoActividadOtra: ["OTRAACTIVIDAD", "OTROTIPOACTIVIDAD", "SISELECCIONOLOPCIONOTRACUAL"],
  alianza: ["ALIANZASINTERINSTITUCIONAL", "ALIANZAINTERINSTITUCIONAL"],
  entidadAlianza: ["ENTIDADALIANZA"],
  articulacion: ["ARTICULACIONINSTITUCIONAL"],
  dependencia: ["DEPENDENCIA"],
  dependenciaOtra: [],
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
  tipoDocumento: ["TIPODEIDENTIFICACION", "TIPOIDENTIFICACION"],
  nombreCompleto: ["APELLIDOSYNOMBRES", "NOMBRESYAPELLIDOS", "NOMBRECOMPLETO"],
  programaPregrado: ["PROGRAMAACADEMICOPREGRADO", "PROGRAMAACADEMICOPREGRADODEPENDENCIA"],
  programaPosgrado: ["PROGRAMAACADEMICOPOSGRADO", "PROGRAMAACADEMICOPOSGRADODEPENDENCIA"],
  semestre: ["SEMESTRE"],
  genero: ["GENERO", "SEXO"],
  jornada: ["JORNADA"],
  contacto: ["CONTACTO", "CELULAR", "TELEFONO"],
  tipoParticipante: ["TIPOUSUARIOPARTICIPANTE", "TIPOPARTICIPANTE"],
  etnia: ["ETNIA"],
  municipio: ["MUNICIPIO"],
  conflictoArmado: ["CONFLICTOARMADO"],
  discapacidad: ["DISCAPACIDAD"],
  digitadorResponsable: ["DIGITADORRESPONSABLE", "RESPONSABLEDIGITACION"],
};

const ROLE_ALIASES = new Map([
  ["ESTUDIANTE", "ESTUDIANTE"],
  ["EGRESADO", "EGRESADO"],
  ["EGRESADA", "EGRESADO"],
  ["TITULADO", "EGRESADO"],
  ["TITULADA", "EGRESADO"],
  ["DOCENTE", "COLABORADOR"],
  ["COLABORADOR", "COLABORADOR"],
  ["COLABORADORA", "COLABORADOR"],
  ["ADMINISTRATIVO", "ADMINISTRATIVO"],
  ["ADMINISTRATIVA", "ADMINISTRATIVO"],
  ["EXTERNO", "EXTERNO"],
  ["EXTERNA", "EXTERNO"],
]);

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
  if (field === "tipoActividadOtra") {
    const activityTypeIndex = headers.findIndex((header) =>
      FIELD_ALIASES.tipoActividad.includes(header),
    );
    if (activityTypeIndex >= 0 && headers[activityTypeIndex + 1] === "OTRA") {
      return activityTypeIndex + 1;
    }
  }
  if (field === "dependenciaOtra") {
    const dependencyIndex = headers.indexOf("DEPENDENCIA");
    if (dependencyIndex >= 0 && headers[dependencyIndex + 1] === "OTRA") {
      return dependencyIndex + 1;
    }
  }
  return field === "programaBienestar"
    ? headers.findIndex((header) => columnMatchesHeader(header, field))
    : -1;
}

function cellText(value) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return /^(SIN\s+INFORMACION|NO\s+APLICA|N\s*\/\s*A|N\/A|FIN\s+DE\s+FORMULAS)$/i.test(
    text,
  )
    ? ""
    : text;
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

function emailAt(row, columns) {
  const value = valueAt(row, columns, "correo");
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
}

function contactAt(row, columns) {
  const contact = valueAt(row, columns, "contacto");
  if (contact) return contact;
  const possiblePhone = valueAt(row, columns, "correo");
  return /^\+?[\d\s()-]{7,20}$/.test(possiblePhone) ? possiblePhone : "";
}

function roleFromExcel(value, fallbackRole, sheetName) {
  const rawRole = String(value ?? "").trim();
  if (!rawRole) return fallbackRole;
  const key = normalizeHeader(rawRole);
  const role =
    ROLE_ALIASES.get(key) ||
    (key.startsWith("ESTUDIANTE") ? "ESTUDIANTE" : null);
  if (role) return role;
  throw new Error(
    `El rol "${rawRole}" no se reconoce en la hoja "${sheetName}". Revisa el campo "TIPO USUARIO (PARTICIPANTE)".`,
  );
}

function nombreSeparado(value) {
  const parts = cellText(value).split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { nombres: parts[0] || "", apellidos: "" };
  const apellidos = parts.slice(0, Math.min(2, parts.length - 1)).join(" ");
  return {
    nombres: parts.slice(Math.min(2, parts.length - 1)).join(" "),
    apellidos,
  };
}

function makeActivity(row, columns) {
  const allianceValue = normalizeText(valueAt(row, columns, "alianza"));
  const start = toIsoDate(rawValueAt(row, columns, "fechaInicio"));
  const end = toIsoDate(rawValueAt(row, columns, "fechaFinalizacion"));
  const period = normalizarPeriodoAcademico(
    periodoAcademicoDesdeFecha(valueAt(row, columns, "periodo")),
  );
  return {
    period:
      period ||
      (start
        ? `${start.slice(0, 4)}-${Number(start.slice(5, 7)) <= 6 ? 1 : 2}`
        : ""),
    activity: valueAt(row, columns, "actividad"),
    project: valueAt(row, columns, "proyecto"),
    start,
    end,
    wellbeing: programaBienestarGeneral(
      valueAt(row, columns, "programaBienestar"),
    ),
    description: valueAt(row, columns, "descripcion"),
    activityType: valueAt(row, columns, "tipoActividad"),
    activityTypeOther: valueAt(row, columns, "tipoActividadOtra"),
    alliance: ["SI", "SÍ", "YES", "1", "TRUE"].includes(allianceValue)
      ? true
      : ["NO", "0", "FALSE"].includes(allianceValue)
        ? false
        : null,
    allianceEntity: valueAt(row, columns, "entidadAlianza"),
    articulation: valueAt(row, columns, "articulacion"),
    dependency: valueAt(row, columns, "dependencia"),
    dependencyOther: valueAt(row, columns, "dependenciaOtra"),
    modality: valueAt(row, columns, "modalidad"),
    component: valueAt(row, columns, "componente"),
    actionLine: valueAt(row, columns, "lineaAccion"),
    strategyWellbeing: valueAt(row, columns, "estrategiaBienestar"),
    strategyRetention: valueAt(row, columns, "estrategiaPermanencia"),
    strategyInclusive: valueAt(row, columns, "estrategiaInclusiva"),
    digitadorResponsable: valueAt(row, columns, "digitadorResponsable"),
    warnings: [],
  };
}

function responsableKey(value) {
  return normalizeText(value);
}

function preferAccentedText(current, incoming) {
  const accentCount = (value) => (String(value).match(/[^\u0000-\u007f]/g) || []).length;
  return accentCount(incoming) > accentCount(current) ? incoming : current;
}

function combinarResponsables(current, incoming) {
  const values = [...String(current || "").split(" · "), incoming].filter(Boolean);
  const unique = new Map();
  for (const value of values) {
    const key = responsableKey(value);
    const existing = unique.get(key);
    unique.set(key, existing ? preferAccentedText(existing, value) : value);
  }
  return [...unique.values()].join(" · ");
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
          hasHeader(headers, "actividad")
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
        (columns.identificacion < 0 &&
          columns.codigo < 0 &&
          columns.correo < 0) ||
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
        const correo = emailAt(row, columns).toLocaleLowerCase("es");
        if (
          !activity.activity &&
          !activity.project &&
          !activity.wellbeing &&
          !activity.start &&
          !activity.end
        ) {
          skippedRows += 1;
          continue;
        }
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
            (key) => !["conflicts", "warnings"].includes(key),
          )) {
            const existingHasValue =
              existing[field] !== null &&
              existing[field] !== undefined &&
              existing[field] !== "";
            const incomingHasValue =
              activity[field] !== null &&
              activity[field] !== undefined &&
              activity[field] !== "";
            if (!existingHasValue && incomingHasValue) {
              existing[field] = activity[field];
              continue;
            }
            if (!existingHasValue || !incomingHasValue) continue;

            if (field === "alliance") {
              const allianceWarning =
                "La respuesta sobre alianza varía entre filas; se guardará sin afirmarla.";
              if (existing.warnings.includes(allianceWarning)) continue;
              if (existing[field] !== activity[field]) {
                existing[field] = null;
                existing.warnings.push(allianceWarning);
              }
              continue;
            }

            if (field === "digitadorResponsable") {
              existing[field] = combinarResponsables(
                existing[field],
                activity[field],
              );
              continue;
            }

            if (
              typeof existing[field] === "string" &&
              typeof activity[field] === "string" &&
              normalizeText(existing[field]) === normalizeText(activity[field])
            ) {
              existing[field] = preferAccentedText(
                existing[field],
                activity[field],
              );
              continue;
            }

            if (
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

        if (!identifier && !codigo && !correo) {
          skippedRows += 1;
          continue;
        }
        const role = roleFromExcel(
          valueAt(row, columns, "tipoParticipante"),
          SHEET_ROLES.get(normalizeHeader(sheetName)),
          sheetName,
        );
        const { nombres, apellidos } = nombreSeparado(
          valueAt(row, columns, "nombreCompleto"),
        );
        const semestreText = valueAt(row, columns, "semestre");
        const semestreMatch = semestreText.match(/^\s*(\d{1,2})/);
        const support = valueAt(row, columns, "tipoApoyo");
        registrations.push({
          activityIndex,
          identifier,
          codigo,
          correo,
          role,
          tipoDocumento: valueAt(row, columns, "tipoDocumento"),
          nombres,
          apellidos,
          programaAcademico: valueAt(row, columns, "programaPregrado"),
          programaPosgradoDependencia: valueAt(row, columns, "programaPosgrado"),
          semestre: semestreMatch ? Number(semestreMatch[1]) : null,
          jornada: valueAt(row, columns, "jornada"),
          dependencia: valueAt(row, columns, "dependencia"),
          supportOther: "",
          genero: valueAt(row, columns, "genero"),
          celular: contactAt(row, columns),
          etnia: valueAt(row, columns, "etnia"),
          municipio: valueAt(row, columns, "municipio"),
          conflictoArmado: valueAt(row, columns, "conflictoArmado"),
          discapacidad: valueAt(row, columns, "discapacidad"),
          supportNumber: parseSupportNumber(support),
          supportLabel: support,
          programaModalidad: valueAt(row, columns, "programaBienestar"),
        });
      }
    }

    if (!activities.length) {
      throw new Error(
        "No se encontraron actividades con datos utilizables. Las celdas “Fin de fórmulas” se trataron como vacías; verifica que el archivo tenga actividad, proyecto, fechas y programa de Bienestar.",
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
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [payload, setPayload] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [otroApoyoDrafts, setOtroApoyoDrafts] = useState({});
  const [paginaPendientes, setPaginaPendientes] = useState(1);
  const filasPendientes = useMemo(
    () =>
      preview?.participantStatuses?.filter(
        (row) =>
          !["LISTO", "YA_INSCRITO", "DUPLICADO"].includes(row.status),
      ) || [],
    [preview],
  );
  const totalPaginasPendientes = Math.max(
    1,
    Math.ceil(filasPendientes.length / PENDING_PAGE_SIZE),
  );
  const actividadesPendientes = useMemo(
    () =>
      preview?.activities?.filter((activity) => activity.status !== "LISTA") ||
      [],
    [preview],
  );
  const paginaPendientesActual = Math.min(
    paginaPendientes,
    totalPaginasPendientes,
  );
  const filasPendientesVisibles = filasPendientes.slice(
    (paginaPendientesActual - 1) * PENDING_PAGE_SIZE,
    paginaPendientesActual * PENDING_PAGE_SIZE,
  );

  const matchedRows = useMemo(
    () =>
      preview?.participantStatuses?.filter((row) =>
        row.status === "LISTO",
      ).length || 0,
    [preview],
  );
  const readyActivityCount = useMemo(
    () =>
      preview?.activities?.filter((activity) => activity.status === "LISTA")
        .length || 0,
    [preview],
  );
  const duplicateParticipantCount = useMemo(
    () =>
      preview?.participantStatuses?.filter(
        (row) => row.status === "DUPLICADO",
      ).length || 0,
    [preview],
  );
  const programasPorCrear = useMemo(() => {
    if (!preview || !payload) return [];
    const programs = new Map();
    preview.activities
      .filter((activity) => activity.programaNuevo)
      .forEach((activity) => {
        const name = payload.activities[activity.activityIndex]?.wellbeing;
        if (name && !programs.has(normalizeText(name))) {
          programs.set(normalizeText(name), name);
        }
      });
    return [...programs.values()];
  }, [payload, preview]);

  async function handleFileChange(event) {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setPayload(null);
    setPreview(null);
    setOtroApoyoDrafts({});
    setPaginaPendientes(1);
    setError("");
    if (!selected) return;
    if (selected.size > MAX_FILE_BYTES) {
      setFile(null);
      setError("El archivo supera el límite de 25 MB.");
      return;
    }

    setLoading(true);
    try {
      const parsed = await readWorkbook(selected);
      const importPayload = { ...parsed, crearProgramas: true };
      setPayload(importPayload);
      const result = await previsualizarImportacionActividades(importPayload);
      setPreview(result);
    } catch (requestError) {
      setError(requestError.message || "No se pudo leer o validar el archivo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!payload || !preview) {
      setError("Primero carga el Excel y espera a que termine la previsualización.");
      return;
    }
    if (readyActivityCount === 0) {
      setError(
        "No hay actividades listas para importar. Corrige las observaciones de la previsualización y vuelve a cargarla.",
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await confirmarImportacionActividades({
        ...payload,
        crearProgramas: true,
        activarProgramas: true,
      });
      if (
        Number(result.actividadesCreadas || 0) +
          Number(result.actividadesReutilizadas || 0) ===
        0
      ) {
        throw new Error(
          "El servidor no confirmó actividades creadas ni reutilizadas. No se pudo verificar el resultado de la importación.",
        );
      }
      navigate("/actividades?vista=actividades", {
        state: { importacionRealizadas: result },
      });
    } catch (requestError) {
      setError(requestError.message || "No se pudo confirmar la importación.");
    } finally {
      setSaving(false);
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

  async function aplicarOtroApoyo(registrationIndex) {
    if (!payload) return;
    const row = payload.registrations[registrationIndex];
    const supportOther = String(
      otroApoyoDrafts[registrationIndex] ?? row?.supportLabel ?? "",
    ).trim();
    if (!supportOther) {
      setError("Especifica el tipo de apoyo que no aparece en el catálogo.");
      return;
    }

    const siguientePayload = {
      ...payload,
      registrations: payload.registrations.map((item, index) =>
        index === registrationIndex ? { ...item, supportOther } : item,
      ),
    };
    setPayload(siguientePayload);
    setLoading(true);
    setError("");
    try {
      setPreview(await previsualizarImportacionActividades(siguientePayload));
    } catch (requestError) {
      setError(
        requestError.message || "No se pudo validar el tipo de apoyo indicado.",
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
          Carga las hojas de estudiantes, docentes, administrativos, egresados o externos.
          Revisa la previsualización antes de confirmar. Esta importación no
          crea personas ni perfiles VEC ni asigna roles: solo inscribe perfiles
          que ya existen con el mismo rol del Excel. Las personas se buscan por
          documento, código o correo válido. Las filas sin perfil coincidente
          quedan pendientes; primero regístralas en la sección de perfiles.
          El archivo tampoco marca asistencia.
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
              <span>perfiles VEC existentes listos</span>
            </article>
            <article>
              <strong>{preview.summary.participantsNotFound}</strong>
              <span>perfiles pendientes</span>
            </article>
            <article>
              <strong>{duplicateParticipantCount}</strong>
              <span>filas repetidas omitidas</span>
            </article>
            <article>
              <strong>
                {payload.registrations.filter((row) => row.supportOther).length}
              </strong>
              <span>apoyos especificados como “Otro”</span>
            </article>
          </div>

          {(actividadesPendientes.length > 0 || filasPendientes.length > 0) && (
            <section
              className="activity-import__partial-warning"
              aria-labelledby="activity-import-pending-title"
              role="status"
            >
              <div className="activity-import__partial-warning-heading">
                <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
                <h3 id="activity-import-pending-title">
                  Hay datos pendientes; los registros válidos sí se pueden importar
                </h3>
              </div>
              <p>
                Se omitirán {actividadesPendientes.length} actividades no
                validadas y {filasPendientes.length} filas de participantes
                pendientes. El resto se guardará; las filas omitidas no se
                crearán ni inscribirán.
              </p>
              {actividadesPendientes.length > 0 && (
                <p>
                  Actividades pendientes:{" "}
                  {actividadesPendientes
                    .slice(0, 3)
                    .map(
                      (activity) =>
                        payload.activities[activity.activityIndex]?.activity ||
                        "Sin nombre",
                    )
                    .join(", ")}
                  {actividadesPendientes.length > 3 ? " y otras." : "."}
                </p>
              )}
              {filasPendientes.length > 0 && (
                <details>
                  <summary>Consultar causas de filas pendientes</summary>
                  <ul>
                    {[
                      ...new Set(
                        filasPendientes.map((row) => row.message || row.status),
                      ),
                    ]
                      .slice(0, 12)
                      .map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                  </ul>
                  {new Set(
                    filasPendientes.map((row) => row.message || row.status),
                  ).size > 12 && (
                    <small>
                      Las demás causas se pueden consultar en la tabla de filas
                      pendientes.
                    </small>
                  )}
                </details>
              )}
            </section>
          )}

          {payload.registrations.some((row) => row.supportOther) && (
            <p className="text-muted" role="status">
              Los apoyos indicados como “Otro” se guardarán como detalle del
              registro de Actividades y no modificarán el catálogo general.
            </p>
          )}

          {payload?.skippedRows > 0 && (
            <p className="text-muted">
              {payload.skippedRows} filas sin datos de actividad o sin
              identificador fueron omitidas. Las celdas “Fin de fórmulas” se
              interpretan como vacías; las actividades válidas se conservan.
            </p>
          )}

          {readyActivityCount === 0 && (
            <div className="activity-import__blocked" role="alert">
              <strong>
                No hay actividades listas para confirmar
              </strong>
              <p>
                La importación solo guarda los grupos marcados como “Lista”.
                Revisa las observaciones siguientes, resuelve los conflictos o
                prepara los programas faltantes y vuelve a validar el archivo.
              </p>
              <ul>
                {preview.activities
                  .filter((activity) => activity.status !== "LISTA")
                  .slice(0, 10)
                  .map((activity) => (
                    <li key={activity.activityIndex}>
                      <strong>
                        {payload.activities[activity.activityIndex]?.activity ||
                          "Actividad sin nombre"}:
                      </strong>{" "}
                      {activity.messages?.join(" ") || "Requiere revisión."}
                    </li>
                  ))}
              </ul>
              {preview.activities.filter(
                (activity) => activity.status !== "LISTA",
              ).length > 10 && (
                <small>Se muestran las primeras 10 observaciones.</small>
              )}
            </div>
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
                        activity.warnings?.join(" ") ||
                        (activity.existing
                          ? "Se reutilizará para evitar duplicados."
                          : activity.programaNuevo
                            ? "La actividad y el programa se crearán al confirmar; quedará FINALIZADA."
                            : "Se creará como FINALIZADA.")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {programasPorCrear.length > 0 && (
            <div
              className="activity-import__missing-catalog activity-import__planned-programs"
              role="status"
              aria-live="polite"
            >
              <i className="fas fa-circle-check" aria-hidden="true"></i>
              <div>
                <strong>
                  Se crearán {programasPorCrear.length} programa(s) de Bienestar
                  al confirmar
                </strong>
                <p>
                  {programasPorCrear.join(" · ")}
                </p>
                <small>
                  Se vincularán a la línea de acción y al componente del Excel.
                  No se guardarán cambios hasta confirmar la importación.
                </small>
              </div>
            </div>
          )}

          {filasPendientes.length > 0 && (
            <details className="activity-import__pending">
              <summary>
                Ver filas pendientes ({filasPendientes.length})
              </summary>
              {filasPendientes.length > PENDING_PAGE_SIZE && (
                <div className="activity-import__pending-pagination">
                  <span>
                    Filas {(paginaPendientesActual - 1) * PENDING_PAGE_SIZE + 1}
                    –{Math.min(
                      paginaPendientesActual * PENDING_PAGE_SIZE,
                      filasPendientes.length,
                    )}{" "}
                    de {filasPendientes.length}
                  </span>
                  <div>
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={() =>
                        setPaginaPendientes((current) =>
                          Math.max(1, current - 1),
                        )
                      }
                      disabled={paginaPendientesActual <= 1}
                    >
                      Anterior
                    </button>
                    <span>
                      Página {paginaPendientesActual} de {totalPaginasPendientes}
                    </span>
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={() =>
                        setPaginaPendientes((current) =>
                          Math.min(totalPaginasPendientes, current + 1),
                        )
                      }
                      disabled={paginaPendientesActual >= totalPaginasPendientes}
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
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
                    {filasPendientesVisibles.map((row) => {
                        const source =
                          payload.registrations[row.registrationIndex];
                        return (
                          <tr key={row.registrationIndex}>
                            <td>{maskIdentifier(source?.identifier)}</td>
                            <td>{source?.role || "—"}</td>
                            <td>
                              {row.status === "APOYO_OTRO_REQUERIDO" ? (
                                <div className="activity-import__other-support">
                                  <input
                                    className="form-control"
                                    type="text"
                                    maxLength={250}
                                    value={
                                      otroApoyoDrafts[row.registrationIndex] ??
                                      source?.supportOther ??
                                      source?.supportLabel ??
                                      ""
                                    }
                                    onChange={(event) =>
                                      setOtroApoyoDrafts((current) => ({
                                        ...current,
                                        [row.registrationIndex]: event.target.value,
                                      }))
                                    }
                                    placeholder="Otro tipo de apoyo"
                                    aria-label={`Especificar otro tipo de apoyo para la fila ${row.registrationIndex + 1}`}
                                    disabled={loading || saving}
                                  />
                                  <button
                                    className="btn btn-outline btn-sm"
                                    type="button"
                                    onClick={() =>
                                      aplicarOtroApoyo(row.registrationIndex)
                                    }
                                    disabled={loading || saving}
                                  >
                                    Aplicar
                                  </button>
                                </div>
                              ) : row.status === "MODALIDAD_REQUERIDA" ? (
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
              </div>
            </details>
          )}

          <div className="activity-import__footer">
            <p className="text-muted">
              Las actividades se registrarán como FINALIZADAS. La asistencia no
              se modifica. Los registros pendientes se omiten y se explican en
              el resumen; se importarán los grupos y participantes válidos.
            </p>
            <button
              className="btn btn-primary"
              type="button"
              onClick={handleConfirm}
              disabled={
                saving ||
                loading ||
                !preview ||
                !payload ||
                readyActivityCount === 0
              }
            >
              <i className="fas fa-check" aria-hidden="true"></i>
              {saving
                ? "Guardando…"
                : readyActivityCount === 0
                ? "Sin actividades listas"
                : actividadesPendientes.length || filasPendientes.length
                  ? `Importar válidas (${readyActivityCount} actividades)`
                  : `Confirmar importación (${readyActivityCount} actividades)`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
