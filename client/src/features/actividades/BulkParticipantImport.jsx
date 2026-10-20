import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import * as XLSX from "@e965/xlsx";
import {
  getEventosProximos,
  registrarNoEncontradoMasivo,
  registrarParticipantesMasivo,
  validarParticipantesMasivo,
} from "./participantesApi.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 500;
const ROLE_OPTIONS = [
  { value: "ESTUDIANTE", label: "Estudiante" },
  { value: "EGRESADO", label: "Egresado" },
  { value: "COLABORADOR", label: "Colaborador" },
  { value: "EXTERNO", label: "Externo" },
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("es");
}

function normalizeRole(value) {
  const role = normalizeText(value).replace(/[^A-Z]/g, "");
  if (["ESTUDIANTE", "ESTUDIANTES", "ALUMNO", "ALUMNA"].includes(role)) return "ESTUDIANTE";
  if (["EGRESADO", "EGRESADOS", "EGRESADA", "EGRESADAS", "GRADUADO", "GRADUADOS", "GRADUADA", "GRADUADAS"].includes(role)) return "EGRESADO";
  if (["COLABORADOR", "COLABORADORES", "DOCENTE", "FUNCIONARIO", "EMPLEADO"].includes(role)) return "COLABORADOR";
  if (["EXTERNO", "EXTERNOS"].includes(role)) return "EXTERNO";
  return "";
}

function normalizeDocumentType(value) {
  const type = normalizeText(value).replace(/[^A-Z0-9]/g, "");
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
  };
  return aliases[type] || type;
}

function normalizeGender(value) {
  const gender = normalizeText(value).replace(/[^A-Z]/g, "");
  const aliases = {
    F: "Femenino",
    FEMENINO: "Femenino",
    MUJER: "Femenino",
    M: "Masculino",
    MASCULINO: "Masculino",
    HOMBRE: "Masculino",
    NOBINARIO: "No binario",
    OTRO: "Otro",
    PREFIERONORESPONDER: "Prefiero no responder",
  };
  return aliases[gender] || value;
}

function prepareUnknownParticipant(row) {
  const tipo = row.tipo || "";
  const externalIdentifier = tipo === "EXTERNO"
    ? row.identificacion || row.codigoInstitucional || ""
    : row.identificacion || "";
  return {
    identificacion: externalIdentifier,
    codigoInstitucional: tipo === "ESTUDIANTE" ? row.codigoInstitucional || "" : "",
    nombres: row.nombres || "",
    apellidos: row.apellidos || "",
    tipoDocumento: row.tipoDocumento || "CC",
    tipo,
    fechaNacimiento: row.fechaNacimiento || "",
    lugarNacimiento: row.lugarNacimiento || "",
    genero: row.genero || "",
    correoInstitucional: "",
    correo: row.correo || "",
    celular: row.celular || "",
    telefono: row.telefono || "",
    direccion: row.direccion || "",
    municipio: row.municipio || "",
    modalidadVariable: row.modalidadVariable || "",
  };
}

function validarBorradorNoEncontrado(draft) {
  const errors = {};
  const setRequired = (field, label, value) => {
    if (!String(value || "").trim()) errors[field] = `${label} es obligatorio.`;
  };
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const namePattern = /^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u;
  const student = draft.tipo === "ESTUDIANTE";

  if (!ROLE_OPTIONS.some((role) => role.value === draft.tipo)) {
    errors.tipo = "Selecciona el rol de la persona.";
  }
  if (!["CC", "TI", "CE", "PA", "RC", "NIT", "PPT", "PEP", "CD", "SC", "NUIP", "OTRO"].includes(draft.tipoDocumento)) {
    errors.tipoDocumento = "Selecciona un tipo de documento válido.";
  }
  setRequired("identificacion", "El número de documento", draft.identificacion);
  if (draft.identificacion && (!/^[\p{L}\p{N}._-]{1,64}$/u.test(draft.identificacion.trim()))) {
    errors.identificacion = "Usa máximo 64 letras o números; también se permiten punto, guion y guion bajo.";
  }
  if (student) {
    setRequired("codigoInstitucional", "El código institucional", draft.codigoInstitucional);
    if (draft.codigoInstitucional && !/^[\p{L}\p{N}._-]{1,64}$/u.test(draft.codigoInstitucional.trim())) {
      errors.codigoInstitucional = "El código debe tener máximo 64 letras o números.";
    }
  }

  for (const [field, label] of [["nombres", "Los nombres"], ["apellidos", "Los apellidos"]]) {
    setRequired(field, label, draft[field]);
    if (draft[field] && (draft[field].trim().length < 2
      || draft[field].trim().length > 120
      || !namePattern.test(draft[field].trim()))) {
      errors[field] = "Escribe un nombre válido de 2 a 120 caracteres.";
    }
  }
  setRequired("fechaNacimiento", "La fecha de nacimiento", draft.fechaNacimiento);
  if (draft.fechaNacimiento) {
    const date = new Date(`${draft.fechaNacimiento}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.fechaNacimiento)
      || Number.isNaN(date.getTime())
      || date.toISOString().slice(0, 10) !== draft.fechaNacimiento
      || draft.fechaNacimiento > new Date().toISOString().slice(0, 10)) {
      errors.fechaNacimiento = "Ingresa una fecha real que no sea posterior a hoy.";
    }
  }
  setRequired("lugarNacimiento", "El lugar de nacimiento", draft.lugarNacimiento);
  if (draft.lugarNacimiento?.length > 250) errors.lugarNacimiento = "Usa máximo 250 caracteres.";
  setRequired("genero", "El género", draft.genero);
  if (draft.genero && !["Femenino", "Masculino", "No binario", "Otro", "Prefiero no responder"].includes(draft.genero)) {
    errors.genero = "Selecciona una opción válida.";
  }

  setRequired("correo", "El correo personal", draft.correo);
  if (draft.correo && (!emailPattern.test(draft.correo.trim()) || draft.correo.length > 254)) {
    errors.correo = "Escribe un correo válido de máximo 254 caracteres.";
  }
  if (student) {
    setRequired("correoInstitucional", "El correo institucional", draft.correoInstitucional);
    if (draft.correoInstitucional
      && (!emailPattern.test(draft.correoInstitucional.trim()) || draft.correoInstitucional.length > 254)) {
      errors.correoInstitucional = "Escribe un correo institucional válido.";
    }
  }
  for (const [field, label] of [
    ["celular", "El teléfono móvil"],
    ["telefono", "El teléfono alternativo"],
  ]) {
    setRequired(field, label, draft[field]);
    if (draft[field]) {
      const digits = draft[field].replace(/\D/g, "");
      if (!/^\+?[\d\s().-]+$/.test(draft[field].trim()) || digits.length < 7 || digits.length > 15) {
        errors[field] = "Ingresa un teléfono válido de 7 a 15 dígitos.";
      }
    }
  }
  setRequired("direccion", "La dirección", draft.direccion);
  if (draft.direccion && draft.direccion.trim().length > 250) errors.direccion = "Usa máximo 250 caracteres.";
  setRequired("municipio", "La ciudad o municipio", draft.municipio);
  if (draft.municipio && draft.municipio.trim().length > 150) errors.municipio = "Usa máximo 150 caracteres.";
  return errors;
}

function UnknownParticipantDialog({
  row,
  draft,
  busy,
  serverError,
  supportOptions,
  modalityVariable,
  onChange,
  onSupportChange,
  onClose,
  onSubmit,
}) {
  const dialogRef = useRef(null);
  const bodyRef = useRef(null);
  const [step, setStep] = useState(0);
  const [attemptedSteps, setAttemptedSteps] = useState([]);
  const steps = [
    { title: "Identificación", subtitle: "Documento y rol", icon: "fa-id-card" },
    { title: "Datos personales", subtitle: "Información básica", icon: "fa-user" },
    { title: "Contacto", subtitle: "Residencia y comunicación", icon: "fa-address-book" },
  ];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);
  useEffect(() => {
    if (attemptedSteps.includes(step)) {
      bodyRef.current?.querySelector('[aria-invalid="true"]')?.focus();
    }
  }, [attemptedSteps, step]);

  if (!row || !draft) return null;

  const student = draft.tipo === "ESTUDIANTE";
  const validationErrors = validarBorradorNoEncontrado(draft);
  const stepFields = [
    ["tipo", "tipoDocumento", "identificacion", ...(student ? ["codigoInstitucional"] : [])],
    ["nombres", "apellidos", "fechaNacimiento", "lugarNacimiento", "genero"],
    [...(student ? ["correoInstitucional"] : []), "correo", "celular", "telefono", "direccion", "municipio"],
  ];
  const currentErrors = stepFields[step].filter((name) => validationErrors[name]);
  const showFieldError = (name) => attemptedSteps.includes(step) ? validationErrors[name] : "";
  const fieldError = (name) => showFieldError(name)
    ? (
      <small id={`unknown-${name}-error`} className="vec-bulk-unregistered-modal__error">
        {showFieldError(name)}
      </small>
    )
    : null;
  const selectClass = (name) => `form-select${showFieldError(name) ? " is-invalid" : ""}`;

  const field = (name, label, type = "text") => (
    <label className="vec-bulk-unregistered-modal__field" key={name}>
      <span>{label} *</span>
      <input
        className={`form-control${showFieldError(name) ? " is-invalid" : ""}`}
        type={type}
        value={draft[name] || ""}
        onChange={(event) => onChange(name, event.target.value)}
        maxLength={{
          identificacion: 64,
          codigoInstitucional: 64,
          nombres: 120,
          apellidos: 120,
          lugarNacimiento: 250,
          correo: 254,
          correoInstitucional: 254,
          celular: 30,
          telefono: 30,
          direccion: 250,
          municipio: 150,
        }[name]}
        aria-invalid={Boolean(showFieldError(name))}
        aria-describedby={showFieldError(name) ? `unknown-${name}-error` : undefined}
        required
      />
      {fieldError(name)}
    </label>
  );

  function goToNextStep() {
    setAttemptedSteps((current) => [...new Set([...current, step])]);
    if (currentErrors.length) {
      return;
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submitForm() {
    const incompleteStep = stepFields.findIndex((fields) => (
      fields.some((name) => validationErrors[name])
    ));
    if (incompleteStep >= 0) {
      setAttemptedSteps([0, 1, 2]);
      setStep(incompleteStep);
      bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    onSubmit();
  }

  return (
    <dialog
      ref={dialogRef}
      className="vec-bulk-unregistered-modal"
      aria-labelledby="vec-bulk-unregistered-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="vec-bulk-unregistered-modal__header">
        <span className="vec-bulk-unregistered-modal__icon" aria-hidden="true">
          <i className="fas fa-user-plus"></i>
        </span>
        <div>
          <span className="vec-bulk-registration__eyebrow">REGISTRO DE PARTICIPANTE</span>
          <h3 id="vec-bulk-unregistered-title">Registrar persona no encontrada</h3>
          <p>Ingresa la información para crear el perfil y agregarlo a la actividad.</p>
        </div>
        <button className="activity-modal__close" type="button" onClick={onClose} aria-label="Cerrar ventana">
          <i className="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
      <nav className="vec-bulk-unregistered-modal__steps" aria-label="Progreso del registro">
        {steps.map((item, index) => (
          <div
            className={`vec-bulk-unregistered-modal__step${index === step ? " is-current" : ""}${index < step ? " is-complete" : ""}`}
            key={item.title}
            aria-current={index === step ? "step" : undefined}
          >
            <span className="vec-bulk-unregistered-modal__step-marker">
              {index < step
                ? <i className="fas fa-check" aria-hidden="true"></i>
                : <i className={`fas ${item.icon}`} aria-hidden="true"></i>}
            </span>
            <span className="vec-bulk-unregistered-modal__step-copy">
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </span>
          </div>
        ))}
      </nav>
      <div className="vec-bulk-unregistered-modal__body" ref={bodyRef}>
        <div className="vec-bulk-unregistered-modal__page-heading">
          <span>PASO {step + 1} DE {steps.length}</span>
          <h4>{steps[step].title}</h4>
          <p>{step === 0
            ? "Define el rol y registra el documento de identidad."
            : step === 1
              ? "Completa la información personal de la persona."
              : "Añade los datos de contacto y residencia."}</p>
        </div>
        <div className="vec-bulk-unregistered__form">
          {step === 0 && (
            <section className="vec-bulk-unregistered-modal__group">
              <div className="vec-bulk-unregistered-modal__grid">
                <label className="vec-bulk-unregistered-modal__field">
                  <span>Rol de participante *</span>
                  <select
                    className={selectClass("tipo")}
                    value={draft.tipo || ""}
                    onChange={(event) => onChange("tipo", event.target.value)}
                    aria-invalid={Boolean(showFieldError("tipo"))}
                    aria-describedby={showFieldError("tipo") ? "unknown-tipo-error" : undefined}
                    required
                  >
                    <option value="">Selecciona el rol</option>
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                  {fieldError("tipo")}
                </label>
                <label className="vec-bulk-unregistered-modal__field">
                  <span>Tipo de documento *</span>
                  <select
                    className={selectClass("tipoDocumento")}
                    value={draft.tipoDocumento || "CC"}
                    onChange={(event) => onChange("tipoDocumento", event.target.value)}
                    aria-invalid={Boolean(showFieldError("tipoDocumento"))}
                    aria-describedby={showFieldError("tipoDocumento") ? "unknown-tipoDocumento-error" : undefined}
                    required
                  >
                    {[
                      ["CC", "Cédula de ciudadanía"],
                      ["TI", "Tarjeta de identidad"],
                      ["CE", "Cédula de extranjería"],
                      ["PA", "Pasaporte"],
                      ["RC", "Registro civil"],
                      ["NIT", "NIT"],
                      ["PPT", "Permiso por Protección Temporal"],
                      ["PEP", "Permiso Especial de Permanencia"],
                      ["CD", "Carné diplomático"],
                      ["SC", "Salvoconducto"],
                      ["NUIP", "Número Único de Identificación Personal"],
                      ["OTRO", "Otro documento"],
                    ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  {fieldError("tipoDocumento")}
                </label>
                {field("identificacion", "Número de documento")}
                {student && field("codigoInstitucional", "Código institucional / estudiantil")}
                <label className="vec-bulk-unregistered-modal__field">
                  <span>Variable o modalidad de inscripción</span>
                  <select
                    className="form-select"
                    value={modalityVariable || ""}
                    onChange={(event) => onSupportChange(event.target.value)}
                    disabled={!supportOptions.length}
                    required={supportOptions.length > 0}
                  >
                    <option value="">{supportOptions.length ? "Selecciona una modalidad" : "Sin modalidad disponible"}</option>
                    {supportOptions.map((option) => (
                      <option key={option.programaCompleto} value={option.programaCompleto}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <small>El apoyo asociado a la modalidad se guardará únicamente en la inscripción a esta actividad.</small>
                </label>
              </div>
              {draft.tipo === "EXTERNO" && (
                <p className="vec-bulk-unregistered-modal__notice" role="note">
                  El rol Externo es exclusivo y no se puede combinar con otro rol VEC.
                </p>
              )}
            </section>
          )}
          {step === 1 && (
            <section className="vec-bulk-unregistered-modal__group">
              <div className="vec-bulk-unregistered-modal__grid">
                {field("nombres", "Nombres completos")}
                {field("apellidos", "Apellidos completos")}
                {field("fechaNacimiento", "Fecha de nacimiento", "date")}
                {field("lugarNacimiento", "Lugar de nacimiento")}
                <label className="vec-bulk-unregistered-modal__field">
                  <span>Género *</span>
                  <select
                    className={selectClass("genero")}
                    value={draft.genero || ""}
                    onChange={(event) => onChange("genero", event.target.value)}
                    aria-invalid={Boolean(showFieldError("genero"))}
                    aria-describedby={showFieldError("genero") ? "unknown-genero-error" : undefined}
                    required
                  >
                    <option value="">Selecciona el género</option>
                    <option value="Femenino">Femenino</option>
                    <option value="Masculino">Masculino</option>
                    <option value="No binario">No binario</option>
                    <option value="Otro">Otro</option>
                    <option value="Prefiero no responder">Prefiero no responder</option>
                  </select>
                  {fieldError("genero")}
                </label>
              </div>
            </section>
          )}
          {step === 2 && (
            <section className="vec-bulk-unregistered-modal__group">
              <div className="vec-bulk-unregistered-modal__grid">
                {student && field("correoInstitucional", "Correo institucional", "email")}
                {field("correo", "Correo personal", "email")}
                {field("celular", "Teléfono móvil / celular", "tel")}
                {field("telefono", "Teléfono alternativo", "tel")}
                {field("direccion", "Dirección de residencia")}
                {field("municipio", "Ciudad / municipio de residencia")}
              </div>
            </section>
          )}
        </div>
      </div>
      {attemptedSteps.includes(step) && currentErrors.length > 0 && (
        <div className="vec-bulk-unregistered-modal__validation-summary" role="alert">
          Revisa {currentErrors.length === 1 ? "el campo señalado" : `los ${currentErrors.length} campos señalados`} antes de continuar.
        </div>
      )}
      {serverError && (
        <div className="vec-bulk-unregistered-modal__server-error" role="alert">
          <i className="fas fa-circle-exclamation" aria-hidden="true"></i>
          <span>{serverError}</span>
        </div>
      )}
      <div className="vec-bulk-unregistered-modal__footer">
        <div className="vec-bulk-unregistered-modal__footer-meta">
          <span>{step + 1} / {steps.length}</span>
          <div className="vec-bulk-unregistered-modal__progress" aria-hidden="true">
            <span style={{ width: `${((step + 1) / steps.length) * 100}%` }}></span>
          </div>
        </div>
        <div className="vec-bulk-unregistered-modal__footer-actions">
          {step === 0
            ? <button className="btn btn-outline" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
            : <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                setStep((current) => Math.max(current - 1, 0));
                bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={busy}
            >
              <i className="fas fa-arrow-left" aria-hidden="true"></i> Anterior
            </button>}
          {step < steps.length - 1
            ? <button
              className="btn btn-primary"
              type="button"
              onClick={goToNextStep}
              disabled={busy}
            >
              Continuar <i className="fas fa-arrow-right" aria-hidden="true"></i>
            </button>
            : <button
              className="btn btn-primary"
              type="button"
              onClick={submitForm}
              disabled={busy}
            >
              <i className={`fas ${busy ? "fa-spinner fa-spin" : "fa-user-plus"}`} aria-hidden="true"></i>
              {busy ? "Guardando perfil..." : "Crear perfil e inscribir"}
            </button>}
        </div>
      </div>
    </dialog>
  );
}

function cellText(cell) {
  const value = cell && typeof cell === "object" && "value" in cell ? cell.value : cell;
  if (value == null) return "";
  if (typeof value === "object" && !Array.isArray(value)) {
    if ("text" in value) return String(value.text || "").trim();
    if ("result" in value) return String(value.result ?? "").trim();
    if (Array.isArray(value.richText)) return value.richText.map((part) => part?.text || "").join("").trim();
  }
  return String(value).trim().replace(/\.0$/, "");
}

function normalizeSpreadsheetDate(value) {
  const date = cellText(value);
  if (!date) return "";
  const iso = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const localized = date.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
  if (!localized) return date;
  const [, first, second, year] = localized;
  const day = Number(first) > 12 ? first : Number(second) > 12 ? second : first;
  const month = Number(first) > 12 ? second : Number(second) > 12 ? first : second;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

async function sanitizeSharedStringReferences(buffer) {
  const archive = await JSZip.loadAsync(buffer);
  const sharedStringsFile = archive.file("xl/sharedStrings.xml");
  const sharedStringsXml = sharedStringsFile ? await sharedStringsFile.async("string") : "";
  const sharedStringCount = (sharedStringsXml.match(/<si(?:\s|>)/g) || []).length;
  let changed = false;

  for (const [name, file] of Object.entries(archive.files)) {
    if (file.dir || !/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue;
    const worksheetXml = await file.async("string");
    const sanitizedXml = worksheetXml.replace(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
      (cell, attributes, content = "") => {
        if (!/\bt=(["'])s\1/.test(attributes)) return cell;
        const sharedStringMatch = content.match(/<v>(\d+)<\/v>/);
        const sharedStringIndex = sharedStringMatch ? Number(sharedStringMatch[1]) : -1;
        if (sharedStringIndex >= 0 && sharedStringIndex < sharedStringCount) return cell;

        changed = true;
        const cellAttributes = attributes.replace(/\s+t=(["'])s\1/, "");
        return `<c${cellAttributes}/>`;
      },
    );
    if (sanitizedXml !== worksheetXml) archive.file(name, sanitizedXml);
  }

  return changed ? archive.generateAsync({ type: "uint8array" }) : buffer;
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
  return [...new Set(matches)][0] || null;
}

function modalityLabel(modality) {
  const parentProgram = modality?.programa || "";
  const selectedProgram = modality?.subdivision
    || modality?.programaCompleto
    || "";
  return [parentProgram, selectedProgram && selectedProgram !== parentProgram ? selectedProgram : ""]
    .filter(Boolean)
    .join(" · ");
}

function supportOptionsForEvent(event) {
  return (event?.variablesModalidades || [])
    .filter((item) => item.idTipoApoyo)
    .map((item) => ({
      ...item,
      label: [modalityLabel(item), item.tipoApoyo].filter(Boolean).join(" · "),
    }));
}

function resolveSupportVariable(value, options) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  const matches = options.filter((item) => [
    item.programaCompleto,
    item.subdivision,
    item.tipoApoyo,
    item.label,
  ].some((candidate) => normalizeText(candidate) === normalized));
  const variables = [...new Set(matches.map((item) => item.programaCompleto))];
  return variables.length === 1 ? variables[0] : "";
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

const COLUMN_DEFINITIONS = {
  identificacion: {
    aliases: [
      "CEDULA", "CEDULADECIUDADANIA", "NUMERODECEDULA", "NUMEROCEDULA",
      "NUMERODEIDENTIFICACION", "NUMEROIDENTIFICACION", "NOIDENTIFICACION",
      "NROIDENTIFICACION", "IDENTIFICACION", "NUMERODOCUMENTO",
      "NDEIDENTIFICACION", "NIDENTIFICACION", "DOCUMENTOIDENTIDAD",
      "DOCUMENTODEIDENTIDAD", "DOCUMENTO", "NODOCUMENTO",
      "IDENTIFICACIONOCODIGO", "IDENTIFICACIONOCODIGOINSTITUCIONAL",
      "DOCUMENTOOCODIGOINSTITUCIONAL",
    ],
    matches: (header) => /(?:NUMERO|NO|NRO|N)(?:DE)?(?:IDENTIFICACION|DOCUMENTO)/.test(header)
      || /CEDULA/.test(header)
      || /DOCUMENTO(?:DE)?IDENTIDAD/.test(header),
  },
  codigo: {
    aliases: [
      "COD", "CODIGO", "CODIGOESTUDIANTE", "CODIGOESTUDIANTIL", "CODIGOINSTITUCIONAL",
      "CODIGOACADEMICO", "CODIGOMATRICULA", "CODIGOALUMNO", "CODIGOALUMNA",
    ],
    matches: (header) => /CODIGO.*(?:ESTUDIANTE|ESTUDIANTIL|INSTITUCIONAL|ACADEMICO|MATRICULA|ALUMN[AO])/.test(header),
  },
  rol: {
    aliases: ["ROL", "TIPODEPARTICIPANTE", "ROLDELPARTICIPANTE"],
    matches: (header) => /(?:ROL|TIPO).*(?:PARTICIPANTE|PERSONA)/.test(header),
  },
  nombres: {
    aliases: ["NOMBRES", "NOMBRE", "PRIMERNOMBRE"],
    matches: (header) => /^(?:NOMBRES?|PRIMERNOMBRE)$/.test(header),
  },
  nombreCompleto: {
    aliases: [
      "NOMBRECOMPLETO", "NOMBRESYAPELLIDOS", "NOMBREYAPELLIDO",
      "APELLIDOSYNOMBRES", "NOMBRESAPELLIDOS",
    ],
    matches: (header) => /^(?:NOMBRECOMPLETO|NOMBRESYAPELLIDOS|NOMBREYAPELLIDO|APELLIDOSYNOMBRES|NOMBRESAPELLIDOS)$/.test(header),
  },
  apellidos: {
    aliases: ["APELLIDOS", "APELLIDO", "PRIMERAPELLIDO"],
    matches: (header) => /^(?:APELLIDOS?|PRIMERAPELLIDO)$/.test(header),
  },
  tipoDocumento: {
    aliases: ["TIPODOCUMENTO", "TIPODEDOCUMENTO", "TIPOIDENTIFICACION", "TIPODEIDENTIFICACION"],
    matches: (header) => /TIPO.*(?:DOCUMENTO|IDENTIFICACION)/.test(header),
  },
  fechaNacimiento: {
    aliases: ["FECHANACIMIENTO", "FECHADENACIMIENTO", "FECHANACER"],
    matches: (header) => /FECHA.*NACIMIENTO/.test(header),
  },
  lugarNacimiento: {
    aliases: ["LUGARDENACIMIENTO", "LUGARNACIMIENTO", "CIUDADNACIMIENTO"],
    matches: (header) => /(?:LUGAR|CIUDAD).*NACIMIENTO/.test(header),
  },
  genero: {
    aliases: ["GENERO", "SEXO"],
    matches: (header) => /^(?:GENERO|SEXO)$/.test(header),
  },
  correo: {
    aliases: [
      "CORREOPERSONAL", "EMAILPERSONAL", "CORREO", "EMAIL",
      "CORREOELECTRONICO", "DIRECCIONDECORREOELECTRONICO",
    ],
    matches: (header) => /^(?:CORREO|EMAIL|CORREOPERSONAL|EMAILPERSONAL|CORREOELECTRONICO|DIRECCIONDECORREOELECTRONICO)$/.test(header),
  },
  celular: {
    aliases: [
      "CELULAR", "TELEFONOMOVIL", "NUMEROCELULAR", "TELEFONOCELULAR",
      "NUMERODECELULAR", "NUMERODETELEFONOMOVIL",
    ],
    matches: (header) => /(?:CELULAR|MOVIL)/.test(header),
  },
  telefono: {
    aliases: ["TELEFONOALTERNATIVO", "TELEFONOFIJO", "TELEFONOSECUNDARIO", "TELEFONO"],
    matches: (header) => /TELEFONO/.test(header) && !/(?:MOVIL|CELULAR)/.test(header),
  },
  direccion: {
    aliases: ["DIRECCION", "DIRECCIONRESIDENCIA", "DIRECCIONDOMICILIO"],
    matches: (header) => /DIRECCION/.test(header),
  },
  municipio: {
    aliases: ["MUNICIPIO", "CIUDAD", "CIUDADRESIDENCIA", "MUNICIPIORESIDENCIA"],
    matches: (header) => /(?:MUNICIPIO|CIUDAD).*(?:RESIDENCIA)?/.test(header),
  },
  apoyo: {
    aliases: ["APOYO", "TIPODEAPOYO", "TIPOAPOYO", "MODALIDAD", "VARIABLE", "PROGRAMADEAPOYO"],
    matches: (header) => /(?:APOYO|MODALIDAD|VARIABLE)/.test(header),
  },
};

function isIdentifierCandidate(value) {
  const candidate = String(value || "").trim().replace(/\.0$/, "");
  return candidate.length >= 4 && candidate.length <= 64 && /\d/.test(candidate)
    && /^[\p{L}\p{N}._-]+$/u.test(candidate);
}

function parseWorkbook(workbook) {
  const sheets = workbook.SheetNames
    .map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
        header: 1,
        defval: "",
        raw: false,
        blankrows: true,
      }),
    }))
    .filter((sheet) => sheet.rows.some((row) => row.some((cell) => cellText(cell))));
  if (!sheets.length) throw new Error("El archivo no contiene hojas con datos.");

  for (const sheet of sheets) {
    for (let headerNumber = 1; headerNumber <= Math.min(sheet.rows.length, 20); headerNumber += 1) {
      const headers = new Map();
      (sheet.rows[headerNumber - 1] || []).forEach((cell, index) => {
        const header = normalizeHeader(cellText(cell));
        if (header) headers.set(header, index + 1);
      });
      const columns = Object.fromEntries(Object.entries(COLUMN_DEFINITIONS).map(([key, definition]) => [
        key,
        findColumn(headers, definition.aliases, definition.matches),
      ]));
      if (!columns.identificacion && !columns.codigo) continue;

      const rows = [];
      sheet.rows.forEach((row, index) => {
        const rowNumber = index + 1;
        if (rowNumber <= headerNumber) return;
        const identificacion = columns.identificacion ? cellText(row[columns.identificacion - 1]) : "";
        const codigoInstitucional = columns.codigo ? cellText(row[columns.codigo - 1]) : "";
        const entry = {
          rowNumber,
          identificacion,
          codigoInstitucional,
          nombres: columns.nombres ? cellText(row[columns.nombres - 1]) : "",
          nombreCompleto: columns.nombreCompleto ? cellText(row[columns.nombreCompleto - 1]) : "",
          apellidos: columns.apellidos ? cellText(row[columns.apellidos - 1]) : "",
          tipoDocumento: columns.tipoDocumento ? normalizeDocumentType(cellText(row[columns.tipoDocumento - 1])) : "",
          fechaNacimiento: columns.fechaNacimiento ? normalizeSpreadsheetDate(row[columns.fechaNacimiento - 1]) : "",
          lugarNacimiento: columns.lugarNacimiento ? cellText(row[columns.lugarNacimiento - 1]) : "",
          genero: columns.genero ? normalizeGender(cellText(row[columns.genero - 1])) : "",
          correo: columns.correo ? cellText(row[columns.correo - 1]) : "",
          celular: columns.celular ? cellText(row[columns.celular - 1]) : "",
          telefono: columns.telefono ? cellText(row[columns.telefono - 1]) : "",
          direccion: columns.direccion ? cellText(row[columns.direccion - 1]) : "",
          municipio: columns.municipio ? cellText(row[columns.municipio - 1]) : "",
          rolOriginal: columns.rol ? cellText(row[columns.rol - 1]) : "",
          apoyoOriginal: columns.apoyo ? cellText(row[columns.apoyo - 1]) : "",
        };
        if (identificacion || codigoInstitucional) rows.push(entry);
      });
      if (rows.length) return prepareRows(rows);
    }
  }

  const candidates = [];
  for (const sheet of sheets) {
    const countsByColumn = new Map();
    sheet.rows.forEach((row) => row.forEach((cell, index) => {
      if (isIdentifierCandidate(cellText(cell))) {
        const column = index + 1;
        countsByColumn.set(column, (countsByColumn.get(column) || 0) + 1);
      }
    }));
    const identifierColumn = [...countsByColumn.entries()]
      .sort((left, right) => right[1] - left[1])[0]?.[0];
    if (!identifierColumn) continue;
    sheet.rows.forEach((row, index) => {
      const rowNumber = index + 1;
      const value = cellText(row[identifierColumn - 1]);
      if (isIdentifierCandidate(value)) {
        candidates.push({
          rowNumber,
          identificacion: value,
          codigoInstitucional: "",
          nombres: "",
          nombreCompleto: "",
          apellidos: "",
          tipoDocumento: "",
          fechaNacimiento: "",
          lugarNacimiento: "",
          genero: "",
          correo: "",
          celular: "",
          telefono: "",
          direccion: "",
          municipio: "",
          rolOriginal: "",
          apoyoOriginal: "",
        });
      }
    });
    if (candidates.length) return prepareRows(candidates);
  }
  throw new Error("No se encontró una columna de documentos o códigos institucionales.");
}

function prepareRows(entries) {
  const rows = entries.map((entry) => {
    const identifier = entry.identificacion || entry.codigoInstitucional;
    const base = {
      ...entry,
      id: `${entry.rowNumber}-${identifier}`,
      identificador: identifier,
      tipo: entry.rolOriginal ? normalizeRole(entry.rolOriginal) : "ESTUDIANTE",
      status: "waiting",
      message: "Pendiente de validar.",
    };
    if (entry.rolOriginal && !base.tipo) {
      return { ...base, status: "invalid", message: `El rol "${entry.rolOriginal}" no es compatible. Usa estudiante, egresado, colaborador o externo.` };
    }
    if (!identifier) return { ...base, status: "invalid", message: "No se encontró documento ni código institucional." };
    if ((entry.identificacion || entry.codigoInstitucional) && !isIdentifierCandidate(entry.identificacion || entry.codigoInstitucional)) {
      return { ...base, status: "invalid", message: "El documento o código no tiene un formato válido." };
    }
    return base;
  });
  if (!rows.length) throw new Error("No se encontraron identificaciones o códigos institucionales en el Excel.");
  if (rows.length > MAX_ROWS) throw new Error(`El archivo supera el máximo de ${MAX_ROWS} participantes.`);
  return rows;
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }));
  return results;
}

async function createWorkbook() {
  const { default: ExcelJS } = await import("exceljs");
  return new ExcelJS.Workbook();
}

export default function BulkParticipantImport({ onPendingChange }) {
  const confirmedNavigationRef = useRef(false);
  const restoringHistoryRef = useRef(false);
  const historyIndexRef = useRef(window.history.state?.idx);
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [supportFilter, setSupportFilter] = useState("all");
  const [bulkSupportVariable, setBulkSupportVariable] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [creatingRowId, setCreatingRowId] = useState("");
  const [creatingUnknownBatch, setCreatingUnknownBatch] = useState(false);
  const [unknownBatchProgress, setUnknownBatchProgress] = useState({ completed: 0, total: 0 });
  const [autoCreateRoles, setAutoCreateRoles] = useState({
    EXTERNO: false,
    EGRESADO: false,
    COLABORADOR: false,
  });
  const [editingUnknownId, setEditingUnknownId] = useState("");
  const [unknownDrafts, setUnknownDrafts] = useState({});
  const [unknownSubmitError, setUnknownSubmitError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getEventosProximos()
      .then((availableEvents) => {
        if (!active) return;
        setEvents(availableEvents);
      })
      .catch(() => active && setError("Hubo un error al cargar las actividades disponibles."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const supportOptions = supportOptionsForEvent(selectedEvent);
  const requiresSupportVariable = Boolean(selectedEvent?.variablesModalidades?.length);
  const validCount = rows.filter((row) => ["valid", "registered"].includes(row.status)).length;
  const invalidCount = rows.filter((row) => row.status === "invalid").length;
  const notFoundRows = rows.filter((row) => row.status === "not_found");
  const editingUnknownRow = notFoundRows.find((row) => row.id === editingUnknownId);
  const duplicateCount = rows.filter((row) => row.status === "duplicate").length;
  const reviewRows = rows.filter((row) => !["not_found", "duplicate"].includes(row.status));
  const rowsForCurrentSupport = (items) => items.filter((row) => (
    supportFilter === "all"
      || (supportFilter === "none" && !row.modalidadVariable)
      || row.modalidadVariable === supportFilter
  ));
  const filteredReviewRows = rowsForCurrentSupport(reviewRows);
  const filteredNotFoundRows = rowsForCurrentSupport(notFoundRows);
  const enabledNotFoundRows = filteredNotFoundRows.filter((row) => autoCreateRoles[row.tipo]);
  const readyUnknownRows = enabledNotFoundRows.filter(
    (row) => (!requiresSupportVariable || row.modalidadVariable)
      && Object.keys(validarBorradorNoEncontrado(prepareUnknownParticipant(row))).length === 0,
  );
  const incompleteUnknownCount = enabledNotFoundRows.length - readyUnknownRows.length;
  const completedCount = rows.filter((row) => row.status === "registered").length;
  const registerableRows = rows.filter((row) => ["valid", "failed"].includes(row.status));
  const pendingValidCount = registerableRows.length;
  const readyToRegister = pendingValidCount > 0;
  const previouslyRegisterableCount = rows.filter(
    (row) => ["valid", "registered", "failed"].includes(row.status),
  ).length;
  const allRegistered = previouslyRegisterableCount > 0
    && completedCount === previouslyRegisterableCount;
  const hasPendingParticipants = rows.some((row) => (
    ["waiting", "valid", "invalid", "not_found", "failed", "registering"].includes(row.status)
  ));

  useEffect(() => {
    onPendingChange?.(hasPendingParticipants);
  }, [hasPendingParticipants, onPendingChange]);

  useEffect(() => {
    if (!hasPendingParticipants) return undefined;

    const warning = "Hay participantes cargados que todavía no se han registrado. Si sales o recargas esta ventana, se perderá la carga.";
    const confirmNavigation = (event) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || link.hasAttribute("download")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.href === window.location.href) return;
      if (!window.confirm(warning)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
      } else {
        confirmedNavigationRef.current = true;
        window.setTimeout(() => {
          confirmedNavigationRef.current = false;
        }, 0);
      }
    };
    const confirmUnload = (event) => {
      if (confirmedNavigationRef.current) {
        confirmedNavigationRef.current = false;
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    const confirmHistoryNavigation = (event) => {
      if (restoringHistoryRef.current) {
        restoringHistoryRef.current = false;
        historyIndexRef.current = window.history.state?.idx;
        return;
      }
      const nextIndex = window.history.state?.idx;
      if (window.confirm(warning)) {
        historyIndexRef.current = nextIndex;
        return;
      }
      event.stopImmediatePropagation?.();
      const currentIndex = historyIndexRef.current;
      const delta = Number.isInteger(currentIndex) && Number.isInteger(nextIndex)
        ? nextIndex - currentIndex
        : -1;
      restoringHistoryRef.current = true;
      window.history.go(-delta);
    };

    document.addEventListener("click", confirmNavigation, true);
    window.addEventListener("beforeunload", confirmUnload);
    window.addEventListener("popstate", confirmHistoryNavigation, true);
    return () => {
      document.removeEventListener("click", confirmNavigation, true);
      window.removeEventListener("beforeunload", confirmUnload);
      window.removeEventListener("popstate", confirmHistoryNavigation, true);
    };
  }, [hasPendingParticipants]);

  function resetImport() {
    setRows([]);
    setUnknownDrafts({});
    setEditingUnknownId("");
    setSupportFilter("all");
    setBulkSupportVariable("");
    setUnknownSubmitError("");
    setUnknownBatchProgress({ completed: 0, total: 0 });
    setAutoCreateRoles({ EXTERNO: false, EGRESADO: false, COLABORADOR: false });
    setMessage("");
    setError("");
  }

  function editUnknownParticipant(row) {
    setUnknownDrafts((current) => ({
      ...current,
      [row.id]: current[row.id] || prepareUnknownParticipant(row),
    }));
    setEditingUnknownId((current) => current === row.id ? "" : row.id);
    setUnknownSubmitError("");
    setError("");
  }

  function updateUnknownDraft(row, name, value) {
    setUnknownSubmitError("");
    setUnknownDrafts((current) => ({
      ...current,
      [row.id]: {
        ...current[row.id],
        [name]: value,
        ...(name === "tipo" && value === "EXTERNO"
          ? {
            identificacion: current[row.id]?.identificacion
              || current[row.id]?.codigoInstitucional
              || row.identificacion
              || row.codigoInstitucional
              || "",
            codigoInstitucional: "",
            correoInstitucional: "",
          }
          : name === "tipo" && value !== "ESTUDIANTE"
            ? { codigoInstitucional: "", correoInstitucional: "" }
            : {}),
      },
    }));
  }

  function updateRowSupport(row, modalidadVariable) {
    setRows((current) => current.map((item) => (
      item.id === row.id
        ? {
          ...item,
          modalidadVariable,
          ...(item.status === "invalid" && modalidadVariable ? {
            status: "failed",
            message: "Modalidad asignada. Se volverá a validar al registrar.",
          } : {}),
        }
        : item
    )));
    setUnknownSubmitError("");
  }

  function applySupportToPendingRows() {
    setRows((current) => current.map((row) => (
      ["valid", "failed", "invalid", "not_found"].includes(row.status)
        ? {
          ...row,
          modalidadVariable: bulkSupportVariable,
          ...(row.status === "invalid" && bulkSupportVariable ? {
            status: "failed",
            message: "Modalidad asignada. Se volverá a validar al registrar.",
          } : {}),
        }
        : row
    )));
    setUnknownDrafts((current) => Object.fromEntries(
      Object.entries(current).map(([id, draft]) => [
        id,
        { ...draft, modalidadVariable: bulkSupportVariable },
      ]),
    ));
  }

  function supportSelect(row, disabled = false) {
    return (
      <select
        className="form-select vec-bulk-support-select"
        value={row.modalidadVariable || ""}
        onChange={(event) => updateRowSupport(row, event.target.value)}
        disabled={disabled || !supportOptions.length}
        aria-label={`Variable o modalidad para ${row.nombres || row.apellidos || row.identificacion || row.codigoInstitucional || `fila ${row.rowNumber}`}`}
      >
        <option value="">{requiresSupportVariable ? "Selecciona una modalidad" : "Sin apoyo asignado"}</option>
        {supportOptions.map((option) => (
          <option key={option.programaCompleto} value={option.programaCompleto}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  async function registerUnknownParticipant(row) {
    const draft = unknownDrafts[row.id];
    if (!selectedEvent || !draft) return;
    if (requiresSupportVariable && !row.modalidadVariable) {
      setUnknownSubmitError("Selecciona la variable o modalidad para inscribir a esta persona.");
      return;
    }
    setCreatingRowId(row.id);
    setUnknownSubmitError("");
    setError("");
    setMessage("");
    try {
      const result = await registrarNoEncontradoMasivo({
        idActividad: selectedEvent.id,
        participante: {
          ...draft,
          fila: row.rowNumber,
          tipo: draft.tipo,
          modalidadVariable: row.modalidadVariable || "",
        },
      });
      if (result?.registrado !== true || !result.idInscripcion) {
        throw new Error("El servidor no confirmó la inscripción. Verifica el resultado antes de volver a intentarlo.");
      }
      setRows((current) => current.map((item) => (
        item.id === row.id
          ? { ...item, status: "registered", message: `Creado e inscrito como ${ROLE_OPTIONS.find((role) => role.value === result.rol)?.label || result.rol}.` }
          : item
      )));
      setEditingUnknownId("");
      setMessage(`La persona de la fila ${row.rowNumber} se creó y quedó inscrita como ${ROLE_OPTIONS.find((role) => role.value === result.rol)?.label || result.rol}.`);
    } catch (requestError) {
      setUnknownSubmitError(requestError.message || "No se pudo crear e inscribir a la persona. Revisa los datos e inténtalo de nuevo.");
    } finally {
      setCreatingRowId("");
    }
  }

  async function registerUnknownParticipantsBatch() {
    if (!selectedEvent || creatingUnknownBatch || !readyUnknownRows.length) return;
    const batchRows = readyUnknownRows;
    setCreatingUnknownBatch(true);
    setUnknownSubmitError("");
    setError("");
    setMessage("");
    setUnknownBatchProgress({ completed: 0, total: batchRows.length });
    setRows((current) => current.map((row) => (
      batchRows.some((candidate) => candidate.id === row.id)
        ? { ...row, status: "registering", message: "Creando perfil e inscribiendo en la actividad..." }
        : row
    )));

    try {
      const outcomes = await mapConcurrent(batchRows, 4, async (row) => {
        try {
          const participant = prepareUnknownParticipant(row);
          const result = await registrarNoEncontradoMasivo({
            idActividad: selectedEvent.id,
            participante: {
              ...participant,
              fila: row.rowNumber,
              modalidadVariable: row.modalidadVariable || "",
            },
          });
          if (result?.registrado !== true || !result.idInscripcion) {
            throw new Error("El servidor no confirmó la inscripción.");
          }
          return {
            id: row.id,
            status: "registered",
            message: `Creado e inscrito como ${ROLE_OPTIONS.find((role) => role.value === result.rol)?.label || result.rol}.`,
          };
        } catch (requestError) {
          return {
            id: row.id,
            status: "not_found",
            message: requestError.message || "No se pudo crear el perfil; completa o corrige los datos.",
          };
        } finally {
          setUnknownBatchProgress((current) => ({
            ...current,
            completed: current.completed + 1,
          }));
        }
      });
      const outcomeById = new Map(outcomes.map((outcome) => [outcome.id, outcome]));
      setRows((current) => current.map((row) => {
        const outcome = outcomeById.get(row.id);
        return outcome ? { ...row, status: outcome.status, message: outcome.message } : row;
      }));
      const registeredCount = outcomes.filter((outcome) => outcome.status === "registered").length;
      const failedCount = outcomes.length - registeredCount;
      setMessage(
        `${registeredCount} perfiles creados e inscritos en la actividad.`
        + (failedCount ? ` ${failedCount} filas requieren corrección; revisa el mensaje de cada una.` : ""),
      );
    } finally {
      setCreatingUnknownBatch(false);
    }
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
    const extension = file.name.split(".").pop()?.toLocaleLowerCase("es");
    if (!["xlsx", "xls", "xlsm", "xlsb", "ods", "csv", "tsv"].includes(extension)) {
      setError("Formato no compatible. Sube una hoja de cálculo .xlsx, .xls, .xlsm, .xlsb, .ods, .csv o .tsv.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("El archivo supera el límite de 5 MB.");
      return;
    }

    setValidating(true);
    try {
      const fileBuffer = await file.arrayBuffer();
      const fileData = extension === "xlsx"
        ? await sanitizeSharedStringReferences(fileBuffer)
        : fileBuffer;
      const spreadsheet = XLSX.read(fileData, {
        type: "array",
        cellDates: false,
        codepage: 65001,
      });
      const parsedRows = parseWorkbook(spreadsheet).map((row) => ({
        ...row,
        modalidadVariable: resolveSupportVariable(row.apoyoOriginal, supportOptions)
          || bulkSupportVariable
          || (selectedEvent?.variablesModalidades?.length === 1 && supportOptions.length === 1
            ? supportOptions[0].programaCompleto
            : ""),
      }));
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
            codigoInstitucional: row.codigoInstitucional,
            tipo: row.tipo,
            tipoDocumento: "CC",
            nombres: row.nombres,
            nombreCompleto: row.nombreCompleto,
            apellidos: row.apellidos,
            modalidadVariable: row.modalidadVariable || "",
          })),
        });
        const validationsByRow = new Map(validation.filas.map((row) => [row.fila, row]));
        const prepared = parsedRows.map((row) => {
          const validated = validationsByRow.get(row.rowNumber);
          return {
            ...row,
            status: validated?.status || "invalid",
            message: validated?.message || "No se recibió el resultado de validación.",
            identificacion: validated?.identificacion || row.identificacion,
            codigoInstitucional: row.codigoInstitucional,
            nombres: validated?.nombres || row.nombres,
            nombreCompleto: row.nombreCompleto,
            apellidos: validated?.apellidos || row.apellidos,
            modalidadVariable: validated?.modalidadVariable || row.modalidadVariable || "",
            idTipoApoyo: validated?.idTipoApoyo || "",
          };
        });
        setRows(prepared);
        const validRows = prepared.filter((row) => row.status === "valid");
        const duplicateRows = prepared.filter((row) => row.status === "duplicate");
        const missingRows = prepared.filter((row) => row.status === "not_found");
        if (validRows.length > 0) {
          setMessage(
            `${validRows.length} participantes únicos listos para registrar.`
            + (duplicateRows.length ? ` Se omitieron ${duplicateRows.length} duplicados o ya inscritos.` : "")
            + (missingRows.length ? ` ${missingRows.length} no encontrados se muestran por separado.` : ""),
          );
        } else if (missingRows.length || duplicateRows.length) {
          setMessage("No hay participantes nuevos listos para registrar; revisa las tablas de omitidos.");
        }
        if (prepared.some((row) => row.status === "invalid")) {
          setError("Hay filas con otros errores de validación. Corrígelas y vuelve a cargar el archivo.");
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
        participantes: registerableRows.map((row) => ({
          fila: row.rowNumber,
          identificacion: row.identificacion,
          codigoInstitucional: row.codigoInstitucional,
          tipo: row.tipo,
          tipoDocumento: "CC",
          nombres: row.nombres,
          nombreCompleto: row.nombreCompleto,
          apellidos: row.apellidos,
          modalidadVariable: row.modalidadVariable || "",
        })),
      });
      const outcomes = result.participantes || [];
      const outcomesByRow = new Map(outcomes.map((participant) => [participant.fila, participant]));
      setRows((current) => current.map((row) => {
        const outcome = outcomesByRow.get(row.rowNumber);
        if (!outcome) return row;
        return {
          ...row,
          status: outcome.status,
          message: outcome.message,
        };
      }));
      const failedCount = outcomes.filter(
        (participant) => participant.status === "failed" || participant.status === "invalid",
      ).length;
      const missingCount = outcomes.filter((participant) => participant.status === "not_found").length
        + notFoundRows.length;
      setMessage(
        `${result.registrados} participantes registrados correctamente.`
        + (failedCount ? ` ${failedCount} requieren revisión; los demás continúan disponibles.` : "")
        + (missingCount ? ` ${missingCount} personas no encontradas siguen disponibles para crear su perfil.` : ""),
      );
    } catch (requestError) {
      const messageText = requestError.message || "No se pudo completar el registro masivo.";
      setRows((current) => current.map((row) => ({
        ...row,
        ...(registerableRows.some((candidate) => candidate.id === row.id) ? {
          status: "failed",
          message: messageText,
        } : {}),
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
      { header: "Documento o código institucional", key: "identificador", width: 34 },
      { header: "Nombres", key: "nombres", width: 26 },
      { header: "Apellidos", key: "apellidos", width: 26 },
      { header: "Rol de participante", key: "rol", width: 24 },
      { header: "Tipo de documento", key: "tipoDocumento", width: 20 },
      { header: "Fecha de nacimiento", key: "fechaNacimiento", width: 22 },
      { header: "Lugar de nacimiento", key: "lugarNacimiento", width: 24 },
      { header: "Género", key: "genero", width: 18 },
      { header: "Correo personal", key: "correo", width: 32 },
      { header: "Celular", key: "celular", width: 20 },
      { header: "Teléfono alternativo", key: "telefono", width: 24 },
      { header: "Dirección", key: "direccion", width: 32 },
      { header: "Municipio de residencia", key: "municipio", width: 26 },
      { header: "Apoyo", key: "apoyo", width: 32 },
    ];
    const header = sheet.getRow(1);
    header.height = 26;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002855" } };
      cell.alignment = { vertical: "middle" };
    });
    sheet.autoFilter = { from: "A1", to: "N1" };
    const instructions = workbook.addWorksheet("Instrucciones");
    instructions.addRows([
      ["Plantilla para registrar participantes"],
      ["Completa una fila por participante usando documento o código institucional."],
      ["Para crear e inscribir en lote perfiles nuevos de egresados, colaboradores o externos, completa identificación, nombres, apellidos, tipo de documento, fecha y lugar de nacimiento, género, correo personal, celular, teléfono alternativo, dirección y municipio."],
      ["Las personas que ya existen se validan contra sus datos institucionales; los datos adicionales del Excel no reemplazan información existente."],
      ["Indica el rol en la columna Rol de participante: Estudiante, Egresado, Colaborador o Externo. Si se omite, se conserva el comportamiento anterior y se toma como Estudiante."],
      ["Al marcar en la revisión los roles permitidos, se crean los perfiles en las tablas sat.egresados, sat.colaboradores o sat.externos (requiere la migración de roles) y se inscriben en la actividad seleccionada."],
      ["Para fechas usa AAAA-MM-DD o DD/MM/AAAA; el género debe coincidir con una opción permitida en el formulario."],
      ["El apoyo puede asignarse por fila en la revisión; también puedes asignar el mismo apoyo en lote."],
      ["Si incluyes una columna llamada Apoyo, Tipo de apoyo o Modalidad, el sistema intentará asociar el valor con las opciones de la actividad."],
      ["Se admiten archivos .xlsx, .xls, .xlsm, .xlsb, .ods, .csv y .tsv; encabezados en distintas filas o una columna identificable sin encabezados."],
      ["Las personas no encontradas se muestran aparte. Puedes crear su perfil con el rol correspondiente y asignar el apoyo elegido a esa inscripción."],
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
    const event = events.find((item) => item.id === value);
    const options = supportOptionsForEvent(event);
    setSelectedEventId(value);
    setSupportFilter("all");
    setBulkSupportVariable(
      event?.variablesModalidades?.length === 1 && options.length === 1
        ? options[0].programaCompleto
        : "",
    );
    setRows([]);
    setAutoCreateRoles({ EXTERNO: false, EGRESADO: false, COLABORADOR: false });
    setUnknownBatchProgress({ completed: 0, total: 0 });
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
        <label className="form-label" htmlFor="bulk-activity">1. Actividad</label>
        <select
          className="form-select"
          id="bulk-activity"
          value={selectedEventId}
          onChange={(event) => onActivityChange(event.target.value)}
          disabled={loading || validating || registering || creatingUnknownBatch}
        >
          <option value="">{loading ? "Cargando actividades..." : "Selecciona una actividad"}</option>
          {events.map((event) => (
            <option key={event.id} value={event.id} disabled={event.estado === "CANCELADA"}>
              {event.actividad}
            </option>
          ))}
        </select>
        {!loading && !events.length && (
          <p className="vec-bulk-registration__hint">No hay actividades disponibles para registrar participantes.</p>
        )}
        {events.some((event) => event.estado === "CANCELADA") && (
          <p className="vec-bulk-registration__hint">Las actividades canceladas aparecen en la lista, pero no se pueden seleccionar.</p>
        )}
      </div>

      {selectedEvent && (
        <div className="vec-bulk-registration__activity">
          <div className="vec-bulk-registration__activity-details">
            <span className="vec-bulk-registration__eyebrow">ACTIVIDAD SELECCIONADA</span>
            <strong>{selectedEvent.actividad}</strong>
            <span className="vec-bulk-registration__activity-program">
              <i className="fas fa-heart" aria-hidden="true"></i>
              {selectedEvent.programaBienestar || "Sin programa de Bienestar asociado"}
            </span>
            <div className="vec-bulk-registration__activity-meta">
              <span><i className="far fa-calendar" aria-hidden="true"></i>{selectedEvent.periodo}</span>
              <span><i className="far fa-clock" aria-hidden="true"></i>{displayDate(selectedEvent.fechaInicio)} – {displayDate(selectedEvent.fechaFinalizacion)}</span>
              <span><i className="fas fa-location-dot" aria-hidden="true"></i>{selectedEvent.ubicacion || "Ubicación no especificada"}</span>
            </div>
          </div>
          <div className="vec-bulk-registration__modalities">
            <span className="form-label">Modalidades y apoyos de esta actividad</span>
            {supportOptions.length > 0 ? (
              <>
                <div className="vec-bulk-registration__modality-list">
                  {supportOptions.map((item) => (
                    <span className="vec-bulk-registration__chip" key={item.programaCompleto}>
                      <strong>{item.subdivision || item.programaCompleto}</strong>
                      <small>{item.tipoApoyo || "Apoyo asociado"}</small>
                    </span>
                  ))}
                </div>
                <span className="vec-bulk-registration__no-modalities">
                  Selecciona una opción para la lista o asigna distintas modalidades por participante.
                </span>
              </>
            ) : (
              <span className="vec-bulk-registration__no-modalities">Esta actividad no tiene apoyos configurados.</span>
            )}
          </div>
        </div>
      )}

      {selectedEvent && supportOptions.length > 0 && (
        <div className="vec-bulk-registration__section">
          <label className="form-label" htmlFor="bulk-default-support">
            2. Programa de bienestar o modalidad para esta carga
          </label>
          <select
            className="form-select"
            id="bulk-default-support"
            value={bulkSupportVariable}
            onChange={(event) => setBulkSupportVariable(event.target.value)}
            disabled={validating || registering || creatingUnknownBatch}
          >
            <option value="">Elegir por participante después de cargar el archivo</option>
            {supportOptions.map((option) => (
              <option key={option.programaCompleto} value={option.programaCompleto}>
                {[option.subdivision || option.programaCompleto, option.tipoApoyo].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
          <p className="vec-bulk-registration__hint">
            Si eliges una opción, se aplicará inicialmente a todas las filas. Podrás cambiar la modalidad de cada persona antes de inscribirla; el apoyo se asigna según la modalidad elegida.
          </p>
        </div>
      )}

      <div className="vec-bulk-registration__section">
        <div className="vec-bulk-registration__file-heading">
          <div>
            <label className="form-label" htmlFor="bulk-file">
              {supportOptions.length ? "3." : "2."} Archivo de participantes
            </label>
            <p>Incluye la columna Rol de participante para distinguir estudiantes, egresados, colaboradores y externos. Si se omite, el sistema asume Estudiante. Las personas no encontradas se pueden crear con el rol y los datos personales indicados.</p>
          </div>
          <button
            className="btn btn-outline btn-sm"
            type="button"
            onClick={() => {
              setError("");
              downloadTemplate().catch(() => setError("Hubo un error al generar la plantilla."));
            }}
            disabled={!selectedEvent || registering || creatingUnknownBatch}
          >
            <i className="fas fa-download" aria-hidden="true"></i> Descargar plantilla
          </button>
        </div>
        <label className={`vec-bulk-registration__dropzone${!selectedEvent ? " is-disabled" : ""}`} htmlFor="bulk-file">
          <i className="fas fa-cloud-arrow-up" aria-hidden="true"></i>
          <strong>{validating ? "Leyendo y verificando archivo..." : "Selecciona el archivo Excel"}</strong>
          <span>Máximo {MAX_ROWS} participantes y 5 MB. Excel, ODS, CSV o TSV.</span>
          <input
            id="bulk-file"
            type="file"
            accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.tsv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={handleFile}
            disabled={!selectedEvent || validating || registering || creatingUnknownBatch}
          />
        </label>
      </div>

      {error && <div className="auth-error vec-bulk-registration__alert" role="alert">{error}</div>}
      {message && <div className="autosave-banner vec-bulk-registration__alert" role="status">{message}</div>}

      {rows.length > 0 && (
        <div className="vec-bulk-preview">
          <div className="vec-bulk-preview__header">
            <div>
              <span className="vec-bulk-registration__eyebrow">REVISIÓN DE LA CARGA</span>
              <h3>Resumen de participantes</h3>
              <p>Verifica los registros antes de confirmar. Los duplicados se omiten y las personas no encontradas se pueden crear por separado.</p>
            </div>
            <div className="vec-bulk-preview__counts" aria-label="Resumen de validación">
              <span className="vec-bulk-preview__count"><strong>{rows.length}</strong><small>Total</small></span>
              <span className="vec-bulk-preview__count is-valid"><strong>{validCount}</strong><small>Válidos</small></span>
              <span className="vec-bulk-preview__count is-invalid"><strong>{invalidCount}</strong><small>Con error</small></span>
              {duplicateCount > 0 && <span className="vec-bulk-preview__count is-duplicate"><strong>{duplicateCount}</strong><small>Omitidos</small></span>}
              {notFoundRows.length > 0 && <span className="vec-bulk-preview__count is-not-found"><strong>{notFoundRows.length}</strong><small>No encontrados</small></span>}
            </div>
          </div>

          {supportOptions.length > 0 && (
            <div className="vec-bulk-support-tools">
              <label className="form-group">
                <span className="form-label">Filtrar por programa / modalidad</span>
                <select
                  className="form-select"
                  value={supportFilter}
                  onChange={(event) => setSupportFilter(event.target.value)}
                >
                  <option value="all">Todos los programas y modalidades</option>
                  <option value="none">Sin apoyo asignado</option>
                  {supportOptions.map((option) => (
                    <option key={option.programaCompleto} value={option.programaCompleto}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-group">
                <span className="form-label">Cambiar modalidad para participantes pendientes</span>
                <select
                  className="form-select"
                  value={bulkSupportVariable}
                  onChange={(event) => setBulkSupportVariable(event.target.value)}
                >
                  <option value="">{requiresSupportVariable ? "Selecciona una modalidad" : "Sin apoyo asignado"}</option>
                  {supportOptions.map((option) => (
                    <option key={option.programaCompleto} value={option.programaCompleto}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn btn-outline btn-sm"
                type="button"
                onClick={applySupportToPendingRows}
                disabled={
                  (requiresSupportVariable && !bulkSupportVariable)
                  || !rows.some((row) => ["valid", "failed", "invalid", "not_found"].includes(row.status))
                }
              >
                Aplicar modalidad seleccionada
              </button>
            </div>
          )}

          {(registering || creatingUnknownBatch) && (
            <div className="vec-bulk-progress" role="status">
              <span>{creatingUnknownBatch
                ? `Creando e inscribiendo perfiles: ${unknownBatchProgress.completed} de ${unknownBatchProgress.total}.`
                : "Registrando los participantes validados; cada fila se procesa de forma independiente."}</span>
              {creatingUnknownBatch
                ? <progress value={unknownBatchProgress.completed} max={unknownBatchProgress.total || 1} />
                : <progress />}
            </div>
          )}

          {filteredReviewRows.length > 0 && (
            <section className="vec-bulk-preview__section">
              <div className="vec-bulk-preview__section-heading">
                <div className="vec-bulk-preview__section-icon is-review" aria-hidden="true">
                  <i className="fas fa-clipboard-check"></i>
                </div>
                <div>
                  <h4>Registros para revisar</h4>
                  <p>Participantes encontrados y validados contra los registros disponibles.</p>
                </div>
                <span className="vec-bulk-preview__section-total">{filteredReviewRows.length} registros</span>
              </div>
              <div className="table-responsive vec-bulk-preview__table">
                <table className="table vec-bulk-preview__data-table">
                  <thead>
                    <tr><th>Fila</th><th>Documento / código</th><th>Persona</th><th>Variable o modalidad</th><th>Estado de validación</th></tr>
                  </thead>
                  <tbody>
                    {filteredReviewRows.map((row) => (
                      <tr key={row.id}>
                        <td><span className="vec-bulk-preview__row-number">{row.rowNumber}</span></td>
                        <td><span className="vec-bulk-preview__identifier">{row.identificacion || row.codigoInstitucional || "—"}</span></td>
                        <td><span className="vec-bulk-preview__person-name">{[row.nombres, row.apellidos].filter(Boolean).join(" ") || "—"}</span></td>
                        <td>
                          {supportSelect(row, !["valid", "failed"].includes(row.status) || registering || creatingUnknownBatch)}
                          {row.apoyoOriginal && !row.modalidadVariable && (
                            <small className="vec-bulk-row-message">
                              El valor «{row.apoyoOriginal}» del Excel no coincide con las opciones; selecciónalo manualmente.
                            </small>
                          )}
                        </td>
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
            </section>
          )}
          {supportFilter !== "all" && filteredReviewRows.length === 0 && filteredNotFoundRows.length === 0 && (
            <p className="vec-bulk-registration__hint" role="status">
              No hay participantes pendientes con el apoyo seleccionado.
            </p>
          )}

          {filteredNotFoundRows.length > 0 && (
            <section className="vec-bulk-preview__section vec-bulk-preview__section--unregistered">
              <div className="vec-bulk-preview__section-heading">
                <div className="vec-bulk-preview__section-icon is-unregistered" aria-hidden="true">
                  <i className="fas fa-user-plus"></i>
                </div>
                <div>
                  <h4>Personas no registradas</h4>
                  <p>Activa los roles que deseas crear desde esta lista. Los perfiles se guardan en su tabla de rol y quedan inscritos en la actividad seleccionada. El rol Externo es exclusivo.</p>
                </div>
                <span className="vec-bulk-preview__section-total">{filteredNotFoundRows.length} pendientes</span>
              </div>
              <div className="vec-bulk-auto-create">
                <div className="vec-bulk-auto-create__roles">
                  {ROLE_OPTIONS.filter((role) => role.value !== "ESTUDIANTE").map((role) => (
                    <label key={role.value}>
                      <input
                        type="checkbox"
                        checked={autoCreateRoles[role.value]}
                        onChange={(event) => setAutoCreateRoles((current) => ({
                          ...current,
                          [role.value]: event.target.checked,
                        }))}
                        disabled={creatingUnknownBatch || registering}
                      />
                      <span>Crear automáticamente {role.label.toLocaleLowerCase("es")}</span>
                    </label>
                  ))}
                </div>
                <div className="vec-bulk-auto-create__action">
                  <p>
                    {readyUnknownRows.length} filas listas
                    {incompleteUnknownCount ? ` · ${incompleteUnknownCount} sin todos los datos obligatorios` : ""}
                    {!enabledNotFoundRows.length ? " · Selecciona uno o más roles para activar la creación." : ""}
                  </p>
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    onClick={registerUnknownParticipantsBatch}
                    disabled={
                      creatingUnknownBatch
                      || registering
                      || validating
                      || Boolean(editingUnknownId)
                      || readyUnknownRows.length === 0
                    }
                  >
                    <i className={`fas ${creatingUnknownBatch ? "fa-spinner fa-spin" : "fa-users"}`} aria-hidden="true"></i>
                    {creatingUnknownBatch
                      ? "Creando e inscribiendo..."
                      : `Crear e inscribir ${readyUnknownRows.length} en lote`}
                  </button>
                </div>
                <small>Para crear en lote, el archivo debe incluir identificación, nombres, apellidos, tipo de documento, fecha y lugar de nacimiento, género, correo personal, celular, teléfono alternativo, dirección y municipio. Las filas incompletas siguen disponibles para el formulario individual.</small>
              </div>
              <div className="table-responsive vec-bulk-preview__table">
                <table className="table vec-bulk-preview__data-table">
                  <thead><tr><th>Fila</th><th>Documento / código</th><th>Nombre en Excel</th><th>Variable o modalidad</th><th>Estado y acción</th></tr></thead>
                  <tbody>
                    {filteredNotFoundRows.map((row) => (
                      <tr key={row.id}>
                        <td><span className="vec-bulk-preview__row-number">{row.rowNumber}</span></td>
                        <td><span className="vec-bulk-preview__identifier">{row.identificacion || row.codigoInstitucional || "—"}</span></td>
                        <td><span className="vec-bulk-preview__person-name">{[row.nombres, row.apellidos].filter(Boolean).join(" ") || row.nombreCompleto || "Sin nombre en el archivo"}</span></td>
                        <td>{supportSelect(row, registering || creatingUnknownBatch || creatingRowId === row.id)}</td>
                        <td className="vec-bulk-unregistered__action">
                          <span className="vec-bulk-row-status vec-bulk-row-status--not-found">Persona no registrada</span>
                          <small className="vec-bulk-row-message">{row.message}</small>
                          <button
                            className="btn btn-outline btn-sm"
                            type="button"
                            onClick={() => editUnknownParticipant(row)}
                            disabled={registering || creatingUnknownBatch || creatingRowId === row.id}
                          >
                            <i className="fas fa-user-plus" aria-hidden="true"></i>
                            {editingUnknownId === row.id ? "Cerrar formulario" : "Crear perfil e inscribir"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {editingUnknownRow && (
            <UnknownParticipantDialog
              row={editingUnknownRow}
              draft={unknownDrafts[editingUnknownRow.id]}
              busy={creatingRowId === editingUnknownRow.id}
              serverError={unknownSubmitError}
              supportOptions={supportOptions}
              modalityVariable={editingUnknownRow.modalidadVariable}
              onChange={(name, value) => updateUnknownDraft(editingUnknownRow, name, value)}
              onSupportChange={(value) => updateRowSupport(editingUnknownRow, value)}
              onClose={() => setEditingUnknownId("")}
              onSubmit={() => registerUnknownParticipant(editingUnknownRow)}
            />
          )}

          {duplicateCount > 0 && (
            <p className="vec-bulk-registration__hint">
              Se omitieron {duplicateCount} fila(s) duplicada(s) o ya inscritas; cada persona se conserva una sola vez.
            </p>
          )}

          <div className="vec-bulk-preview__actions">
            {allRegistered && (
              <span className="vec-bulk-preview__complete"><i className="fas fa-check-circle" aria-hidden="true"></i> Proceso finalizado</span>
            )}
            <button
              className="btn btn-primary"
              type="button"
              onClick={registerParticipants}
              disabled={registering || creatingUnknownBatch || validating || !readyToRegister}
            >
              <i className={`fas ${registering ? "fa-spinner fa-spin" : "fa-users"}`} aria-hidden="true"></i>
              {allRegistered ? "Participantes registrados" : registering ? "Registrando lista..." : `Registrar ${pendingValidCount} participantes pendientes`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}