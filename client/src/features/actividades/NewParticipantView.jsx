import { useEffect, useState } from "react";
import {
  buscarParticipante,
  getCatalogoMaestroActividades,
  getCatalogosEstudiante,
  getEventosProximos,
  registrarActividad,
} from "./participantesApi.js";
import BulkParticipantImport from "./BulkParticipantImport.jsx";

const TIPOS = [
  { value: "ESTUDIANTE", label: "Estudiante" },
];
const DETALLES_POR_TIPO = {
  ESTUDIANTE: [{ value: "Estudiante", label: "Estudiante" }],
};

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

const MODALIDADES = [
  { value: "Virtual", label: "Virtual" },
  { value: "Presencial", label: "Presencial" },
  { value: "Híbrida", label: "Híbrida" },
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
  detalleTipoParticipante: "",
  detalleTipoParticipanteOtro: "",
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
  idEventoExistente: "",
  idPeriodo: "",
  idCatalogoActividad: "",
  descripcion: "",
  tipoActividadOtra: "",
  lineaAccion: "",
  componente: "",
  programa: "",
  subdivisionPrograma: "",
  proyecto: "",
  actividadBusqueda: "",
  alianzaInterinstitucional: "",
  entidadAlianza: "",
  articulacionInstitucional: "",
  idDependencia: "",
  dependenciaOtra: "",
  modalidad: "",
  ubicacion: "",
  fechaInicio: "",
  fechaFinalizacion: "",
  idTipoApoyo: "",
  estrategiaPoliticaBienestar: "",
  estrategiaPoliticaPermanencia: "",
  estrategiaPoliticaEducacionInclusiva: "",
};

const EMPTY_COMPLEMENTOS = {
  tipoActividadOtra: "",
  alianzaInterinstitucional: "",
  entidadAlianza: "",
  articulacionInstitucional: "",
  idDependencia: "",
  dependenciaOtra: "",
  estrategiaPoliticaBienestar: "",
  estrategiaPoliticaPermanencia: "",
  estrategiaPoliticaEducacionInclusiva: "",
  idTipoApoyo: "",
};

const EMPTY_CATALOGOS = {
  periodos: [],
  dependencias: [],
  tiposApoyo: [],
  programasBienestar: [],
  generos: [],
  etnias: [],
  municipios: [],
};

const OPCIONES_GENERO = ["Mujer", "Hombre", "No binario", "Prefiere no responder", "Otro"];
const OPCIONES_ETNIA = ["Indígena", "Negra", "Afrocolombiana", "Raizal", "Palenquera", "Rrom", "Ninguna", "Prefiere no responder", "Otra"];

function opcionesConValorActual(base, valor) {
  const opciones = [...new Set([...(base || []), ...(valor ? [valor] : [])])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es"));
  return opciones.map((item) => typeof item === "string"
    ? { value: item, label: item }
    : item);
}

function autoCompletarRamasUnicas(next, catalogoActividades, startAt) {
  const hierarchy = [
    ["componente", "componente", "Sin componente en el Excel"],
    ["programa", "programaGeneral", "Sin programa en el Excel"],
    ["subdivisionPrograma", "subdivisionPrograma", "Sin subdivisión para este programa"],
    ["proyecto", "proyecto", "Sin proyecto en el Excel"],
  ];
  let matchingRows = filterCatalogo(catalogoActividades, { lineaAccion: next.lineaAccion });

  for (let index = 0; index < hierarchy.length; index += 1) {
    const [field, catalogField, emptyLabel] = hierarchy[index];
    if (index < startAt) {
      matchingRows = filterCatalogo(matchingRows, { [catalogField]: next[field] });
      continue;
    }
    const options = catalogOptions(matchingRows, catalogField, emptyLabel);
    if (field === "subdivisionPrograma"
      && !next[field]
      && matchingRows.some((row) => row.tieneSubdivisiones)) return next;
    if (!next[field] && options.length === 1 && options[0].value !== NULL_CATALOG_VALUE) {
      next[field] = options[0].value;
    }
    matchingRows = filterCatalogo(matchingRows, { [catalogField]: next[field] });
    if (field === "subdivisionPrograma" && !next[field] && options.length > 1) return next;
  }

  return next;
}

const UNAVAILABLE = "No aplica";
const NULL_CATALOG_VALUE = "__SIN_VALOR_EN_EXCEL__";
const OTRA_DEPENDENCIA_VALUE = "__OTRA_DEPENDENCIA__";

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

function clasificarProgramasCatalogo(rows) {
  const programas = new Map();
  rows.forEach((row) => {
    const nombre = String(row.programa || "").trim();
    if (!nombre) return;
    let general = nombre;
    let subdivision = "";
    const separador = nombre.indexOf(" - ");
    const agregadoFinal = nombre.match(/ \((participantes|grupos?)(?=[ )])([^()]*)\)$/i);
    if (separador > -1) {
      general = nombre.slice(0, separador).trim();
      subdivision = nombre.slice(separador + 3).trim();
    } else if (agregadoFinal) {
      general = nombre.slice(0, agregadoFinal.index).trim();
      subdivision = `${agregadoFinal[1]}${agregadoFinal[2]}`.trim();
    }
    programas.set(nombre, { nombre, general, subdivision });
  });

  const cantidadPorGeneral = new Map();
  programas.forEach(({ general }) => {
    const clave = general.toLocaleLowerCase("es");
    cantidadPorGeneral.set(clave, (cantidadPorGeneral.get(clave) || 0) + 1);
  });
  const clasificacionPorNombre = new Map();
  programas.forEach(({ nombre, general, subdivision }) => {
    const agrupado = cantidadPorGeneral.get(general.toLocaleLowerCase("es")) > 1;
    clasificacionPorNombre.set(nombre, {
      programaGeneral: agrupado ? general : nombre,
      subdivisionPrograma: agrupado ? nombre : "",
      tieneSubdivisiones: agrupado,
      etiquetaSubdivision: agrupado
        ? (nombre.toLocaleLowerCase("es") === general.toLocaleLowerCase("es")
          ? "Programa general (sin modalidad específica)"
          : subdivision || nombre.slice(general.length).trim())
        : "",
    });
  });
  return rows.map((row) => ({
    ...row,
    ...clasificacionPorNombre.get(String(row.programa || "").trim()),
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

function SectionCard({ title, icon, children }) {
  return (
    <section className="card">
      <h3 className="card-title">
        <i className={`fas ${icon}`} aria-hidden="true"></i>
        {title}
      </h3>
      {children}
    </section>
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
  maxLength,
}) {
  const id = `vec-${name}`;
  const displayValue = value == null ? "" : String(value);
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}{required && <span className="vec-required-indicator" aria-hidden="true"> *</span>}
      </label>
      {options ? (
        <select
          className="form-select"
          id={id}
          value={displayValue}
          onChange={(event) => onChange(name, event.target.value)}
          required={required}
          disabled={readOnly}
        >
          <option value="">{placeholder || (required ? "Selecciona una opción" : "No aplica")}</option>
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
          maxLength={maxLength}
          placeholder={placeholder || (!displayValue && (!required || readOnly) ? UNAVAILABLE : "")}
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
          maxLength={maxLength}
          placeholder={placeholder || (!displayValue && (!required || readOnly) ? UNAVAILABLE : "")}
        />
      )}
      {type === "date" && !required && !displayValue && (
        <span className="text-muted" style={{ display: "block", marginTop: "0.25rem" }}>No aplica si no corresponde.</span>
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
    }}>
      {children}
    </div>
  );
}

export default function NewParticipantView({ onCancel }) {
  const [modoRegistro, setModoRegistro] = useState("masivo");
  const [cargaMasivaPendiente, setCargaMasivaPendiente] = useState(false);
  const [tipo] = useState("ESTUDIANTE");
  const [identificacion, setIdentificacion] = useState("");
  const [busqueda, setBusqueda] = useState({ status: "idle", participante: null, mensaje: "" });
  const [form, setForm] = useState(EMPTY_FORM);
  const [actividad, setActividad] = useState(EMPTY_ACTIVIDAD);
  const [catalogos, setCatalogos] = useState(EMPTY_CATALOGOS);
  const [catalogoActividades, setCatalogoActividades] = useState([]);
  const [eventosProximos, setEventosProximos] = useState([]);
  const [catalogosStatus, setCatalogosStatus] = useState("idle");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const [confirmacionRolApoyo, setConfirmacionRolApoyo] = useState(false);
  const [intentoContinuar, setIntentoContinuar] = useState(false);
  const [intentoBusqueda, setIntentoBusqueda] = useState(0);
  const [intentoCatalogos, setIntentoCatalogos] = useState(0);

  const puedeBuscar = Boolean(tipo && identificacion.trim().length >= 3);
  const encontrada = busqueda.status === "found";
  const duplicada = busqueda.status === "duplicate";

  function confirmarSalidaCargaMasiva(action) {
    if (modoRegistro === "masivo" && cargaMasivaPendiente) {
      const confirmar = window.confirm(
        "Hay participantes cargados que todavía no se han registrado. Si sales de esta ventana, se perderá la carga. ¿Deseas continuar?",
      );
      if (!confirmar) return;
      setCargaMasivaPendiente(false);
    }
    action();
  }
  const personaEncontrada = encontrada || duplicada;
  const rolesRegistrados = busqueda.participante?.roles || [];
  const rolesVerificados = busqueda.participante?.rolesVerificados || [];
  const tieneRolesMultiples = rolesRegistrados.length > 1;
  const esRolNuevoParaPersona = personaEncontrada && !rolesRegistrados.includes(tipo);
  const esperandoResultado = ["waiting", "loading"].includes(busqueda.status);
  const esEstudiante = tipo === "ESTUDIANTE";
  const catalogoClasificado = clasificarProgramasCatalogo(catalogoActividades);
  const filasLinea = filterCatalogo(catalogoClasificado, { lineaAccion: actividad.lineaAccion });
  const filasComponente = filterCatalogo(filasLinea, { componente: actividad.componente });
  const filasPrograma = filterCatalogo(filasComponente, { programaGeneral: actividad.programa });
  const opcionesSubdivisionPrograma = [...new Map(filasPrograma
    .filter((row) => row.subdivisionPrograma)
    .map((row) => [row.subdivisionPrograma, {
      value: row.subdivisionPrograma,
      label: row.etiquetaSubdivision,
    }])).values()];
  const requiereSubdivisionPrograma = filasPrograma.some((row) => row.tieneSubdivisiones);
  const filasSubdivision = filterCatalogo(filasPrograma, {
    subdivisionPrograma: actividad.subdivisionPrograma,
  });
  const filasProyecto = filterCatalogo(filasSubdivision, { proyecto: actividad.proyecto });
  const actividadesDisponibles = filasProyecto.filter((row) => (
    !actividad.actividadBusqueda
    || row.actividad.toLocaleLowerCase("es").includes(actividad.actividadBusqueda.toLocaleLowerCase("es"))
  ));
  const actividadesSinProyecto = filasProyecto.filter((row) => (
    !row.proyecto?.trim()
    && (!actividad.actividadBusqueda
      || row.actividad.toLocaleLowerCase("es").includes(actividad.actividadBusqueda.toLocaleLowerCase("es")))
  ));
  const actividadSeleccionada = catalogoActividades
    .find((row) => row.id === actividad.idCatalogoActividad);
  const eventoSeleccionado = eventosProximos.find(
    (evento) => String(evento.id) === String(actividad.idEventoExistente),
  );
  const apoyoSugerido = catalogos.tiposApoyo.find((item) => (
    String(item.id) === String(actividadSeleccionada?.idTipoApoyoSugerido || "")
  ));
  const apoyosVinculadosEvento = [...new Map((eventoSeleccionado?.variablesModalidades || [])
    .filter((modalidad) => modalidad.idTipoApoyo)
    .map((modalidad) => {
      const apoyo = catalogos.tiposApoyo.find(
        (item) => String(item.id) === String(modalidad.idTipoApoyo),
      );
      return [String(modalidad.idTipoApoyo), {
        id: modalidad.idTipoApoyo,
        nombre: apoyo?.nombre || modalidad.tipoApoyo || "Apoyo asociado a la modalidad",
      }];
    })).values()];
  const opcionesApoyosActividad = apoyosVinculadosEvento.length
    ? apoyosVinculadosEvento
    : eventoSeleccionado?.variablesModalidades?.length
      ? []
      : actividadSeleccionada?.idTipoApoyoSugerido
      ? catalogos.tiposApoyo.filter(
        (item) => String(item.id) === String(actividadSeleccionada.idTipoApoyoSugerido),
      )
      : [];
  const tipoCatalogado = String(actividadSeleccionada?.tipoActividad || "").trim();
  const requiereEspecificarOtra = /\botr[oa]s?\b/i.test(tipoCatalogado);
  const dependenciaSeleccionada = catalogos.dependencias
    .find((dependencia) => dependencia.id === actividad.idDependencia);
  const dependenciaEsOtra = actividad.idDependencia === OTRA_DEPENDENCIA_VALUE
    || /\botr[oa]s?\b/i.test(String(dependenciaSeleccionada?.nombre || ""));
  const alianzaActiva = actividad.alianzaInterinstitucional === "true";
  const conservarDatosAlianza = Boolean(
    actividad.idEventoExistente && (actividad.entidadAlianza || actividad.articulacionInstitucional)
  );
  const mostrarDatosAlianza = alianzaActiva || conservarDatosAlianza;
  const mostrarOtraDependencia = dependenciaEsOtra
    || Boolean(actividad.idEventoExistente && actividad.dependenciaOtra);
  const mostrarEspecificacionOtra = requiereEspecificarOtra
    || Boolean(actividad.idEventoExistente && actividad.tipoActividadOtra);
  const programaBienestarActual = actividadSeleccionada?.programa || actividad.programa || "";
  const bienestarAplica = Boolean(programaBienestarActual.trim())
    && programaBienestarActual !== NULL_CATALOG_VALUE;
  const bienestarTieneInfoExistente = Boolean(
    actividad.idEventoExistente && (
      actividad.estrategiaPoliticaBienestar
      || actividad.estrategiaPoliticaPermanencia
      || actividad.estrategiaPoliticaEducacionInclusiva
    )
  );
  const opcionesLinea = catalogOptions(catalogoActividades, "lineaAccion", "Sin línea en el Excel");
  const opcionesComponente = catalogOptions(filasLinea, "componente", "Sin componente en el Excel");
  const opcionesPrograma = [...new Map(filasComponente
    .map((row) => row.programaGeneral || NULL_CATALOG_VALUE)
    .map((value) => [value, {
      value,
      label: value === NULL_CATALOG_VALUE ? "Sin programa en el Excel" : value,
    }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
  const subdivisionesOrdenadas = [...opcionesSubdivisionPrograma]
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
  const opcionesProyecto = catalogOptions(filasSubdivision, "proyecto", "Sin proyecto en el Excel");
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
          const esRolNuevo = !(participante.roles || []).includes(tipo);
          const datosParticipante = esRolNuevo ? {
            ...participante,
            codigo: "",
            programaAcademico: "",
            programaPosgradoDependencia: "",
            semestre: "",
            jornada: "",
            dependencia: "",
            cargo: "",
            fechaEgreso: "",
            detalleTipoParticipante: "",
          } : participante;
          const detalleColaborador = tipo === "COLABORADOR"
            ? String(datosParticipante.detalleTipoParticipante || "")
            : "";
          const detalleOtro = detalleColaborador.match(/^Otro:\s*(.*)$/i);
          setForm({
            ...EMPTY_FORM,
            ...datosParticipante,
            detalleTipoParticipante: detalleOtro ? "Otro" : datosParticipante.detalleTipoParticipante,
            detalleTipoParticipanteOtro: detalleOtro?.[1] || "",
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
              : esRolNuevo
                ? `Persona encontrada con otros roles. Se creará su perfil adicional como ${TIPOS.find((item) => item.value === tipo)?.label || tipo}.`
                : "Persona encontrada en los registros institucionales. Sus datos disponibles se precargaron.",
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
    Promise.all([getCatalogosEstudiante(), getCatalogoMaestroActividades(), getEventosProximos()])
      .then(([data, masterCatalog, upcomingEvents]) => {
        if (!activa) return;
        const available = { ...EMPTY_CATALOGOS, ...data };
        setCatalogos(available);
        setCatalogoActividades(masterCatalog);
        setEventosProximos(upcomingEvents);
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

  function seleccionarEvento(value) {
    if (value === "NUEVA") {
      setActividad((current) => ({
        ...EMPTY_ACTIVIDAD,
        idPeriodo: current.idPeriodo
          || catalogos.periodos.find((periodo) => periodo.activo)?.id
          || "",
      }));
      return;
    }
    const evento = eventosProximos.find((item) => String(item.id) === String(value));
    if (!evento) return;
    const catalogoEvento = catalogoActividades.find((item) => item.id === evento.idCatalogoActividad);
    const clasificacionEvento = catalogoClasificado.find((item) => item.id === evento.idCatalogoActividad);
    const modalidadesEvento = evento.variablesModalidades || [];
    const apoyosModalidades = [...new Set(
      modalidadesEvento.map((item) => String(item.idTipoApoyo || "")).filter(Boolean),
    )];
    const modalidadEvento = modalidadesEvento.length === 1
      ? modalidadesEvento[0]
      : apoyosModalidades.length === 1
        ? modalidadesEvento.find((item) => String(item.idTipoApoyo) === apoyosModalidades[0])
        : modalidadesEvento.find((item) => item.programaCompleto === clasificacionEvento?.programa);
    setActividad({
      ...EMPTY_ACTIVIDAD,
      idEventoExistente: evento.id,
      idPeriodo: evento.idPeriodo,
      idCatalogoActividad: evento.idCatalogoActividad,
      descripcion: evento.descripcion || "",
      tipoActividadOtra: evento.tipoActividadOtra || "",
      lineaAccion: evento.lineaAccion || NULL_CATALOG_VALUE,
      componente: evento.componente || NULL_CATALOG_VALUE,
      programa: clasificacionEvento?.programaGeneral
        || evento.programaBienestar
        || evento.programa
        || NULL_CATALOG_VALUE,
      subdivisionPrograma: modalidadEvento?.programaCompleto || "",
      proyecto: evento.proyecto || NULL_CATALOG_VALUE,
      actividadBusqueda: evento.actividad,
      alianzaInterinstitucional: evento.alianzaInterinstitucional == null
        ? ""
        : String(evento.alianzaInterinstitucional),
      entidadAlianza: evento.entidadAlianza || "",
      articulacionInstitucional: evento.articulacionInstitucional || "",
      idDependencia: evento.idDependencia || "",
      dependenciaOtra: evento.dependenciaOtra || "",
      modalidad: evento.modalidad || "",
      ubicacion: evento.ubicacion || "",
      fechaInicio: String(evento.fechaInicio).slice(0, 10),
      fechaFinalizacion: String(evento.fechaFinalizacion).slice(0, 10),
      idTipoApoyo: apoyosModalidades.length === 1
        ? apoyosModalidades[0]
        : modalidadEvento?.idTipoApoyo
          || (modalidadesEvento.length ? "" : catalogoEvento?.idTipoApoyoSugerido || ""),
      estrategiaPoliticaBienestar: evento.estrategiaPoliticaBienestar || catalogoEvento?.estrategiaPoliticaBienestar || "",
      estrategiaPoliticaPermanencia: evento.estrategiaPoliticaPermanencia || catalogoEvento?.estrategiaPoliticaPermanencia || "",
      estrategiaPoliticaEducacionInclusiva: evento.estrategiaPoliticaEducacionInclusiva || catalogoEvento?.estrategiaPoliticaEducacionInclusiva || "",
    });
  }

  function actualizarFiltroCatalogo(name, value) {
    setActividad((current) => {
      const next = { ...current, [name]: value, idCatalogoActividad: "" };
      if (name === "lineaAccion") {
        return autoCompletarRamasUnicas(
          { ...next, componente: "", programa: "", subdivisionPrograma: "", proyecto: "", actividadBusqueda: "" },
          catalogoClasificado,
          0
        );
      }
      if (name === "componente") {
        return autoCompletarRamasUnicas(
          { ...next, programa: "", subdivisionPrograma: "", proyecto: "", actividadBusqueda: "" },
          catalogoClasificado,
          1
        );
      }
      if (name === "programa") {
        return autoCompletarRamasUnicas(
          { ...next, subdivisionPrograma: "", proyecto: "", actividadBusqueda: "" },
          catalogoClasificado,
          2
        );
      }
      if (name === "subdivisionPrograma") {
        return autoCompletarRamasUnicas(
          { ...next, proyecto: "", actividadBusqueda: "" },
          catalogoClasificado,
          3
        );
      }
      if (name === "proyecto") {
        return { ...next, actividadBusqueda: "" };
      }
      return next;
    });
  }

  async function handleContinuar(event) {
    event.preventDefault();
    setIntentoContinuar(true);
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
    if (!form.nombres?.trim() || !form.apellidos?.trim()) {
      setError("Completa nombres y apellidos.");
      return;
    }
    if (!tipoDocumentoSeleccionado) {
      setError("Selecciona el tipo de documento de identificación.");
      return;
    }
    if (tipo !== "ESTUDIANTE" && !form.detalleTipoParticipante) {
      setError("Selecciona la clasificación del participante que corresponde al registro VEC.");
      return;
    }
    if (tipo === "COLABORADOR" && form.detalleTipoParticipante === "Otro" && !form.detalleTipoParticipanteOtro.trim()) {
      setError("Especifica el tipo de colaborador.");
      return;
    }
    if (!actividad.idCatalogoActividad) {
      setError("Selecciona una actividad del catálogo institucional.");
      return;
    }
    if (tieneRolesMultiples && actividad.idTipoApoyo && !confirmacionRolApoyo) {
      setError("Confirma el rol bajo el cual se registra el tipo de apoyo para esta persona.");
      return;
    }

    const participante = {
      ...form,
      tipo,
      detalleTipoParticipante: tipo === "ESTUDIANTE" ? "Estudiante"
        : tipo === "COLABORADOR" && form.detalleTipoParticipante === "Otro"
          ? `Otro: ${form.detalleTipoParticipanteOtro.trim()}`
          : form.detalleTipoParticipante,
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
    await guardarRegistro(participante, actividad);
  }

  async function guardarRegistro(participante, actividadParaGuardar) {
    setGuardando(true);
    try {
      await registrarActividad({ participante, actividad: actividadParaGuardar });
      let errorActualizacionEventos = "";
      try {
        setEventosProximos(await getEventosProximos());
      } catch (refreshError) {
        errorActualizacionEventos = refreshError.message || "No se pudo actualizar la lista de eventos.";
      }
      setBusqueda((current) => ({
        ...current,
        status: "duplicate",
        participante: {
          ...current.participante,
          tipoRegistrado: tipo,
          yaRegistrado: true,
          roles: [...new Set([...(current.participante?.roles || []), tipo])],
        },
        mensaje: actividad.idEventoExistente
          ? `Participante vinculado al evento con el rol ${tipo}.`
          : `Participante registrado y jornada programada con el rol ${tipo}.`,
      }));
      setConfirmacion(actividad.idEventoExistente
        ? "Participante vinculado correctamente al evento."
        : "Participante registrado y nueva jornada programada correctamente.");
      if (errorActualizacionEventos) {
        setError(`El registro se guardó, pero no se pudo actualizar la lista de eventos: ${errorActualizacionEventos}`);
      }
    } catch (requestError) {
      setError(requestError.message || "No se pudo guardar el registro.");
    } finally {
      setGuardando(false);
    }
  }

  const mostrarPerfil = ["found", "not-found", "duplicate"].includes(busqueda.status);
  const perfilSoloLectura = personaEncontrada && !esRolNuevoParaPersona;
  const datoAutocompletadoSoloLectura = (name) => perfilSoloLectura && Boolean(form[name]);
  const contactoActual = form.contacto || form.celular || form.telefono;

  return (
    <form
      className="vec-participant-form"
      data-attempted={intentoContinuar}
      onSubmit={(event) => {
        if (modoRegistro === "individual") handleContinuar(event);
        else event.preventDefault();
      }}
      noValidate
    >
      <header className="vec-registration-intro">
        <span className="vec-registration-intro__icon">
          <i className="fas fa-users" aria-hidden="true"></i>
        </span>
        <div>
          <span className="vec-registration-intro__eyebrow">GESTIÓN DE PARTICIPANTES</span>
          <h1>Registrar participantes</h1>
          <p>Agiliza el registro validando una lista de estudiantes desde Excel o agrega una persona manualmente.</p>
        </div>
      </header>

      <div className="vec-registration-mode" role="group" aria-label="Método de registro">
        <button
          className={`vec-registration-mode__option vec-registration-mode__option--bulk${modoRegistro === "masivo" ? " is-active" : ""}`}
          type="button"
          aria-pressed={modoRegistro === "masivo"}
          onClick={() => setModoRegistro("masivo")}
        >
          <i className="fas fa-file-excel" aria-hidden="true"></i>
          <span>
            <strong>Carga masiva desde Excel</strong>
            <small>Recomendado · Valida y registra varios estudiantes en un solo proceso</small>
          </span>
          <span className="vec-registration-mode__badge">MÁS RÁPIDO</span>
        </button>
        <button
          className={`vec-registration-mode__option${modoRegistro === "individual" ? " is-active" : ""}`}
          type="button"
          aria-pressed={modoRegistro === "individual"}
          onClick={() => confirmarSalidaCargaMasiva(() => setModoRegistro("individual"))}
        >
          <i className="fas fa-user" aria-hidden="true"></i>
          <span><strong>Registro individual</strong><small>Registrar una persona a la vez</small></span>
        </button>
      </div>

      {modoRegistro === "masivo" ? <BulkParticipantImport onPendingChange={setCargaMasivaPendiente} /> : <>
      <SectionCard title="Tipo de participante e identificación" icon="fa-id-card" defaultOpen>
        <div className="form-group">
          <span className="form-label">Tipo de participante</span>
          <strong>Estudiante</strong>
          <p className="text-muted">
            Este módulo registra estudiantes únicamente. La búsqueda consulta el registro académico; no cambia roles ni crea cuentas de usuario.
          </p>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="participant-identification" style={{ fontSize: "0.95rem" }}>
            Cédula o código institucional <span className="vec-required-indicator" aria-hidden="true">*</span>
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
              setConfirmacionRolApoyo(false);
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
            <span>Roles en Actividades:</span>
            {busqueda.participante.roles.map((role) => (
              <span className={`vec-role-badge vec-role-${role.toLowerCase()}`} key={role}>
                {TIPOS.find((item) => item.value === role)?.label || role}
              </span>
            ))}
          </div>
        )}
        {(busqueda.participante?.rolesVerificados?.length || 0) > 0 && (
          <div className="vec-participant-roles" aria-label="Roles institucionales verificados">
            <span>Roles institucionales verificados:</span>
            {busqueda.participante.rolesVerificados.map((role) => (
              <span className={`vec-role-badge vec-role-${role.toLowerCase()}`} key={role}>
                {TIPOS.find((item) => item.value === role)?.label || role}
              </span>
            ))}
          </div>
        )}
        {mostrarPerfil && ["ESTUDIANTE", "COLABORADOR"].includes(tipo)
          && !rolesVerificados.includes(tipo) && (
          <div className="text-muted vec-participant-status" role="status">
            Se guardará una ficha de estudiante en Actividades. No se creará ni modificará ningún usuario o rol institucional.
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
          <SectionCard
            title="Datos básicos"
            icon="fa-address-card"
            defaultOpen
            description="Los datos encontrados en la fuente institucional se completan automáticamente."
          >
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
            </FormGrid>
          </SectionCard>

          <SectionCard
            title="Información académica e institucional"
            icon="fa-graduation-cap"
            summary={form.programaAcademico || form.dependencia || "Opcional"}
          >
            <FormGrid>
              <Field
                name="detalleTipoParticipante"
                label="Clasificación en el registro VEC"
                value={form.detalleTipoParticipante || (tipo === "ESTUDIANTE" ? "Estudiante" : "")}
                onChange={actualizarCampo}
                required
                readOnly={tipo === "ESTUDIANTE" || datoAutocompletadoSoloLectura("detalleTipoParticipante")}
                options={DETALLES_POR_TIPO[tipo] || []}
              />
              {tipo === "COLABORADOR" && form.detalleTipoParticipante === "Otro" && (
                <Field
                  name="detalleTipoParticipanteOtro"
                  label="Especifica el tipo de colaborador"
                  value={form.detalleTipoParticipanteOtro}
                  onChange={actualizarCampo}
                  placeholder="Ej.: contratista, practicante, auxiliar"
                  required
                  maxLength={114}
                  readOnly={datoAutocompletadoSoloLectura("detalleTipoParticipanteOtro")}
                />
              )}
              {esEstudiante && (
                <Field name="periodoFuente" label="Periodo académico (fuente)" value={form.periodo} onChange={() => {}} readOnly />
              )}
              <Field name="programaAcademico" label="Programa académico pregrado" value={form.programaAcademico} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("programaAcademico")} />
              <Field name="programaPosgradoDependencia" label="Programa académico posgrado / dependencia" value={form.programaPosgradoDependencia} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("programaPosgradoDependencia")} />
              <Field name="semestre" label="Semestre" value={form.semestre} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("semestre")} />
              <Field name="jornada" label="Jornada" value={form.jornada} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("jornada")} />
              <Field name="dependencia" label="Dependencia de la persona" value={form.dependencia} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("dependencia")} />
              <Field name="cargo" label="Cargo" value={form.cargo} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("cargo")} />
              <Field name="fechaEgreso" label="Fecha de egreso" value={form.fechaEgreso} onChange={actualizarCampo} type="date" readOnly={datoAutocompletadoSoloLectura("fechaEgreso")} />
            </FormGrid>
          </SectionCard>

          <SectionCard title="Perfil sociodemográfico" icon="fa-people-group" summary="Opcional">
            <FormGrid>
              <Field name="genero" label="Género" value={form.genero} onChange={actualizarCampo} options={opcionesConValorActual([...OPCIONES_GENERO, ...catalogos.generos], form.genero)} readOnly={datoAutocompletadoSoloLectura("genero")} />
              <Field name="fechaNacimiento" label="Fecha de nacimiento" value={form.fechaNacimiento} onChange={actualizarCampo} type="date" readOnly={datoAutocompletadoSoloLectura("fechaNacimiento")} />
              {form.fechaNacimiento && <Field name="edad" label="Edad" value={calculateAge(form.fechaNacimiento)} onChange={() => {}} readOnly />}
              <Field name="etnia" label="Etnia" value={form.etnia} onChange={actualizarCampo} options={opcionesConValorActual([...OPCIONES_ETNIA, ...catalogos.etnias], form.etnia)} readOnly={datoAutocompletadoSoloLectura("etnia")} />
              <Field name="municipio" label="Municipio" value={form.municipio} onChange={actualizarCampo} options={opcionesConValorActual(catalogos.municipios, form.municipio)} readOnly={datoAutocompletadoSoloLectura("municipio")} />
              <Field name="conflictoArmado" label="Conflicto armado" value={form.conflictoArmado} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("conflictoArmado")} />
              <Field name="discapacidad" label="Discapacidad" value={form.discapacidad} onChange={actualizarCampo} readOnly={datoAutocompletadoSoloLectura("discapacidad")} />
            </FormGrid>
          </SectionCard>

          <SectionCard title="Contacto" icon="fa-envelope" summary={contactoActual || form.correo || "Opcional"}>
            <FormGrid>
              <Field name="correo" label="Correo" value={form.correo} onChange={actualizarCampo} type="email" readOnly={datoAutocompletadoSoloLectura("correo")} />
              <Field name="contacto" label="Contacto" value={contactoActual} onChange={(name, value) => {
                setForm((current) => ({ ...current, contacto: value, celular: value }));
              }} readOnly={perfilSoloLectura && Boolean(contactoActual)} />
            </FormGrid>
          </SectionCard>

          {tipo && (
            <>
              <SectionCard
                title={`Actividad · ${TIPOS.find((item) => item.value === tipo)?.label || tipo}`}
                icon="fa-calendar-check"
                defaultOpen
                description="Al elegir una jornada existente, sus fechas, clasificación, modalidad, apoyos y datos complementarios se completan desde Actividades. También puedes programar una nueva jornada."
              >
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
                {tieneRolesMultiples && (
                  <div className="vec-role-warning-details" role="status" style={{ margin: "0 0 1rem" }}>
                    <strong>Esta persona tiene varios roles registrados en Actividades.</strong>
                    <div className="vec-participant-roles" aria-label="Roles registrados para el apoyo">
                      {rolesRegistrados.map((role) => (
                        <span className={`vec-role-badge vec-role-${role.toLowerCase()}`} key={role}>
                          {TIPOS.find((item) => item.value === role)?.label || role}
                        </span>
                      ))}
                    </div>
                    <p style={{ marginBottom: 0 }}>
                      Este registro de actividad y el tipo de apoyo seleccionado quedarán asociados al rol
                      {" "}<strong>{TIPOS.find((item) => item.value === tipo)?.label || tipo}</strong>.
                      Verifica que ese sea el rol con el que recibe el apoyo.
                    </p>
                  </div>
                )}
                <SectionCard
                  title="Información básica de la jornada"
                  icon="fa-calendar-days"
                  defaultOpen
                  summary={actividad.idEventoExistente ? "Evento existente" : "Nueva jornada"}
                >
                  <FormGrid>
                    <Field
                      name="eventoDisponible"
                      label="Actividad creada"
                      value={actividad.idEventoExistente || "NUEVA"}
                      onChange={(_name, value) => seleccionarEvento(value)}
                      options={[
                        { value: "NUEVA", label: "Programar una nueva jornada del catálogo" },
                        ...eventosProximos.filter((evento) => evento.estado !== "CANCELADA").map((evento) => ({
                          value: evento.id,
                          label: `${evento.actividad} · ${evento.periodo} · ${String(evento.fechaInicio).slice(0, 10)} · ${evento.totalParticipantes} inscritos`,
                        })),
                      ]}
                    />
                    <Field
                      name="idPeriodo"
                      label="Periodo"
                      value={actividad.idPeriodo}
                      onChange={actualizarActividad}
                      required
                      readOnly={Boolean(actividad.idEventoExistente)}
                      options={catalogos.periodos.map((periodo) => ({ value: periodo.id, label: periodo.nombre }))}
                    />
                    <Field name="fechaInicio" label="Fecha de inicio" value={actividad.fechaInicio} onChange={actualizarActividad} type="date" required readOnly={Boolean(actividad.idEventoExistente)} />
                    <Field name="fechaFinalizacion" label="Fecha de finalización" value={actividad.fechaFinalizacion} onChange={actualizarActividad} type="date" required readOnly={Boolean(actividad.idEventoExistente)} />
                    <Field
                      name="modalidad"
                      label="Modalidad"
                      value={actividad.modalidad}
                      onChange={actualizarActividad}
                      readOnly={Boolean(actividad.idEventoExistente)}
                      required={!actividad.idEventoExistente}
                      options={MODALIDADES}
                    />
                    <Field name="ubicacion" label="Ubicación" value={actividad.ubicacion} onChange={actualizarActividad} readOnly={Boolean(actividad.idEventoExistente)} />
                    <Field name="descripcion" label="Descripción de la jornada" value={actividad.descripcion || actividadSeleccionada?.descripcion || ""} onChange={actualizarActividad} type="textarea" readOnly={Boolean(actividad.idEventoExistente)} />
                  </FormGrid>
                  {eventosProximos.every((evento) => evento.estado === "CANCELADA") && (
                    <p className="text-muted" role="status">
                      No hay actividades creadas disponibles. Puedes programar una desde el catálogo institucional.
                    </p>
                  )}
                  {actividad.idEventoExistente && (
                    <p className="text-muted" role="status">
                      Los campos de esta jornada se cargaron desde Actividades y se conservan sin cambios al vincular al participante.
                    </p>
                  )}
                </SectionCard>

                <SectionCard
                  title="Clasificación de la actividad"
                  icon="fa-list-check"
                  defaultOpen
                >
                  {actividad.idEventoExistente ? (
                    <div className="vec-activity-event-summary">
                      {[
                        ["Área / línea de acción", eventoSeleccionado?.lineaAccion],
                        ["Componente", eventoSeleccionado?.componente],
                        ["Programa", eventoSeleccionado?.programaBienestar || eventoSeleccionado?.programa],
                        ["Proyecto", eventoSeleccionado?.proyecto],
                        ["Tipo de actividad", eventoSeleccionado?.tipoActividad],
                        ["Actividad", eventoSeleccionado?.actividad],
                      ].filter(([, value]) => value).map(([label, value]) => (
                        <div className="vec-activity-event-summary__item" key={label}>
                          <strong>{label}</strong>
                          <span>{value}</span>
                        </div>
                      ))}
                      {eventoSeleccionado?.variablesModalidades?.length > 0 && (
                        <div className="vec-activity-event-summary__item vec-activity-event-summary__item--wide">
                          <strong>Variables / modalidades</strong>
                          <span>{eventoSeleccionado.variablesModalidades
                            .map((item) => item.programaCompleto)
                            .filter(Boolean)
                            .join(", ")}</span>
                        </div>
                      )}
                      {eventoSeleccionado?.descripcion && (
                        <div className="vec-activity-event-summary__item vec-activity-event-summary__item--wide">
                          <strong>Descripción</strong>
                          <span>{eventoSeleccionado.descripcion}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                  <>
                  <FormGrid>
                <Field
                  name="lineaAccion"
                  label="Área / línea de acción"
                  value={actividad.lineaAccion}
                  onChange={actualizarFiltroCatalogo}
                  required
                  readOnly={Boolean(actividad.idEventoExistente)}
                  options={opcionesLinea}
                />
                {actividad.lineaAccion && <Field
                  name="componente"
                  label="Componente"
                  value={actividad.componente}
                  onChange={actualizarFiltroCatalogo}
                  required={opcionesComponente.length > 1}
                  readOnly={Boolean(actividad.idEventoExistente) || !actividad.lineaAccion}
                  options={opcionesComponente}
                />}
                {actividad.componente && (
                <Field
                  name="programa"
                  label="Programa general"
                  value={actividad.programa}
                  onChange={actualizarFiltroCatalogo}
                  required={opcionesPrograma.length > 1}
                  readOnly={Boolean(actividad.idEventoExistente)
                    || !actividad.lineaAccion
                    || (opcionesComponente.length > 1 && !actividad.componente)}
                  options={opcionesPrograma}
                />
                )}
                {actividad.programa && requiereSubdivisionPrograma && (
                <Field
                  name="subdivisionPrograma"
                  label="Variables / Modalidades"
                  value={actividad.subdivisionPrograma}
                  onChange={actualizarFiltroCatalogo}
                  required
                  readOnly={Boolean(actividad.idEventoExistente)}
                  options={subdivisionesOrdenadas}
                  placeholder="Selecciona una subdivisión"
                />
                )}
                {actividad.programa && (!requiereSubdivisionPrograma || actividad.subdivisionPrograma) && (
                <Field
                  name="proyecto"
                  label="Proyecto"
                  value={actividad.proyecto}
                  onChange={actualizarFiltroCatalogo}
                  required={opcionesProyecto.length > 1}
                  readOnly={Boolean(actividad.idEventoExistente) || !actividad.programa}
                  options={opcionesProyecto}
                />
                )}
                  {actividad.proyecto && <>
                  <Field
                  name="actividadBusqueda"
                  label="Buscar actividad"
                  value={actividad.actividadBusqueda}
                  onChange={actualizarFiltroCatalogo}
                  type="search"
                  placeholder="Escribe para filtrar las actividades"
                  readOnly={Boolean(actividad.idEventoExistente) || !actividad.proyecto}
                />
                <Field
                  name="idCatalogoActividad"
                  label="Actividad"
                  value={actividad.idCatalogoActividad}
                  onChange={(_name, id) => {
                    const selected = catalogoActividades.find((item) => item.id === id);
                    const clasificacionSeleccionada = catalogoClasificado.find((item) => item.id === id);
                    if (!selected) {
                      setActividad((current) => ({
                        ...current,
                        idCatalogoActividad: "",
                      }));
                      return;
                    }
                    setActividad((current) => ({
                      ...current,
                      idCatalogoActividad: id,
                      descripcion: selected.descripcion || "",
                      lineaAccion: selected.lineaAccion || NULL_CATALOG_VALUE,
                      componente: selected.componente || NULL_CATALOG_VALUE,
                      programa: clasificacionSeleccionada?.programaGeneral || selected.programa || NULL_CATALOG_VALUE,
                      subdivisionPrograma: clasificacionSeleccionada?.subdivisionPrograma || "",
                      proyecto: selected.proyecto || NULL_CATALOG_VALUE,
                      idTipoApoyo: selected.idTipoApoyoSugerido || "",
                      estrategiaPoliticaBienestar: selected.estrategiaPoliticaBienestar || "",
                      estrategiaPoliticaPermanencia: selected.estrategiaPoliticaPermanencia || "",
                      estrategiaPoliticaEducacionInclusiva: selected.estrategiaPoliticaEducacionInclusiva || "",
                    }));
                  }}
                  required
                  readOnly={Boolean(actividad.idEventoExistente) || !actividad.proyecto}
                  options={actividadesDisponibles.map((item) => ({
                    value: item.id,
                    label: item.actividad,
                  }))}
                  placeholder={actividad.proyecto ? "Selecciona una actividad" : "Selecciona primero su clasificación"}
                />
                  </>}
                  </FormGrid>
                  {actividad.proyecto === NULL_CATALOG_VALUE && actividadesSinProyecto.length > 0 && (
                    <p className="text-muted" role="status">
                      Esta clasificación tiene actividades sin proyecto en el catálogo. Esos registros no se pueden programar hasta completar ese dato.
                    </p>
                  )}
                  {actividad.proyecto && actividadesDisponibles.length === 0 && actividadesSinProyecto.length === 0 && (
                    <p className="text-muted" role="status">No hay actividades para esa clasificación o búsqueda.</p>
                  )}
                  {actividadSeleccionada && (
                    <div className="vec-activity-catalog-summary">
                      <span><strong>Tipo:</strong> {tipoCatalogado || "No especificado en el catálogo"}</span>
                      <span><strong>Programa:</strong> {actividadSeleccionada.programa || "No aplica"}</span>
                      <span><strong>Proyecto:</strong> {actividadSeleccionada.proyecto || "No aplica"}</span>
                      {actividadSeleccionada.descripcion && (
                        <p><strong>Descripción:</strong> {actividadSeleccionada.descripcion}</p>
                      )}
                      <small>Fuente: {actividadSeleccionada.hojaOrigen}, fila {actividadSeleccionada.filaOrigen}.</small>
                    </div>
                  )}
                  </>
                  )}
                </SectionCard>

                <SectionCard
                  title="Información complementaria"
                  icon="fa-sliders"
                summary={mostrarEspecificacionOtra ? "Especifica el tipo “Otro”" : "Opcional"}
                  description="Completa estos datos solo cuando apliquen a la jornada. Los campos vacíos se guardan como nulos."
                >
                  <FormGrid>
                    {mostrarEspecificacionOtra && (
                      <Field
                        name="tipoActividadOtra"
                        label={'Especifica el tipo de actividad "Otro"'}
                        value={actividad.tipoActividadOtra}
                        onChange={actualizarActividad}
                        readOnly={Boolean(actividad.idEventoExistente)}
                      />
                    )}
                    <Field
                      name="alianzaInterinstitucional"
                      label="¿La jornada tiene alianza institucional?"
                      value={actividad.alianzaInterinstitucional}
                      onChange={(_name, value) => setActividad((current) => ({
                        ...current,
                        alianzaInterinstitucional: value,
                        ...(current.idEventoExistente ? {} : { entidadAlianza: "", articulacionInstitucional: "" }),
                      }))}
                      readOnly={Boolean(actividad.idEventoExistente)}
                      placeholder="No aplica"
                      options={[{ value: "true", label: "Sí" }, { value: "false", label: "No" }]}
                    />
                    {mostrarDatosAlianza && (
                      <>
                        <Field name="entidadAlianza" label="Entidad de la alianza" value={actividad.entidadAlianza} onChange={actualizarActividad} readOnly={Boolean(actividad.idEventoExistente)} />
                        <Field name="articulacionInstitucional" label="Articulación institucional" value={actividad.articulacionInstitucional} onChange={actualizarActividad} readOnly={Boolean(actividad.idEventoExistente)} />
                      </>
                    )}
                    <Field
                      name="idDependencia"
                      label="Dependencia responsable"
                      value={actividad.idDependencia}
                      onChange={(_name, value) => setActividad((current) => ({
                        ...current,
                        idDependencia: value,
                        ...(current.idEventoExistente ? {} : { dependenciaOtra: "" }),
                      }))}
                      readOnly={Boolean(actividad.idEventoExistente)}
                      placeholder="No aplica"
                      options={[
                        ...catalogos.dependencias.map((dependencia) => ({ value: dependencia.id, label: dependencia.nombre })),
                        { value: OTRA_DEPENDENCIA_VALUE, label: "Otra dependencia (especificar)" },
                      ]}
                    />
                    {mostrarOtraDependencia && (
                      <Field name="dependenciaOtra" label="Especifica la otra dependencia" value={actividad.dependenciaOtra} onChange={actualizarActividad} readOnly={Boolean(actividad.idEventoExistente)} />
                    )}
                    <Field
                      name="idTipoApoyo"
                      label="Tipo de apoyo asociado"
                      value={actividad.idTipoApoyo}
                      onChange={(name, value) => {
                        if (eventoSeleccionado && apoyosVinculadosEvento.length) {
                          const modalidadVinculada = eventoSeleccionado.variablesModalidades.find(
                            (modalidad) => String(modalidad.idTipoApoyo) === String(value),
                          );
                          setActividad((current) => ({
                            ...current,
                            [name]: value,
                            subdivisionPrograma: modalidadVinculada?.programaCompleto || "",
                          }));
                        } else {
                          actualizarActividad(name, value);
                        }
                        setConfirmacionRolApoyo(false);
                      }}
                      placeholder="No aplica"
                      options={opcionesApoyosActividad.map((apoyo) => ({ value: apoyo.id, label: apoyo.nombre }))}
                    />
                    <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                      {eventoSeleccionado?.variablesModalidades?.length > 0
                        && apoyosVinculadosEvento.length === 0 && (
                          <p className="text-danger" role="alert">
                            Esta jornada no tiene tipos de apoyo activos asociados a sus variables o modalidades. No es posible registrar el participante hasta corregir esa asociación.
                          </p>
                        )}
                      {actividadSeleccionada
                        && !eventoSeleccionado?.variablesModalidades?.length
                        && opcionesApoyosActividad.length === 0
                        && catalogosStatus === "loaded" && (
                          <p className="text-muted" role="status">
                            Esta actividad no tiene tipos de apoyo activos asociados en el catálogo. No se mostrarán apoyos de otras actividades.
                          </p>
                      )}
                      {actividadSeleccionada?.tipoApoyoExcel && (
                        <p className="text-muted" role="status">
                          Apoyo según «Sis bienestar»: <strong>{actividadSeleccionada.tipoApoyoExcel}</strong>.
                        </p>
                      )}
                      {actividad.idTipoApoyo ? (
                        <p className="text-muted" role="status">
                          Se guardará explícitamente como <strong>{opcionesApoyosActividad.find((item) => String(item.id) === String(actividad.idTipoApoyo))?.nombre || "tipo seleccionado"}</strong>.
                        </p>
                      ) : apoyoSugerido ? (
                        <div className="vec-role-warning-details" role="status">
                          <span>Coincidencia sugerida por la ruta institucional “{actividadSeleccionada.rutaApoyoSugerida}”: <strong>{apoyoSugerido.nombre}</strong>. La sugerencia no se guardará hasta que la selecciones.</span>
                          <button className="btn btn-outline btn-sm" type="button" onClick={() => {
                            actualizarActividad("idTipoApoyo", apoyoSugerido.id);
                            setConfirmacionRolApoyo(false);
                          }}>Usar sugerencia</button>
                        </div>
                      ) : (
                        <p className="text-muted" role="status">
                          No hay una ruta institucional coincidente. Si aplica, selecciona el tipo manualmente; si no, déjalo en “No aplica”.
                        </p>
                      )}
                    </div>
                  </FormGrid>
                  {tieneRolesMultiples && actividad.idTipoApoyo && (
                    <label className="form-group vec-support-role-confirmation">
                      <input
                        type="checkbox"
                        aria-invalid={intentoContinuar && !confirmacionRolApoyo}
                        checked={confirmacionRolApoyo}
                        onChange={(event) => setConfirmacionRolApoyo(event.target.checked)}
                      />
                      <span>
                        {intentoContinuar && !confirmacionRolApoyo && <strong className="vec-required-indicator">Falta confirmar. </strong>}
                        Confirmo que el tipo de apoyo se registra bajo el rol seleccionado: {" "}
                        <strong>{TIPOS.find((item) => item.value === tipo)?.label || tipo}</strong>.
                      </span>
                    </label>
                  )}
                </SectionCard>
                  <SectionCard
                    title="Estrategias de bienestar, permanencia e inclusión"
                    icon="fa-heart"
                    summary={bienestarAplica || bienestarTieneInfoExistente ? "Opcional" : "No aplica a esta actividad"}
                    description={bienestarAplica
                      ? `Programa asociado: ${programaBienestarActual}`
                      : bienestarTieneInfoExistente
                        ? "La actividad conserva las estrategias guardadas en el evento existente."
                        : "La actividad seleccionada no tiene programa de bienestar asociado en el catálogo."}
                  >
                    {bienestarAplica || bienestarTieneInfoExistente ? (
                      <FormGrid>
                <Field
                          name="estrategiaPoliticaBienestar"
                          label="Estrategia de bienestar"
                          value={actividad.estrategiaPoliticaBienestar}
                          onChange={actualizarActividad}
                          type="textarea"
                          readOnly={Boolean(actividad.idEventoExistente)}
                        />
                <Field
                          name="estrategiaPoliticaPermanencia"
                          label="Estrategia de permanencia y graduación"
                          value={actividad.estrategiaPoliticaPermanencia}
                          onChange={actualizarActividad}
                          type="textarea"
                          readOnly={Boolean(actividad.idEventoExistente)}
                        />
                <Field
                          name="estrategiaPoliticaEducacionInclusiva"
                          label="Estrategia de educación inclusiva"
                          value={actividad.estrategiaPoliticaEducacionInclusiva}
                          onChange={actualizarActividad}
                          type="textarea"
                          readOnly={Boolean(actividad.idEventoExistente)}
                        />
                      </FormGrid>
                    ) : (
                      <p className="text-muted" role="status">No aplica a esta actividad.</p>
                    )}
                  </SectionCard>
              </SectionCard>
            </>
          )}
        </>
      )}

      {error && <div className="auth-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</div>}
      {confirmacion && <div className="autosave-banner vec-participant-status" role="status">{confirmacion}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <button
          className="btn btn-outline"
          type="button"
          onClick={() => confirmarSalidaCargaMasiva(() => onCancel?.())}
          disabled={guardando}
        >
          Cancelar
        </button>
        <button
          className="btn btn-primary"
          type="submit"
          disabled={guardando
            || !tipo
            || !identificacion.trim()
            || esperandoResultado
            || busqueda.status === "error"
            || !actividad.idCatalogoActividad
            || catalogosStatus !== "loaded"}
        >
          <i className={`fas ${guardando ? "fa-spinner fa-spin" : "fa-floppy-disk"}`} aria-hidden="true"></i>
          {guardando
            ? "Guardando registro..."
            : actividad.idEventoExistente
              ? "Vincular participante al evento"
              : "Registrar participante y programar jornada"}
        </button>
      </div>
      </>}
    </form>
  );
}
