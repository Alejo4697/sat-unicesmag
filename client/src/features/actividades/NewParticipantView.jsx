import { useEffect, useState } from "react";
import {
  buscarParticipante,
  getCatalogoMaestroActividades,
  getCatalogosEstudiante,
  registrarActividad,
} from "./participantesApi.js";

const TIPOS = [
  { value: "ESTUDIANTE", label: "Estudiante" },
  { value: "COLABORADOR", label: "Colaborador" },
  { value: "EGRESADO", label: "Egresado" },
  { value: "EXTERNO", label: "Externo" },
];

const TIPOS_DOCUMENTO = [
  { value: "CC", label: "Cédula de ciudadanía" },
  { value: "TI", label: "Tarjeta de identidad" },
  { value: "CE", label: "Cédula de extranjería" },
  { value: "PA", label: "Pasaporte" },
  { value: "RC", label: "Registro civil de nacimiento" },
  { value: "NIT", label: "NIT" },
  { value: "PPT", label: "Permiso por Protección Temporal (PPT)" },
  { value: "PEP", label: "Permiso Especial de Permanencia (PEP)" },
  { value: "CD", label: "Carné diplomático" },
  { value: "SC", label: "Salvoconducto" },
  { value: "NUIP", label: "Número Único de Identificación Personal (NUIP)" },
  { value: "OTRO", label: "Otro documento" },
];

const ALIAS_TIPOS_DOCUMENTO = new Map([
  ["CEDULA", "CC"],
  ["CEDULA DE CIUDADANIA", "CC"],
  ["CEDULA CIUDADANIA", "CC"],
  ["TARJETA DE IDENTIDAD", "TI"],
  ["TARJETA IDENTIDAD", "TI"],
  ["CEDULA DE EXTRANJERIA", "CE"],
  ["CEDULA EXTRANJERIA", "CE"],
  ["PASAPORTE", "PA"],
  ["REGISTRO CIVIL", "RC"],
  ["REGISTRO CIVIL DE NACIMIENTO", "RC"],
  ["PERMISO POR PROTECCION TEMPORAL", "PPT"],
  ["PERMISO ESPECIAL DE PERMANENCIA", "PEP"],
  ["CARNE DIPLOMATICO", "CD"],
]);

function normalizarTipoDocumento(value) {
  const original = String(value || "").trim();
  if (!original) return "";
  const normalized = original.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toUpperCase();
  const compact = normalized.replace(/\s+/g, "");
  const code = TIPOS_DOCUMENTO.find((item) => item.value === compact)?.value;
  return code || ALIAS_TIPOS_DOCUMENTO.get(normalized) || normalized;
}

const EMPTY_FORM = {
  tipoDocumento: "",
  identificacion: "",
  nombres: "",
  apellidos: "",
  codigo: "",
  programaAcademico: "",
  programaPosgradoDependencia: "",
  semestre: "",
  jornada: "",
  dependencia: "",
  cargo: "",
  fechaEgreso: "",
  correo: "",
  celular: "",
  telefono: "",
  contacto: "",
  genero: "",
  fechaNacimiento: "",
  etnia: "",
  municipio: "",
  discapacidad: "",
  conflictoArmado: "",
};

const EMPTY_ACTIVIDAD = {
  idPeriodo: "",
  idCatalogoActividad: "",
  lineaAccion: "",
  componente: "",
  programa: "",
  proyecto: "",
  actividadBusqueda: "",
  alianzaInterinstitucional: "",
  entidadAlianza: "",
  articulacionInstitucional: "",
  idDependencia: "",
  dependenciaOtra: "",
  modalidad: "",
  fechaInicio: "",
  fechaFinalizacion: "",
  idTipoApoyo: "",
  estrategiaPoliticaBienestar: "",
  estrategiaPoliticaPermanencia: "",
  estrategiaPoliticaEducacionInclusiva: "",
};

const EMPTY_CATALOGOS = {
  periodos: [],
  dependencias: [],
  tiposApoyo: [],
};

function autoCompletarRamasUnicas(next, catalogoActividades, startAt) {
  const hierarchy = [
    ["componente", "Sin componente en el Excel"],
    ["programa", "Sin programa en el Excel"],
    ["proyecto", "Sin proyecto en el Excel"],
  ];
  let matchingRows = filterCatalogo(catalogoActividades, { lineaAccion: next.lineaAccion });

  for (let index = 0; index < hierarchy.length; index += 1) {
    const [field, emptyLabel] = hierarchy[index];
    if (index < startAt) {
      matchingRows = filterCatalogo(matchingRows, { [field]: next[field] });
      continue;
    }
    const options = catalogOptions(matchingRows, field, emptyLabel);
    if (!next[field] && options.length === 1) next[field] = options[0].value;
    matchingRows = filterCatalogo(matchingRows, { [field]: next[field] });
  }

  return next;
}

const UNAVAILABLE = "No registrado";
const NULL_CATALOG_VALUE = "__SIN_VALOR_EN_EXCEL__";

function filterCatalogo(rows, filters) {
  return rows.filter((row) => Object.entries(filters).every(([key, value]) => {
    if (!value) return true;
    const field = row[key] || "";
    return value === NULL_CATALOG_VALUE ? !field : field === value;
  }));
}

function catalogOptions(rows, key, emptyLabel) {
  const values = new Set(rows.map((row) => row[key] || NULL_CATALOG_VALUE));
  return [...values]
    .sort((left, right) => left.localeCompare(right, "es"))
    .map((value) => ({
      value,
      label: value === NULL_CATALOG_VALUE ? emptyLabel : value,
    }));
}

function calculateAge(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  if (today.getMonth() < date.getMonth()
    || (today.getMonth() === date.getMonth() && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age >= 0 ? String(age) : "";
}

function SectionCard({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="card"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      style={{ padding: 0, overflow: "hidden" }}
    >
      <summary
        style={{
          alignItems: "center",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          listStyle: "none",
          padding: "1rem 1.25rem",
        }}
      >
        <span className="card-title">
          <i className={`fas ${icon}`} aria-hidden="true"></i>
          {title}
        </span>
        <i className={`fas ${open ? "fa-chevron-up" : "fa-chevron-down"}`} aria-hidden="true"></i>
      </summary>
      <div style={{ padding: "0 1.25rem 1.25rem" }}>{children}</div>
    </details>
  );
}

function Field({
  name,
  label,
  value,
  onChange,
  type = "text",
  readOnly = false,
  required = false,
  placeholder,
  options,
}) {
  const id = `vec-${name}`;
  const displayValue = value == null ? "" : String(value);
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      {options ? (
        <select
          className="form-select"
          id={id}
          value={displayValue}
          onChange={(event) => onChange(name, event.target.value)}
          required={required}
          disabled={readOnly}
        >
          <option value="">{placeholder || "Selecciona una opción"}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea
          className="form-control"
          id={id}
          value={displayValue}
          onChange={(event) => onChange(name, event.target.value)}
          readOnly={readOnly}
          required={required}
          placeholder={placeholder || (readOnly && !displayValue ? UNAVAILABLE : "")}
          rows={3}
        />
      ) : (
        <input
          className="form-control"
          id={id}
          type={type}
          value={displayValue}
          onChange={(event) => onChange(name, event.target.value)}
          readOnly={readOnly}
          required={required}
          placeholder={placeholder || (readOnly && !displayValue ? UNAVAILABLE : "")}
        />
      )}
    </div>
  );
}

function FormGrid({ children }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
      gap: "0 1rem",
    }}
    >
      {children}
    </div>
  );
}

export default function NewParticipantView({ onCancel }) {
  const [tipo, setTipo] = useState("");
  const [identificacion, setIdentificacion] = useState("");
  const [busqueda, setBusqueda] = useState({ status: "idle", participante: null, mensaje: "" });
  const [form, setForm] = useState(EMPTY_FORM);
  const [actividad, setActividad] = useState(EMPTY_ACTIVIDAD);
  const [catalogos, setCatalogos] = useState(EMPTY_CATALOGOS);
  const [catalogoActividades, setCatalogoActividades] = useState([]);
  const [catalogosStatus, setCatalogosStatus] = useState("idle");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const [confirmarMultirole, setConfirmarMultirole] = useState(false);
  const [intentoBusqueda, setIntentoBusqueda] = useState(0);
  const [intentoCatalogos, setIntentoCatalogos] = useState(0);

  const puedeBuscar = Boolean(tipo && identificacion.trim().length >= 3);
  const encontrada = busqueda.status === "found";
  const duplicada = busqueda.status === "duplicate";
  const personaEncontrada = encontrada || duplicada;
  const soloDemostracion = Boolean(busqueda.participante?.soloDemostracion);
  const editable = busqueda.status === "not-found";
  const esperandoResultado = ["waiting", "loading"].includes(busqueda.status);
  const esEstudiante = tipo === "ESTUDIANTE";
  const filasLinea = filterCatalogo(catalogoActividades, { lineaAccion: actividad.lineaAccion });
  const filasComponente = filterCatalogo(filasLinea, { componente: actividad.componente });
  const filasPrograma = filterCatalogo(filasComponente, { programa: actividad.programa });
  const filasProyecto = filterCatalogo(filasPrograma, { proyecto: actividad.proyecto });
  const actividadesDisponibles = filasProyecto.filter((row) => (
    !actividad.actividadBusqueda
    || row.actividad.toLocaleLowerCase("es").includes(actividad.actividadBusqueda.toLocaleLowerCase("es"))
  ));
  const actividadSeleccionada = catalogoActividades
    .find((row) => row.id === actividad.idCatalogoActividad);
  const opcionesLinea = catalogOptions(catalogoActividades, "lineaAccion", "Sin línea en el Excel");
  const opcionesComponente = catalogOptions(filasLinea, "componente", "Sin componente en el Excel");
  const opcionesPrograma = catalogOptions(filasComponente, "programa", "Sin programa en el Excel");
  const opcionesProyecto = catalogOptions(filasPrograma, "proyecto", "Sin proyecto en el Excel");
  const tipoDocumentoSeleccionado = normalizarTipoDocumento(form.tipoDocumento);
  const opcionesTipoDocumento = !tipoDocumentoSeleccionado
    || TIPOS_DOCUMENTO.some((item) => item.value === tipoDocumentoSeleccionado)
    ? TIPOS_DOCUMENTO
    : [
      ...TIPOS_DOCUMENTO,
      { value: tipoDocumentoSeleccionado, label: `${form.tipoDocumento} (registrado previamente)` },
    ];

  useEffect(() => {
    if (!puedeBuscar) {
      setBusqueda({ status: "idle", participante: null, mensaje: "" });
      return undefined;
    }

    const controller = new AbortController();
    setBusqueda({ status: "waiting", participante: null, mensaje: "" });
    const timeoutId = setTimeout(async () => {
      setBusqueda({ status: "loading", participante: null, mensaje: "" });
      try {
        const result = await buscarParticipante({
          tipo,
          identificacion: identificacion.trim(),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (result.encontrado) {
          const participante = result.participante;
          setForm({
            ...EMPTY_FORM,
            ...participante,
            celular: participante.contacto || "",
            contacto: participante.contacto || "",
            fechaNacimiento: participante.fechaNacimiento
              ? String(participante.fechaNacimiento).slice(0, 10)
              : "",
            fechaEgreso: participante.fechaEgreso ? String(participante.fechaEgreso).slice(0, 10) : "",
          });
          setBusqueda({
            status: participante.yaRegistrado ? "duplicate" : "found",
            participante,
            mensaje: participante.yaRegistrado
              ? `Persona encontrada y asociada al rol ${participante.tipoRegistrado || tipo}. Puedes registrarla en otra actividad con este rol.`
              : participante.soloDemostracion
                ? "Encontrado en datos de prueba del proyecto; no está en la base académica."
                : "Persona encontrada en la fuente disponible. Sus datos existentes se precargaron.",
          });
        } else {
          setForm({ ...EMPTY_FORM, identificacion: identificacion.trim() });
          setBusqueda({
            status: "not-found",
            participante: null,
            mensaje: "Esta persona no se encuentra registrada. Ingresa los datos personales disponibles y continúa con la actividad.",
          });
        }
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setBusqueda({
          status: "error",
          participante: null,
          mensaje: requestError.message || "Error al consultar la persona.",
        });
      }
    }, 400);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [tipo, identificacion, puedeBuscar, intentoBusqueda]);

  useEffect(() => {
    if (!tipo) {
      setCatalogosStatus("idle");
      return undefined;
    }

    let activa = true;
    setCatalogosStatus("loading");
    Promise.all([getCatalogosEstudiante(), getCatalogoMaestroActividades()])
      .then(([data, masterCatalog]) => {
        if (!activa) return;
        const available = { ...EMPTY_CATALOGOS, ...data };
        setCatalogos(available);
        setCatalogoActividades(masterCatalog);
        setActividad((current) => ({
          ...current,
          idPeriodo: current.idPeriodo
            || available.periodos.find((periodo) => periodo.activo)?.id
            || "",
        }));
        setCatalogosStatus("loaded");
      })
      .catch((requestError) => {
        if (!activa) return;
        setCatalogosStatus("error");
        setError(requestError.message || "No se pudieron cargar los catálogos para el registro.");
      });
    return () => { activa = false; };
  }, [tipo, intentoCatalogos]);

  function actualizarCampo(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function actualizarActividad(name, value) {
    setActividad((current) => ({ ...current, [name]: value }));
  }

  function actualizarFiltroCatalogo(name, value) {
    setActividad((current) => {
      const next = { ...current, [name]: value, idCatalogoActividad: "" };
      if (name === "lineaAccion") {
        return autoCompletarRamasUnicas(
          { ...next, componente: "", programa: "", proyecto: "", actividadBusqueda: "" },
          catalogoActividades,
          0
        );
      }
      if (name === "componente") {
        return autoCompletarRamasUnicas(
          { ...next, programa: "", proyecto: "", actividadBusqueda: "" },
          catalogoActividades,
          1
        );
      }
      if (name === "programa") {
        return autoCompletarRamasUnicas(
          { ...next, proyecto: "", actividadBusqueda: "" },
          catalogoActividades,
          2
        );
      }
      if (name === "proyecto") {
        return { ...next, actividadBusqueda: "" };
      }
      return next;
    });
  }

  function reiniciarTipo(value) {
    setTipo(value);
    setBusqueda({ status: "idle", participante: null, mensaje: "" });
    setIdentificacion("");
    setForm(EMPTY_FORM);
    setActividad(EMPTY_ACTIVIDAD);
    setConfirmarMultirole(false);
    setError("");
    setConfirmacion("");
  }

  async function handleContinuar(event) {
    event.preventDefault();
    setError("");
    setConfirmacion("");

    if (!tipo) {
      setError("Selecciona el tipo de participante.");
      return;
    }
    if (identificacion.trim().length < 3) {
      setError("Ingresa una identificación válida.");
      return;
    }
    if (busqueda.status === "error") {
      setError("No se pudo consultar la identificación. Intenta nuevamente antes de continuar.");
      return;
    }
    if (esperandoResultado || busqueda.status === "idle") {
      setError("Espera a que termine la búsqueda por identificación.");
      return;
    }
    if (soloDemostracion) {
      setError("Este registro pertenece a datos de prueba del proyecto y no se puede guardar como real.");
      return;
    }
    if (!form.nombres?.trim() || !form.apellidos?.trim()) {
      setError("Completa nombres y apellidos.");
      return;
    }
    if (!tipoDocumentoSeleccionado) {
      setError("Selecciona el tipo de documento de identificación.");
      return;
    }
    if (!actividad.idCatalogoActividad) {
      setError("Selecciona una actividad del catálogo institucional.");
      return;
    }

    const participante = {
      ...form,
      tipo,
      identificacion: form.identificacion || identificacion.trim(),
      celular: form.celular || form.contacto || null,
      semestre: form.semestre === "" ? null : Number(form.semestre),
      correo: form.correo || null,
      fechaNacimiento: form.fechaNacimiento || null,
      fechaEgreso: form.fechaEgreso || null,
    };

    if (catalogosStatus !== "loaded") {
      setError("Espera a que terminen de cargar los catálogos de actividad.");
      return;
    }
    if ((busqueda.participante?.roles?.length || 0) > 1 && !confirmarMultirole) {
      setConfirmarMultirole(true);
      return;
    }

    await guardarRegistro(participante);
  }

  async function guardarRegistro(participante) {
    setGuardando(true);
    try {
      await registrarActividad({ participante, actividad });
      setConfirmarMultirole(false);
      setBusqueda((current) => ({
        ...current,
        status: "duplicate",
        participante: {
          ...current.participante,
          tipoRegistrado: tipo,
          yaRegistrado: true,
          roles: [...new Set([...(current.participante?.roles || []), tipo])],
        },
        mensaje: `Actividad guardada con el rol ${tipo}. Puedes vincular a esta persona a otra jornada.`,
      }));
      setConfirmacion(`Actividad guardada correctamente con el rol ${tipo}.`);
    } catch (requestError) {
      setError(requestError.message || "No se pudo guardar el registro.");
    } finally {
      setGuardando(false);
    }
  }

  const mostrarPerfil = ["found", "not-found", "duplicate"].includes(busqueda.status);
  const perfilSoloLectura = personaEncontrada || !editable;
  const datoAutocompletadoSoloLectura = (name) => perfilSoloLectura && Boolean(form[name]);
  const contactoActual = form.contacto || form.celular || form.telefono;

  return (
    <form onSubmit={handleContinuar} noValidate>
      <SectionCard title="Tipo de participante e identificación" icon="fa-id-card" defaultOpen>
        <div className="form-group">
          <label className="form-label" htmlFor="participant-type">Tipo de participante</label>
          <select
            className="form-select"
            id="participant-type"
            value={tipo}
            onChange={(event) => reiniciarTipo(event.target.value)}
            required
          >
            <option value="">Selecciona el tipo</option>
            {TIPOS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="participant-identification" style={{ fontSize: "0.95rem" }}>
            Cédula o código institucional
          </label>
          <input
            className="form-control"
            id="participant-identification"
            value={identificacion}
            onChange={(event) => {
              setIdentificacion(event.target.value);
              setBusqueda({
                status: event.target.value.trim().length >= 3 && tipo ? "waiting" : "idle",
                participante: null,
                mensaje: "",
              });
              setForm(EMPTY_FORM);
              setError("");
              setConfirmacion("");
            }}
            autoComplete="off"
            disabled={!tipo}
            maxLength={64}
            required
          />
          {esEstudiante && <p className="text-muted">La búsqueda se realiza automáticamente al dejar de escribir.</p>}
        </div>
        {["waiting", "loading"].includes(busqueda.status) && (
          <div className="autosave-banner vec-participant-status" role="status">
            <i className="fas fa-spinner fa-spin" aria-hidden="true"></i> Buscando...
          </div>
        )}
        {["found", "not-found", "duplicate", "error"].includes(busqueda.status) && (
          <div
            className={busqueda.status === "error"
              ? "auth-error vec-participant-status"
              : "autosave-banner vec-participant-status"}
            role={busqueda.status === "error" ? "alert" : "status"}
            style={personaEncontrada ? {
              background: "var(--risk-low-bg)",
              border: "1px solid var(--risk-low-border)",
              color: "var(--risk-low-text)",
            } : undefined}
          >
            <i
              className={`fas ${personaEncontrada ? "fa-check" : busqueda.status === "error" ? "fa-circle-xmark" : "fa-circle-info"} vec-participant-status-icon${personaEncontrada ? " vec-participant-status-icon-success" : ""}`}
              aria-hidden="true"
            />
            <span>{busqueda.mensaje}</span>
          </div>
        )}
        {(busqueda.participante?.roles?.length || 0) > 0 && (
          <div className="vec-participant-roles" aria-label="Roles institucionales detectados">
            <span>Roles detectados:</span>
            {busqueda.participante.roles.map((role) => (
              <span className={`vec-role-badge vec-role-${role.toLowerCase()}`} key={role}>
                {TIPOS.find((item) => item.value === role)?.label || role}
              </span>
            ))}
          </div>
        )}
        {busqueda.status === "error" && (
          <button
            className="btn btn-outline btn-sm"
            type="button"
            onClick={() => setIntentoBusqueda((current) => current + 1)}
          >
            <i className="fas fa-rotate" aria-hidden="true"></i> Reintentar búsqueda
          </button>
        )}
      </SectionCard>

      {mostrarPerfil && (
        <>
          <SectionCard title="Datos de identificación y básicos" icon="fa-address-card" defaultOpen>
            <FormGrid>
              <Field name="identificacion" label="Identificación" value={form.identificacion || identificacion} onChange={() => {}} readOnly />
              <Field
                name="tipoDocumento"
                label="Tipo de identificación"
                value={tipoDocumentoSeleccionado}
                onChange={actualizarCampo}
                options={opcionesTipoDocumento}
                placeholder="Selecciona el tipo de documento"
                required
              />
              <Field name="codigo" label="Código" value={form.codigo} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("codigo")} />
              <Field name="nombres" label="Nombres" value={form.nombres} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("nombres")} required />
              <Field name="apellidos" label="Apellidos" value={form.apellidos} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("apellidos")} required />
              <Field name="tipoUsuario" label="Tipo usuario (participante)" value={tipo} onChange={() => {}} readOnly />
            </FormGrid>
          </SectionCard>

          {(esEstudiante || tipo === "EGRESADO" || tipo === "COLABORADOR") && (
            <SectionCard title="Información académica del estudiante" icon="fa-graduation-cap">
              <FormGrid>
                {esEstudiante && (
                  <Field name="periodoFuente" label="Periodo académico (fuente)" value={form.periodo} onChange={() => {}} readOnly />
                )}
                <Field name="programaAcademico" label="Programa académico pregrado" value={form.programaAcademico} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("programaAcademico")} />
                {esEstudiante && (
                  <Field name="programaPosgradoDependencia" label="Programa académico posgrado" value={form.programaPosgradoDependencia} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("programaPosgradoDependencia")} />
                )}
                <Field name="semestre" label="Semestre" value={form.semestre} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("semestre")} />
                {esEstudiante && <Field name="jornada" label="Jornada" value={form.jornada} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("jornada")} />}
                {tipo === "COLABORADOR" && <Field name="dependencia" label="Dependencia" value={form.dependencia} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("dependencia")} />}
                {tipo === "COLABORADOR" && <Field name="cargo" label="Cargo" value={form.cargo} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("cargo")} />}
                {tipo === "EGRESADO" && <Field name="fechaEgreso" label="Fecha de egreso" value={form.fechaEgreso} onChange={actualizarCampo} type="date" readOnly={datoAutocompletadoSoloLectura("fechaEgreso")} />}
              </FormGrid>
            </SectionCard>
          )}

          <SectionCard title="Perfil sociodemográfico y bienestar" icon="fa-people-group">
            <FormGrid>
              <Field name="genero" label="Género" value={form.genero} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("genero")} />
              <Field name="fechaNacimiento" label="Fecha de nacimiento" value={form.fechaNacimiento} onChange={actualizarCampo} type="date" readOnly={datoAutocompletadoSoloLectura("fechaNacimiento")} />
              <Field name="edad" label="Edad" value={calculateAge(form.fechaNacimiento)} onChange={() => {}} readOnly />
              <Field name="etnia" label="Etnia" value={form.etnia} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("etnia")} />
              <Field name="municipio" label="Municipio" value={form.municipio} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("municipio")} />
              <Field name="conflictoArmado" label="Conflicto armado" value={form.conflictoArmado} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("conflictoArmado")} />
              <Field name="discapacidad" label="Discapacidad" value={form.discapacidad} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("discapacidad")} />
            </FormGrid>
          </SectionCard>

          <SectionCard title="Contacto" icon="fa-envelope">
            <FormGrid>
              <Field name="correo" label="Correo" value={form.correo} onChange={actualizarCampo} type="email" readOnly={datoAutocompletadoSoloLectura("correo")} />
              <Field name="contacto" label="Contacto" value={contactoActual} onChange={(name, value) => {
                setForm((current) => ({ ...current, contacto: value, celular: value }));
              }} readOnly={perfilSoloLectura && Boolean(contactoActual)} />
            </FormGrid>
          </SectionCard>

          {tipo && (
            <>
              <SectionCard title={`Actividad y participación como ${TIPOS.find((item) => item.value === tipo)?.label || tipo}`} icon="fa-calendar-check" defaultOpen>
              {catalogosStatus === "loading" && <p className="text-muted" role="status">Cargando catálogos...</p>}
              {catalogosStatus === "error" && (
                <div className="auth-error" role="alert">
                  No se pudieron cargar los catálogos.
                  <button
                    className="btn btn-outline btn-sm"
                    type="button"
                    onClick={() => setIntentoCatalogos((current) => current + 1)}
                    style={{ marginLeft: "0.75rem" }}
                  >
                    Reintentar
                  </button>
                </div>
              )}
              <FormGrid>
                <Field
                  name="idPeriodo"
                  label="Periodo"
                  value={actividad.idPeriodo}
                  onChange={actualizarActividad}
                  required
                  options={catalogos.periodos.map((periodo) => ({ value: periodo.id, label: periodo.nombre }))}
                />
                <Field
                  name="lineaAccion"
                  label="Área / línea de acción"
                  value={actividad.lineaAccion}
                  onChange={actualizarFiltroCatalogo}
                  required
                  options={opcionesLinea}
                />
                <Field
                  name="componente"
                  label="Componente"
                  value={actividad.componente}
                  onChange={actualizarFiltroCatalogo}
                  required={opcionesComponente.length > 1}
                  readOnly={!actividad.lineaAccion}
                  options={opcionesComponente}
                />
                <Field
                  name="programa"
                  label="Programa"
                  value={actividad.programa}
                  onChange={actualizarFiltroCatalogo}
                  required={opcionesPrograma.length > 1}
                  readOnly={!actividad.lineaAccion || (opcionesComponente.length > 1 && !actividad.componente)}
                  options={opcionesPrograma}
                />
                <Field
                  name="proyecto"
                  label="Proyecto"
                  value={actividad.proyecto}
                  onChange={actualizarFiltroCatalogo}
                  required={opcionesProyecto.length > 1}
                  readOnly={!actividad.programa}
                  options={opcionesProyecto}
                />
                <Field
                  name="actividadBusqueda"
                  label="Buscar actividad"
                  value={actividad.actividadBusqueda}
                  onChange={actualizarFiltroCatalogo}
                  type="search"
                  placeholder="Escribe para filtrar las actividades"
                  readOnly={!actividad.proyecto}
                />
                <Field
                  name="idCatalogoActividad"
                  label="Actividad"
                  value={actividad.idCatalogoActividad}
                  onChange={(_name, id) => {
                    const selected = catalogoActividades.find((item) => item.id === id);
                    if (!selected) {
                      actualizarActividad("idCatalogoActividad", "");
                      return;
                    }
                    setActividad((current) => ({
                      ...current,
                      idCatalogoActividad: id,
                      lineaAccion: selected.lineaAccion || NULL_CATALOG_VALUE,
                      componente: selected.componente || NULL_CATALOG_VALUE,
                      programa: selected.programa || NULL_CATALOG_VALUE,
                      proyecto: selected.proyecto || NULL_CATALOG_VALUE,
                    }));
                  }}
                  required
                  readOnly={!actividad.proyecto}
                  options={actividadesDisponibles.map((item) => ({
                    value: item.id,
                    label: item.actividad,
                  }))}
                  placeholder={actividad.proyecto ? "Selecciona una actividad" : "Selecciona primero su clasificación"}
                />
                {actividad.proyecto && actividadesDisponibles.length === 0 && (
                  <p className="text-muted" role="status">
                    No hay actividades para esa clasificación o búsqueda.
                  </p>
                )}
                <Field
                  name="tipoActividadCatalogada"
                  label="Tipo de actividad"
                  value={actividadSeleccionada?.tipoActividad || ""}
                  onChange={() => {}}
                  readOnly
                />
                <Field
                  name="proyectoCatalogado"
                  label="Proyecto seleccionado"
                  value={actividadSeleccionada?.proyecto || ""}
                  onChange={() => {}}
                  readOnly
                />
                <Field
                  name="programaCatalogado"
                  label="Programa seleccionado"
                  value={actividadSeleccionada?.programa || ""}
                  onChange={() => {}}
                  readOnly
                />
                <Field
                  name="alianzaInterinstitucional"
                  label="Alianzas interinstitucional"
                  value={actividad.alianzaInterinstitucional}
                  onChange={actualizarActividad}
                  options={[{ value: "true", label: "Sí" }, { value: "false", label: "No" }]}
                />
                <Field name="entidadAlianza" label="Entidad alianza" value={actividad.entidadAlianza} onChange={actualizarActividad} />
                <Field name="articulacionInstitucional" label="Articulación institucional" value={actividad.articulacionInstitucional} onChange={actualizarActividad} />
                <Field
                  name="idDependencia"
                  label="Dependencia"
                  value={actividad.idDependencia}
                  onChange={actualizarActividad}
                  options={catalogos.dependencias.map((dependencia) => ({ value: dependencia.id, label: dependencia.nombre }))}
                />
                <Field name="dependenciaOtra" label="Otra dependencia" value={actividad.dependenciaOtra} onChange={actualizarActividad} />
                <Field name="modalidad" label="Modalidad" value={actividad.modalidad} onChange={actualizarActividad} />
                <Field name="fechaInicio" label="Fecha inicio" value={actividad.fechaInicio} onChange={actualizarActividad} type="date" required />
                <Field name="fechaFinalizacion" label="Fecha finalización" value={actividad.fechaFinalizacion} onChange={actualizarActividad} type="date" required />
              </FormGrid>
              <Field
                name="descripcionCatalogada"
                label="Descripción actividad"
                value={actividadSeleccionada?.descripcion || ""}
                onChange={() => {}}
                type="textarea"
                readOnly
              />
              {actividadSeleccionada && (
                <p className="text-muted">
                  Fuente: {actividadSeleccionada.hojaOrigen}, fila {actividadSeleccionada.filaOrigen}.
                  {" "}Componente y línea corresponden a los valores originales de esa fila.
                </p>
              )}
              </SectionCard>

              <SectionCard title="Datos de bienestar" icon="fa-heart">
              <FormGrid>
                <Field
                  name="estrategiaPoliticaBienestar"
                  label="Estrategia política de bienestar"
                  value={actividad.estrategiaPoliticaBienestar}
                  onChange={actualizarActividad}
                  type="textarea"
                />
                <Field
                  name="estrategiaPoliticaPermanencia"
                  label="Estrategia política de permanencia y graduación"
                  value={actividad.estrategiaPoliticaPermanencia}
                  onChange={actualizarActividad}
                  type="textarea"
                />
                <Field
                  name="estrategiaPoliticaEducacionInclusiva"
                  label="Estrategia política de educación inclusiva"
                  value={actividad.estrategiaPoliticaEducacionInclusiva}
                  onChange={actualizarActividad}
                  type="textarea"
                />
                <Field
                  name="idTipoApoyo"
                  label="Tipo apoyo"
                  value={actividad.idTipoApoyo}
                  onChange={actualizarActividad}
                  options={catalogos.tiposApoyo.map((apoyo) => ({ value: apoyo.id, label: apoyo.nombre }))}
                />
              </FormGrid>
              </SectionCard>
            </>
          )}
        </>
      )}

      {error && <div className="auth-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</div>}
      {confirmacion && <div className="autosave-banner vec-participant-status" role="status">{confirmacion}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <button className="btn btn-outline" type="button" onClick={onCancel} disabled={guardando}>Cancelar</button>
        <button
          className="btn btn-primary"
          type="submit"
          disabled={guardando
            || soloDemostracion
            || !tipo
            || !identificacion.trim()
            || esperandoResultado
            || busqueda.status === "error"
            || !actividad.idCatalogoActividad
            || catalogosStatus !== "loaded"}
        >
          <i className={`fas ${guardando ? "fa-spinner fa-spin" : "fa-floppy-disk"}`} aria-hidden="true"></i>
          {guardando ? "Guardando registro..." : "Guardar actividad con este rol"}
        </button>
      </div>
      {confirmarMultirole && (
        <div className="vec-role-warning-overlay">
          <section
            className="vec-role-warning-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="vec-role-warning-title"
            aria-describedby="vec-role-warning-description"
          >
            <div className="vec-role-warning-icon" aria-hidden="true">
              <i className="fas fa-triangle-exclamation"></i>
            </div>
            <h2 id="vec-role-warning-title">Verifica los roles de esta persona</h2>
            <p id="vec-role-warning-description">
              Esta persona tiene varios roles institucionales:{" "}
              <strong>
                {busqueda.participante?.roles
                  ?.map((role) => TIPOS.find((item) => item.value === role)?.label || role)
                  .join(", ")}
              </strong>
              . Comprueba que el rol seleccionado y el tipo de apoyo sean correctos antes de continuar.
            </p>
            <dl className="vec-role-warning-details">
              <div>
                <dt>Rol para esta actividad</dt>
                <dd>{TIPOS.find((item) => item.value === tipo)?.label || tipo}</dd>
              </div>
              <div>
                <dt>Tipo de apoyo</dt>
                <dd>
                  {catalogos.tiposApoyo.find((item) => item.id === actividad.idTipoApoyo)?.nombre
                    || "No especificado"}
                </dd>
              </div>
            </dl>
            <div className="vec-role-warning-actions">
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setConfirmarMultirole(false)}
                disabled={guardando}
              >
                Volver a revisar
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => guardarRegistro({
                  ...form,
                  tipo,
                  identificacion: form.identificacion || identificacion.trim(),
                  celular: form.celular || form.contacto || null,
                  semestre: form.semestre === "" ? null : Number(form.semestre),
                  correo: form.correo || null,
                  fechaNacimiento: form.fechaNacimiento || null,
                  fechaEgreso: form.fechaEgreso || null,
                })}
                disabled={guardando}
              >
                {guardando ? "Guardando..." : "Confirmar y guardar"}
              </button>
            </div>
          </section>
        </div>
      )}
    </form>
  );
}
