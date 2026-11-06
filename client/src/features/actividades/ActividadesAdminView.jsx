import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  actualizarActividad,
  cambiarEstadoActividad,
  buscarPersonasActividades,
  corregirTipoApoyoInscripcion,
  crearActividad,
  eliminarActividad,
  eliminarActividades,
  exportarParticipantesActividad,
  eliminarInscripcion,
  getActividades,
  getCatalogosEstudiante,
  getHistorialParticipacion,
  getParticipantesActividad,
} from "./participantesApi.js";
const EMPTY_FORM = {
  idPeriodo: "",
  actividad: "",
  programaBienestar: "",
  subdivisionProgramas: [],
  descripcion: "",
  ubicacion: [],
  fechaInicio: "",
  fechaFinalizacion: "",
  modalidad: "",
  alianzaInterinstitucional: "",
  entidadAlianza: "",
  articulacionInstitucional: "",
  idDependencia: "",
  dependenciaOtra: "",
  estrategiaPoliticaBienestar: "",
  estrategiaPoliticaPermanencia: "",
  estrategiaPoliticaEducacionInclusiva: "",
  tipoActividadOtra: "",
};
const ESTADOS = ["PROGRAMADA", "EN_CURSO", "FINALIZADA", "CANCELADA"];
const ETIQUETAS_ESTADO = {
  PROGRAMADA: "Programadas",
  EN_CURSO: "En curso",
  FINALIZADA: "Finalizadas",
  CANCELADA: "Canceladas",
};
const CAMPUS_ACTIVIDAD = [
  "Campus Centro",
  "Campus San Damián",
  "Campus Santiago",
];
const ESTRATEGIA_FIELDS = [
  "estrategiaPoliticaBienestar",
  "estrategiaPoliticaPermanencia",
  "estrategiaPoliticaEducacionInclusiva",
];

function normalizarCampus(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((campus) => String(campus).trim()).filter(Boolean))];
  }
  return [
    ...new Set(
      String(value || "")
        .split(/\s*(?:·|,|\|)\s*/)
        .map((campus) => campus.trim())
        .filter(Boolean),
    ),
  ];
}

function opcionesEstrategia(programas, field, valorActual) {
  const opciones = new Map();
  for (const programa of programas) {
    const value = String(programa[field] || "").replace(/\s+/g, " ").trim();
    if (!value) continue;
    const key = value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es");
    if (!opciones.has(key)) opciones.set(key, value);
  }
  const currentValue = String(valorActual || "").replace(/\s+/g, " ").trim();
  if (currentValue) {
    const key = currentValue
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es");
    if (!opciones.has(key)) opciones.set(key, currentValue);
  }
  return [...opciones.values()].sort((a, b) => a.localeCompare(b, "es"));
}

function estrategiasAutocompletadas(programas, programa, subdivisiones) {
  const filasPrograma = programas.filter((item) => item.programa === programa);
  const filasSeleccionadas = subdivisiones.length
    ? filasPrograma.filter((item) =>
        subdivisiones.includes(item.programaCompleto),
      )
    : filasPrograma.filter((item) => !item.subdivision);
  const filasParaCompletar = filasSeleccionadas.length
    ? filasSeleccionadas
    : subdivisiones.length
      ? []
      : filasPrograma;
  return Object.fromEntries(
    ESTRATEGIA_FIELDS.map((field) => {
      const valores = [
        ...new Map(
          filasParaCompletar
            .map((item) => String(item[field] || "").replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .map((value) => [value.toLocaleLowerCase("es"), value]),
        ).values(),
      ];
      return [field, valores.length === 1 ? valores[0] : ""];
    }),
  );
}

function formatoFecha(value) {
  const fecha = String(value || "").slice(0, 10);
  if (!fecha) return "Fecha pendiente";
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${fecha}T12:00:00`));
}

function claseEstado(estado) {
  return `activity-status activity-status--${String(estado || "").toLowerCase()}`;
}

function normalizarRolParticipante(rol) {
  const normalizado = String(rol || "").trim().toUpperCase();
  return normalizado === "DOCENTE" ? "COLABORADOR" : normalizado;
}

const ETIQUETAS_ROL_PARTICIPANTE = {
  ESTUDIANTE: "Estudiante",
  COLABORADOR: "Docente",
  ADMINISTRATIVO: "Administrativo",
  EGRESADO: "Egresado",
  EXTERNO: "Externo",
};

const ICONOS_ROL_PARTICIPANTE = {
  ESTUDIANTE: "fa-user-graduate",
  COLABORADOR: "fa-chalkboard-user",
  ADMINISTRATIVO: "fa-user-gear",
  EGRESADO: "fa-user-check",
  EXTERNO: "fa-user-group",
};

function nombreArchivoAsistencia(activity) {
  const slug = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
  return (
    ["asistentes", slug(activity.actividad), slug(activity.periodo)]
      .filter(Boolean)
      .join("-") + ".xlsx"
  );
}

function Modal({ title, subtitle, onClose, children, wide = false }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`activity-modal${wide ? " activity-modal--wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="activity-modal__header">
        <div className="activity-modal__heading">
          <span className="activity-modal__heading-icon">
            <i className="fas fa-calendar-plus" aria-hidden="true"></i>
          </span>
          <span>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </span>
        </div>
        <button
          className="activity-modal__close"
          type="button"
          onClick={onClose}
          aria-label="Cerrar ventana"
        >
          <i className="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
      <div className="activity-modal__body">{children}</div>
    </dialog>
  );
}

function toForm(activity, programasBienestar) {
  const programa = programasBienestar.find(
    (item) => item.programaCompleto === activity.programaBienestar,
  );
  return {
    ...EMPTY_FORM,
    idEventoExistente: activity.id,
    idPeriodo: activity.idPeriodo,
    actividad: activity.actividad || "",
    programaBienestar: programa?.programa || activity.programaBienestar || "",
    subdivisionProgramas:
      Array.isArray(activity.variablesModalidades) &&
      activity.variablesModalidades.length
        ? activity.variablesModalidades
        : programa?.subdivision
          ? [programa.programaCompleto]
          : [],
    descripcion: activity.descripcion || "",
    ubicacion: normalizarCampus(activity.ubicacion),
    fechaInicio: String(activity.fechaInicio || "").slice(0, 10),
    fechaFinalizacion: String(activity.fechaFinalizacion || "").slice(0, 10),
    modalidad: activity.modalidad || "",
    tipoActividadOtra: activity.tipoActividadOtra || "",
    alianzaInterinstitucional:
      activity.alianzaInterinstitucional == null
        ? ""
        : String(activity.alianzaInterinstitucional),
    entidadAlianza: activity.entidadAlianza || "",
    articulacionInstitucional: activity.articulacionInstitucional || "",
    idDependencia: activity.idDependencia || "",
    dependenciaOtra: activity.dependenciaOtra || "",
    estrategiaPoliticaBienestar: activity.estrategiaPoliticaBienestar || "",
    estrategiaPoliticaPermanencia: activity.estrategiaPoliticaPermanencia || "",
    estrategiaPoliticaEducacionInclusiva:
      activity.estrategiaPoliticaEducacionInclusiva || "",
  };
}

export default function ActividadesAdminView() {
  const location = useLocation();
  const navigate = useNavigate();
  const importacionRealizadas = location.state?.importacionRealizadas;
  const actividadesImportadasKey = [
    ...new Set(importacionRealizadas?.actividadesImportadas || []),
  ].join(",");
  const [actividades, setActividades] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [programasBienestar, setProgramasBienestar] = useState([]);
  const [tiposApoyo, setTiposApoyo] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [form, setForm] = useState(null);
  const [participantes, setParticipantes] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [personaTerm, setPersonaTerm] = useState("");
  const [personas, setPersonas] = useState([]);
  const [edicionApoyo, setEdicionApoyo] = useState(null);
  const [guardandoApoyo, setGuardandoApoyo] = useState(false);
  const [eliminandoActividadId, setEliminandoActividadId] = useState("");
  const [modoSeleccionMultiple, setModoSeleccionMultiple] = useState(false);
  const [actividadesSeleccionadas, setActividadesSeleccionadas] = useState(
    () => new Set(),
  );
  const [confirmacionEliminacionMasiva, setConfirmacionEliminacionMasiva] =
    useState(false);
  const [eliminandoActividades, setEliminandoActividades] = useState(false);
  const [errorEliminacionMasiva, setErrorEliminacionMasiva] = useState("");
  const [exportandoActividadId, setExportandoActividadId] = useState("");
  const [eliminandoInscripcionId, setEliminandoInscripcionId] = useState("");
  const [errorEliminacionInscripcion, setErrorEliminacionInscripcion] =
    useState("");
  const [confirmacionEliminacion, setConfirmacionEliminacion] = useState(null);
  const [busquedaParticipante, setBusquedaParticipante] = useState("");
  const [buscandoPersonas, setBuscandoPersonas] = useState(false);

  const cargarActividades = useCallback(async () => {
    const rows = await getActividades({ busqueda });
    setActividades(rows);
  }, [busqueda]);

  useEffect(() => {
    let mounted = true;
    getCatalogosEstudiante()
      .then((refs) => {
        if (!mounted) return;
        setPeriodos(refs.periodos || []);
        setProgramasBienestar(refs.programasBienestar || []);
        setTiposApoyo(refs.tiposApoyo || []);
      })
      .catch(
        (requestError) =>
          mounted &&
          setError(
            requestError.message ||
              "No se pudieron cargar los catálogos de administración.",
          ),
      );
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setCargando(true);
    const timeout = setTimeout(() => {
      const importedIds = busqueda
        ? []
        : actividadesImportadasKey.split(",").filter(Boolean);
      Promise.all([
        getActividades({ busqueda }),
        importedIds.length ? getActividades({ ids: importedIds }) : [],
      ])
        .then(([rows, importedRows]) => {
          if (!active) return;
          setActividades([
            ...new Map(
              [...rows, ...importedRows].map((activity) => [
                activity.id,
                activity,
              ]),
            ).values(),
          ]);
        })
        .catch(
          (requestError) =>
            active &&
            setError(
              requestError.message || "No se pudieron cargar las actividades.",
            ),
        )
        .finally(() => active && setCargando(false));
    }, 250);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [busqueda, actividadesImportadasKey]);

  useEffect(() => {
    if (personaTerm.trim().length < 2) {
      setPersonas([]);
      return undefined;
    }
    const timeout = setTimeout(() => {
      setBuscandoPersonas(true);
      buscarPersonasActividades(personaTerm.trim())
        .then(setPersonas)
        .catch((requestError) =>
          setError(requestError.message || "No se pudo buscar la persona."),
        )
        .finally(() => setBuscandoPersonas(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [personaTerm]);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateModalidades(value) {
    setForm((current) => ({
      ...current,
      subdivisionProgramas: value,
      ...estrategiasAutocompletadas(
        programasBienestar,
        current.programaBienestar,
        value,
      ),
    }));
  }

  const programasDelGrupo = programasBienestar.filter(
    (item) => item.programa === form?.programaBienestar,
  );
  const opcionesProgramasBienestar = [
    ...new Map(
      programasBienestar
        .filter((item) => item.programa)
        .map((item) => [
          item.programa,
          {
            value: item.programa,
            label: item.programa,
          },
        ]),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label, "es"));
  const subdivisionesPrograma = programasDelGrupo
    .filter((item) => item.subdivision)
    .sort((a, b) => a.subdivision.localeCompare(b.subdivision, "es"));
  const modalidadesSeleccionadas = subdivisionesPrograma.filter((item) =>
    form?.subdivisionProgramas?.includes(item.programaCompleto),
  );
  const filasCatalogoSeleccionadas = modalidadesSeleccionadas.length
    ? modalidadesSeleccionadas
    : subdivisionesPrograma.length === 0
      ? programasDelGrupo.filter((item) => !item.subdivision)
      : [];
  const valoresCatalogoSeleccionados = (field) => [
    ...new Set(
      filasCatalogoSeleccionadas.map((item) => item[field]).filter(Boolean),
    ),
  ];
  const apoyosCatalogoSeleccionados = valoresCatalogoSeleccionados("tipoApoyo");
  const estrategiasCatalogoSeleccionadas = [
    [
      "Bienestar institucional",
      valoresCatalogoSeleccionados("estrategiaPoliticaBienestar"),
    ],
    [
      "Permanencia",
      valoresCatalogoSeleccionados("estrategiaPoliticaPermanencia"),
    ],
    [
      "Educación inclusiva",
      valoresCatalogoSeleccionados("estrategiaPoliticaEducacionInclusiva"),
    ],
  ].filter(([, values]) => values.length);
  const opcionesEstrategias = [
    [
      "estrategiaPoliticaBienestar",
      opcionesEstrategia(
        programasBienestar,
        "estrategiaPoliticaBienestar",
        form?.estrategiaPoliticaBienestar,
      ),
    ],
    [
      "estrategiaPoliticaPermanencia",
      opcionesEstrategia(
        programasBienestar,
        "estrategiaPoliticaPermanencia",
        form?.estrategiaPoliticaPermanencia,
      ),
    ],
    [
      "estrategiaPoliticaEducacionInclusiva",
      opcionesEstrategia(
        programasBienestar,
        "estrategiaPoliticaEducacionInclusiva",
        form?.estrategiaPoliticaEducacionInclusiva,
      ),
    ],
  ];
  const actividadesPorEstado = ESTADOS.map((estado) => ({
    estado,
    etiqueta: ETIQUETAS_ESTADO[estado],
    total: actividades.filter((activity) => activity.estado === estado).length,
    actividades: actividades.filter(
      (activity) =>
        activity.estado === estado &&
        (!filtroEstado || activity.estado === filtroEstado),
    ),
  }));
  const actividadesVisibles = actividadesPorEstado.flatMap(
    (grupo) => grupo.actividades,
  );
  const actividadesSeleccionadasVisibles = actividadesVisibles.filter((activity) =>
    actividadesSeleccionadas.has(activity.id),
  );
  const todasLasVisiblesSeleccionadas =
    actividadesVisibles.length > 0 &&
    actividadesVisibles.every((activity) =>
      actividadesSeleccionadas.has(activity.id),
    );
  const participantesSeleccionados = actividadesSeleccionadasVisibles.reduce(
    (total, activity) => total + Number(activity.totalParticipantes || 0),
    0,
  );
  const razonesImportacionPendiente = [
    ...(importacionRealizadas?.actividadesPendientesPorMotivo || []).map(
      ({ motivo, cantidad }) => ({
        key: `activity-${motivo}`,
        text: `${cantidad} actividad(es): ${motivo}`,
      }),
    ),
    ...(importacionRealizadas?.participantesPendientesPorMotivo || []).map(
      ({ motivo, cantidad }) => ({
        key: `participant-${motivo}`,
        text: `${cantidad} participante(s): ${motivo}`,
      }),
    ),
  ];

  async function save(event) {
    event.preventDefault();
    setError("");
    setMensaje("");
    if (
      !form?.idPeriodo ||
      !form.actividad?.trim() ||
      !form.fechaInicio ||
      !form.fechaFinalizacion ||
      !form.ubicacion?.length
    ) {
      setError(
        "Ingresa el periodo, el nombre de la actividad, la ubicación y ambas fechas.",
      );
      return;
    }
    if (form.fechaFinalizacion < form.fechaInicio) {
      setError("La fecha final no puede ser anterior a la fecha inicial.");
      return;
    }
    if (subdivisionesPrograma.length > 0) {
      if (!form.subdivisionProgramas?.length) {
        setError(
          "Selecciona el apoyo que se asignará. Puedes marcar solo uno aunque el programa tenga varias opciones.",
        );
        return;
      }
      if (
        form.subdivisionProgramas.some(
          (value) =>
            !subdivisionesPrograma.some(
              (item) => item.programaCompleto === value,
            ),
        )
      ) {
        setError(
          "Selecciona variables o modalidades válidas para el programa de Bienestar.",
        );
        return;
      }
    }
    setGuardando(true);
    let saved = false;
    try {
      if (form.idEventoExistente)
        await actualizarActividad(form.idEventoExistente, form);
      else await crearActividad(form);
      saved = true;
      setMensaje(
        form.idEventoExistente
          ? "Actividad actualizada."
          : "Actividad guardada.",
      );
      setForm(null);
      await cargarActividades();
    } catch (requestError) {
      setError(
        saved
          ? `La actividad se guardó, pero no se pudo actualizar la lista. ${requestError.message || ""}`.trim()
          : requestError.message || "No se pudo guardar la actividad.",
      );
    } finally {
      setGuardando(false);
    }
  }

  async function changeStatus(id, estado) {
    setError("");
    try {
      await cambiarEstadoActividad(id, estado);
      await cargarActividades();
      setMensaje("Estado de actividad actualizado.");
      return true;
    } catch (requestError) {
      setError(
        requestError.message ||
          "No se pudo actualizar el estado de la actividad.",
      );
      return false;
    }
  }

  async function deleteActivity(activity) {
    const participantCount = Number(activity.totalParticipantes || 0);
    const estado = ETIQUETAS_ESTADO[activity.estado] || activity.estado;
    const impact = participantCount
      ? ` También se eliminarán sus ${participantCount} inscripciones y las modalidades asociadas. Los perfiles de estudiantes no se eliminan.`
      : " También se eliminarán las modalidades asociadas.";
    const confirmed = window.confirm(
      `¿Eliminar permanentemente la actividad "${activity.actividad}" (${estado})? Esta acción no se puede deshacer.${impact}`,
    );
    if (!confirmed) return;

    setError("");
    setMensaje("");
    setEliminandoActividadId(activity.id);
    try {
      const result = await eliminarActividad(activity.id);
      setActividades((current) =>
        current.filter((item) => item.id !== activity.id),
      );
      setActividadesSeleccionadas((current) => {
        const next = new Set(current);
        next.delete(activity.id);
        return next;
      });
      setParticipantes((current) =>
        current?.actividadId === activity.id ? null : current,
      );
      setForm((current) =>
        current?.idEventoExistente === activity.id ? null : current,
      );
      setMensaje(
        result.mensaje ||
          `Se eliminó "${activity.actividad}" y sus datos asociados.`,
      );
    } catch (requestError) {
      setError(requestError.message || "No se pudo eliminar la actividad.");
    } finally {
      setEliminandoActividadId("");
    }
  }

  function toggleSeleccionActividad(id) {
    setActividadesSeleccionadas((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleModoSeleccionMultiple() {
    if (modoSeleccionMultiple) {
      setActividadesSeleccionadas(new Set());
      setConfirmacionEliminacionMasiva(false);
      setErrorEliminacionMasiva("");
    }
    setModoSeleccionMultiple(!modoSeleccionMultiple);
  }

  function toggleSeleccionVisibles() {
    setActividadesSeleccionadas((current) => {
      const next = new Set(current);
      if (todasLasVisiblesSeleccionadas) {
        actividadesVisibles.forEach((activity) => next.delete(activity.id));
      } else {
        actividadesVisibles.forEach((activity) => next.add(activity.id));
      }
      return next;
    });
  }

  async function deleteSelectedActivities() {
    const ids = actividadesSeleccionadasVisibles.map((activity) => activity.id);
    if (!ids.length) return;
    setEliminandoActividades(true);
    setErrorEliminacionMasiva("");
    try {
      const result = await eliminarActividades(ids);
      const deletedIds = new Set(ids);
      setActividades((current) =>
        current.filter((activity) => !deletedIds.has(activity.id)),
      );
      setParticipantes((current) =>
        current && deletedIds.has(current.actividadId) ? null : current,
      );
      setForm((current) =>
        current && deletedIds.has(current.idEventoExistente) ? null : current,
      );
      setActividadesSeleccionadas(new Set());
      setConfirmacionEliminacionMasiva(false);
      setMensaje(result.mensaje || `Se eliminaron ${ids.length} actividades.`);
    } catch (requestError) {
      setErrorEliminacionMasiva(
        requestError.message ||
          "No se pudieron eliminar las actividades seleccionadas.",
      );
    } finally {
      setEliminandoActividades(false);
    }
  }

  async function downloadAttendanceExcel(activity) {
    setError("");
    setMensaje("");
    setExportandoActividadId(activity.id);
    try {
      const blob = await exportarParticipantesActividad(activity.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nombreArchivoAsistencia(activity);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMensaje(
        `Se descargó el Excel de asistencia de "${activity.actividad}".`,
      );
    } catch (requestError) {
      setError(
        requestError.message || "No se pudo descargar el Excel de asistencia.",
      );
    } finally {
      setExportandoActividadId("");
    }
  }

  async function showParticipants(activity) {
    setError("");
    setErrorEliminacionInscripcion("");
    setConfirmacionEliminacion(null);
    setBusquedaParticipante("");
    setParticipantes({
      actividadId: activity.id,
      actividad: activity.actividad,
      filas: [],
      cargando: true,
      error: "",
    });
    try {
      const filas = await getParticipantesActividad(activity.id);
      setParticipantes({
        actividadId: activity.id,
        actividad: activity.actividad,
        filas,
        cargando: false,
        error: "",
      });
    } catch (requestError) {
      setParticipantes((current) =>
        current
          ? {
              ...current,
              cargando: false,
              error:
                requestError.message ||
                "No se pudieron cargar los participantes de la actividad.",
            }
          : current,
      );
    }
  }

  async function removeParticipant(row) {
    setEliminandoInscripcionId(row.id);
    setErrorEliminacionInscripcion("");
    try {
      const result = await eliminarInscripcion(row.id);
      setParticipantes((current) =>
        current
          ? {
              ...current,
              filas: current.filas.filter((item) => item.id !== row.id),
              aviso: result.mensaje,
            }
          : current,
      );
      setConfirmacionEliminacion(null);
      setActividades((current) =>
        current.map((activity) =>
          activity.id === participantes.actividadId
            ? {
                ...activity,
                totalParticipantes: Math.max(
                  0,
                  Number(activity.totalParticipantes || 0) - 1,
                ),
              }
            : activity,
        ),
      );
    } catch (requestError) {
      setErrorEliminacionInscripcion(
        requestError.message || "No se pudo eliminar la inscripción.",
      );
    } finally {
      setEliminandoInscripcionId("");
    }
  }

  const participantesFiltrados = (participantes?.filas || []).filter((row) => {
    const termino = busquedaParticipante.trim().toLocaleLowerCase("es");
    if (!termino) return true;
    return [
      row.apellidosNombres,
      row.identificacion,
      row.correo,
      row.rolParticipacion,
      ...(row.rolesInstitucionales || []),
      row.programaBienestar,
      row.programaModalidad,
      row.tipoApoyo,
      row.tipoApoyoObservacion,
    ].some((value) =>
      String(value || "")
        .toLocaleLowerCase("es")
        .includes(termino),
    );
  });

  async function showHistory(person) {
    setError("");
    try {
      const rows = await getHistorialParticipacion(person.identificacion);
      setHistorial({ person, rows });
    } catch (requestError) {
      setError(
        requestError.message ||
          "No se pudo consultar el historial de participación.",
      );
    }
  }

  async function saveSupportCorrection(event) {
    event.preventDefault();
    if (!edicionApoyo) return;
    setGuardandoApoyo(true);
    setError("");
    try {
      await corregirTipoApoyoInscripcion(edicionApoyo.id, {
        idTipoApoyo: edicionApoyo.idTipoApoyo,
        motivo: edicionApoyo.motivo,
      });
      const filas = await getParticipantesActividad(participantes.actividadId);
      setParticipantes((current) =>
        current ? { ...current, filas } : current,
      );
      setMensaje("Corrección de apoyo guardada con el motivo indicado.");
      setEdicionApoyo(null);
    } catch (requestError) {
      setError(
        requestError.message ||
          "No se pudo guardar la corrección del tipo de apoyo.",
      );
    } finally {
      setGuardandoApoyo(false);
    }
  }

  return (
    <>
      <section className="card activity-admin">
        <div className="activity-admin__header">
          <div>
            <span className="activity-admin__eyebrow">GESTIÓN VEC</span>
            <h2 className="card-title">
              <i className="fas fa-calendar-check" aria-hidden="true"></i>{" "}
              Actividades
            </h2>
            <p className="activity-admin__subtitle">
              Organiza, consulta y administra las actividades registradas.
            </p>
          </div>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setForm({ ...EMPTY_FORM })}
          >
            <i className="fas fa-plus" aria-hidden="true"></i> Crear actividad
          </button>
        </div>
        <div className="activity-toolbar">
          <div className="activity-toolbar__search">
            <label className="form-label" htmlFor="activity-search">
              Buscar actividades
            </label>
            <div className="activity-search">
              <i className="fas fa-search" aria-hidden="true"></i>
              <input
                className="form-control"
                id="activity-search"
                placeholder="Nombre, proyecto, apoyo, sede, fecha o periodo"
                value={busqueda}
                onChange={(event) => {
                  setBusqueda(event.target.value);
                  setActividadesSeleccionadas(new Set());
                }}
              />
            </div>
          </div>
          <div className="activity-toolbar__status">
            <label className="form-label" htmlFor="activity-status-filter">
              Estado
            </label>
            <select
              className="form-select"
              id="activity-status-filter"
              value={filtroEstado}
              onChange={(event) => {
                setFiltroEstado(event.target.value);
                setActividadesSeleccionadas(new Set());
              }}
            >
              <option value="">Todos los estados</option>
              {ESTADOS.map((estado) => (
                <option key={estado} value={estado}>
                  {ETIQUETAS_ESTADO[estado]}
                </option>
              ))}
            </select>
          </div>
          <div className="activity-toolbar__actions">
            <p className="activity-toolbar__result-count" role="status">
              {actividadesVisibles.length}{" "}
              {actividadesVisibles.length === 1
                ? "actividad encontrada"
                : "actividades encontradas"}
            </p>
            <button
              className={`btn btn-sm activity-multiple-select${modoSeleccionMultiple ? " activity-multiple-select--active" : ""}`}
              type="button"
              onClick={toggleModoSeleccionMultiple}
              aria-pressed={modoSeleccionMultiple}
              disabled={eliminandoActividades}
            >
              <i
                className={`fas ${modoSeleccionMultiple ? "fa-xmark" : "fa-list-check"}`}
                aria-hidden="true"
              ></i>
              {modoSeleccionMultiple
                ? "Salir de selección"
                : "Selección múltiple"}
            </button>
          </div>
        </div>
        {modoSeleccionMultiple &&
          !cargando &&
          actividadesVisibles.length > 0 && (
            <div className="activity-bulk-toolbar">
              <label className="activity-bulk-toolbar__select-all">
                <input
                  type="checkbox"
                  checked={todasLasVisiblesSeleccionadas}
                  onChange={toggleSeleccionVisibles}
                  aria-label="Seleccionar todas las actividades filtradas"
                />
                <span>
                  {todasLasVisiblesSeleccionadas
                    ? "Quitar selección"
                    : "Seleccionar actividades filtradas"}
                </span>
              </label>
              <span className="activity-bulk-toolbar__summary" role="status">
                {actividadesSeleccionadasVisibles.length} seleccionadas
              </span>
              <button
                className="btn btn-danger btn-sm activity-bulk-toolbar__delete"
                type="button"
                onClick={() => {
                  setErrorEliminacionMasiva("");
                  setConfirmacionEliminacionMasiva(true);
                }}
                disabled={
                  actividadesSeleccionadasVisibles.length === 0 ||
                  eliminandoActividades
                }
              >
                <i className="fas fa-trash-can" aria-hidden="true"></i>
                Eliminar seleccionadas
              </button>
            </div>
        )}
        {importacionRealizadas && (
          <section
            className="activity-import-result"
            aria-labelledby="activity-import-result-title"
            role="status"
          >
            <button
              className="activity-import-result__close"
              type="button"
              aria-label="Cerrar resumen de importación"
              onClick={() =>
                navigate(`${location.pathname}${location.search}`, {
                  replace: true,
                  state: null,
                })
              }
            >
              <i className="fas fa-times" aria-hidden="true"></i>
            </button>
            <h3 id="activity-import-result-title">
              Importación guardada: las actividades válidas están en esta lista
            </h3>
            <p>
              {Number(importacionRealizadas.actividadesCreadas || 0)} actividades
              creadas y{" "}
              {Number(importacionRealizadas.actividadesReutilizadas || 0)}{" "}
              reutilizadas;{" "}
              {Number(importacionRealizadas.participantesInscritos || 0)}{" "}
              participantes inscritos. Las actividades se guardaron como
              finalizadas y aparecen agrupadas abajo.{" "}
              {Number(importacionRealizadas.participantesYaInscritos || 0)} ya
              estaban inscritos.
            </p>
            {(Number(importacionRealizadas.actividadesPendientes || 0) > 0 ||
              Number(importacionRealizadas.participantesPendientes || 0) > 0 ||
              Number(importacionRealizadas.participantesDuplicados || 0) > 0) && (
              <details>
                <summary>
                  Pendientes y filas omitidas:{" "}
                  {Number(importacionRealizadas.actividadesPendientes || 0)}{" "}
                  actividades,{" "}
                  {Number(importacionRealizadas.participantesPendientes || 0)}{" "}
                  participantes y{" "}
                  {Number(importacionRealizadas.participantesDuplicados || 0)}{" "}
                  duplicados
                </summary>
                {razonesImportacionPendiente.length > 0 && (
                  <ul>
                    {razonesImportacionPendiente.map((reason) => (
                      <li key={reason.key}>{reason.text}</li>
                    ))}
                  </ul>
                )}
              </details>
            )}
          </section>
        )}
        {!cargando && (
          <div
            className="activity-overview"
            aria-label="Resumen de actividades por estado"
          >
            {actividadesPorEstado.map((grupo) => (
              <button
                className={`activity-overview__item${filtroEstado === grupo.estado ? " activity-overview__item--active" : ""}`}
                key={grupo.estado}
                type="button"
                aria-pressed={filtroEstado === grupo.estado}
                title={`Filtrar actividades ${grupo.etiqueta.toLowerCase()}`}
                onClick={() => {
                  setFiltroEstado((current) =>
                    current === grupo.estado ? "" : grupo.estado,
                  );
                  setActividadesSeleccionadas(new Set());
                }}
              >
                <span
                  className={`activity-overview__icon activity-overview__icon--${grupo.estado.toLowerCase()}`}
                >
                  <i className="fas fa-calendar-alt" aria-hidden="true"></i>
                </span>
                <span>
                  <strong>{grupo.total}</strong>
                  <small>{grupo.etiqueta}</small>
                </span>
                <i
                  className="fas fa-arrow-right activity-overview__filter-icon"
                  aria-hidden="true"
                ></i>
              </button>
            ))}
          </div>
        )}
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}
        {mensaje && (
          <div className="autosave-banner" role="status">
            {mensaje}
          </div>
        )}
        {cargando ? (
          <p className="text-muted" role="status">
            Consultando actividades de PostgreSQL...
          </p>
        ) : actividadesVisibles.length === 0 ? (
          <div className="activity-empty" role="status">
            <span className="activity-empty__icon">
              <i className="fas fa-calendar-day" aria-hidden="true"></i>
            </span>
            <strong>
              {actividades.length === 0
                ? "No hay actividades para mostrar"
                : "No hay actividades con esos filtros"}
            </strong>
            <span>
              {busqueda
                ? "No se encontraron actividades con esa búsqueda."
                : filtroEstado
                  ? `No hay actividades ${ETIQUETAS_ESTADO[filtroEstado].toLowerCase()}.`
                  : "Cuando registres actividades, aparecerán organizadas aquí por estado."}
            </span>
          </div>
        ) : (
          <div className="activity-status-groups">
            {actividadesPorEstado.map((grupo) => (
              <details
                className={`activity-status-group activity-status-group--${grupo.estado.toLowerCase()}`}
                key={grupo.estado}
                open={
                  Boolean(busqueda.trim()) ||
                  (Boolean(filtroEstado) && filtroEstado === grupo.estado) ||
                  (!filtroEstado &&
                    !busqueda.trim() &&
                    ["PROGRAMADA", "EN_CURSO"].includes(grupo.estado))
                }
              >
                <summary className="activity-status-group__header">
                  <span className="activity-status-group__heading">
                    <span className={claseEstado(grupo.estado)}>
                      {grupo.etiqueta}
                    </span>
                    <span className="activity-status-group__count">
                      {grupo.actividades.length}
                    </span>
                  </span>
                  <i
                    className="fas fa-chevron-down activity-status-group__chevron"
                    aria-hidden="true"
                  ></i>
                </summary>
                {grupo.actividades.length ? (
                  <div className="activity-card-grid">
                    {grupo.actividades.map((activity) => {
                      const bienestar = programasBienestar.find(
                        (item) =>
                          item.programaCompleto === activity.programaBienestar,
                      );
                      const modalidades = Array.isArray(
                        activity.variablesModalidades,
                      )
                        ? activity.variablesModalidades
                        : [];
                      return (
                        <article
                          className={`activity-card${actividadesSeleccionadas.has(activity.id) ? " activity-card--selected" : ""}`}
                          key={activity.id}
                        >
                          <div className="activity-card__top">
                            {modoSeleccionMultiple && (
                              <label className="activity-card__select">
                                <input
                                  type="checkbox"
                                  checked={actividadesSeleccionadas.has(
                                    activity.id,
                                  )}
                                  onChange={() =>
                                    toggleSeleccionActividad(activity.id)
                                  }
                                  aria-label={`Seleccionar ${activity.actividad} para eliminación`}
                                />
                                <span className="sr-only">
                                  Seleccionar para eliminación
                                </span>
                              </label>
                            )}
                            <span className="activity-card__icon">
                              <i
                                className="fas fa-calendar-check"
                                aria-hidden="true"
                              ></i>
                            </span>
                            <span className={claseEstado(activity.estado)}>
                              {String(activity.estado || "").replaceAll(
                                "_",
                                " ",
                              )}
                            </span>
                          </div>
                          <h3 className="activity-card__title">
                            {activity.actividad}
                          </h3>
                          <p className="activity-card__project">
                            {activity.proyecto || "Actividad institucional"}
                          </p>

                          <div className="activity-card__quick-info">
                            <span>
                              <i
                                className="far fa-calendar-alt"
                                aria-hidden="true"
                              ></i>
                              {formatoFecha(activity.fechaInicio)} –{" "}
                              {formatoFecha(activity.fechaFinalizacion)}
                            </span>
                            <button
                              className="activity-card__participants"
                              type="button"
                              onClick={() => showParticipants(activity)}
                            >
                              <i
                                className="fas fa-users"
                                aria-hidden="true"
                              ></i>
                              <strong>{activity.totalParticipantes}</strong>
                              <span>inscritos</span>
                            </button>
                          </div>

                          <details className="activity-card__more">
                            <summary>
                              <span>Ver detalles y acciones</span>
                              <i
                                className="fas fa-chevron-down"
                                aria-hidden="true"
                              ></i>
                            </summary>
                            <div className="activity-card__details">
                              <div className="activity-detail">
                                <i
                                  className="far fa-calendar-alt"
                                  aria-hidden="true"
                                ></i>
                                <span>
                                  <strong>
                                    {activity.periodo || "Sin periodo"}
                                  </strong>
                                  <small>Periodo académico</small>
                                </span>
                              </div>
                              <div className="activity-detail">
                                <i
                                  className="fas fa-map-marker-alt"
                                  aria-hidden="true"
                                ></i>
                                <span>
                                  <strong>
                                    {normalizarCampus(activity.ubicacion).join(", ") ||
                                      "Ubicación no especificada"}
                                  </strong>
                                  <small>
                                    {activity.modalidad ||
                                      "Modalidad no especificada"}
                                  </small>
                                </span>
                              </div>
                            </div>

                            {activity.programaBienestar && (
                              <div className="activity-card__program">
                                <span className="activity-card__label">
                                  PROGRAMA DE BIENESTAR
                                </span>
                                <strong>
                                  {bienestar?.programa ||
                                    activity.programaBienestar}
                                </strong>
                                {modalidades.length > 0 && (
                                  <div className="activity-card__tags">
                                    {modalidades.map((modalidad) => {
                                      const detalle = programasBienestar.find(
                                        (item) =>
                                          item.programaCompleto === modalidad,
                                      );
                                      const apoyoModalidad =
                                        activity.apoyosModalidades?.find(
                                          (item) =>
                                            item.programaCompleto === modalidad,
                                        );
                                      return (
                                        <span
                                          className="activity-chip"
                                          key={modalidad}
                                        >
                                          {detalle?.subdivision || modalidad}
                                          {apoyoModalidad?.tipoApoyo && (
                                            <small>
                                              {apoyoModalidad.tipoApoyo}
                                            </small>
                                          )}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                                {activity.tipoApoyoPrograma && (
                                  <span className="activity-card__support">
                                    <i
                                      className="fas fa-hand-holding-heart"
                                      aria-hidden="true"
                                    ></i>
                                    {activity.tipoApoyoPrograma}
                                  </span>
                                )}
                              </div>
                            )}

                            <div className="activity-card__footer">
                              <div className="activity-card__actions">
                                <button
                                  className="btn btn-outline btn-sm activity-card__download"
                                  type="button"
                                  onClick={() =>
                                    downloadAttendanceExcel(activity)
                                  }
                                  disabled={Boolean(exportandoActividadId)}
                                  title="Descargar participantes con el formato de Asistencia y reportes"
                                  aria-label={`Descargar Excel de asistencia para ${activity.actividad}`}
                                >
                                  <i
                                    className={`fas ${exportandoActividadId === activity.id ? "fa-spinner fa-spin" : "fa-file-excel"}`}
                                    aria-hidden="true"
                                  ></i>
                                  {exportandoActividadId === activity.id
                                    ? "Generando Excel..."
                                    : "Excel asistencia"}
                                </button>
                                <label className="activity-card__status-control">
                                  <span className="sr-only">
                                    Cambiar estado de {activity.actividad}
                                  </span>
                                  <select
                                    className="form-select"
                                    value={activity.estado}
                                    onChange={(event) =>
                                      changeStatus(
                                        activity.id,
                                        event.target.value,
                                      )
                                    }
                                  >
                                    {ESTADOS.map((status) => (
                                      <option key={status} value={status}>
                                        {status.replaceAll("_", " ")}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <button
                                  className="btn btn-outline btn-sm"
                                  type="button"
                                  onClick={() =>
                                    setForm(toForm(activity, programasBienestar))
                                  }
                                >
                                  Editar
                                </button>
                                <button
                                  className="btn btn-danger btn-sm activity-card__delete"
                                  type="button"
                                  onClick={() => deleteActivity(activity)}
                                  disabled={Boolean(eliminandoActividadId)}
                                  title={`Eliminar permanentemente la actividad ${activity.actividad}, sin importar su estado`}
                                >
                                  <i
                                    className={`fas ${eliminandoActividadId === activity.id ? "fa-spinner fa-spin" : "fa-trash-can"}`}
                                    aria-hidden="true"
                                  ></i>
                                  {eliminandoActividadId === activity.id
                                    ? "Eliminando..."
                                    : "Eliminar actividad"}
                                </button>
                              </div>
                            </div>
                          </details>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="activity-status-group__empty">
                    No hay actividades {grupo.etiqueta.toLowerCase()}.
                  </p>
                )}
              </details>
            ))}
          </div>
        )}
      </section>

      <section className="card activity-people">
        <div className="activity-people__header">
          <div>
            <span className="activity-admin__eyebrow">CONSULTA</span>
            <h2 className="card-title">Historial de participación</h2>
            <p className="activity-admin__subtitle">
              Busca una persona para revisar su participación en actividades.
            </p>
          </div>
          {personas.length > 0 && (
            <span className="activity-people__count">
              {personas.length} resultados
            </span>
          )}
        </div>
        <div className="activity-people__search">
          <label className="form-label" htmlFor="activity-person-search">
            Documento, nombre o código
          </label>
          <div className="activity-search">
            <i className="fas fa-search" aria-hidden="true"></i>
            <input
              className="form-control"
              id="activity-person-search"
              placeholder="Escribe al menos 2 caracteres"
              value={personaTerm}
              onChange={(event) => setPersonaTerm(event.target.value)}
            />
          </div>
        </div>
        {buscandoPersonas && (
          <p className="activity-people__message" role="status">
            <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>{" "}
            Buscando personas…
          </p>
        )}
        {!buscandoPersonas && personaTerm.trim().length < 2 && (
          <p className="activity-people__message">
            Ingresa un nombre, documento o código para comenzar la búsqueda.
          </p>
        )}
        {!buscandoPersonas &&
          personaTerm.trim().length >= 2 &&
          personas.length === 0 && (
            <p className="activity-people__message" role="status">
              No se encontraron personas con esos datos.
            </p>
          )}
        {personas.length > 0 && (
          <div className="table-responsive activity-people__table">
            <table className="table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Documento</th>
                  <th>Código</th>
                  <th>Roles</th>
                  <th>Historial</th>
                </tr>
              </thead>
              <tbody>
                {personas.map((person) => (
                  <tr key={person.idPersona}>
                    <td>
                      <strong>
                        {[person.apellidos, person.nombres]
                          .filter(Boolean)
                          .join(" ")}
                      </strong>
                    </td>
                    <td>{person.identificacion}</td>
                    <td>{person.codigo || "—"}</td>
                    <td>{person.roles.join(" · ") || "—"}</td>
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        type="button"
                        onClick={() =>
                          showHistory({
                            ...person,
                            apellidosNombres: [person.apellidos, person.nombres]
                              .filter(Boolean)
                              .join(" "),
                          })
                        }
                      >
                        Ver historial
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {form && (
        <Modal
          title={
            form.idEventoExistente ? "Editar actividad" : "Crear actividad"
          }
          subtitle="Completa la información para organizar y publicar la actividad."
          onClose={() => setForm(null)}
          wide
        >
          <section className="card activity-modal__card">
            <form onSubmit={save}>
              <div className="activity-form-content">
                <section className="activity-form-section activity-form-section--general">
                  <div className="activity-form-section__heading">
                    <span className="activity-form-section__icon">
                      <i className="fas fa-info-circle" aria-hidden="true"></i>
                    </span>
                    <span>
                      <h3>Información general</h3>
                      <p>
                        Identifica la actividad y el programa al que pertenece.
                      </p>
                    </span>
                  </div>
                  <div className="activity-form-grid">
                    <div className="form-group activity-general-field">
                      <label className="form-label" htmlFor="activity-period">
                        Periodo académico
                      </label>
                      <select
                        className="form-select"
                        id="activity-period"
                        value={form.idPeriodo}
                        onChange={(event) =>
                          update("idPeriodo", event.target.value)
                        }
                        required
                      >
                        <option value="">Selecciona el periodo</option>
                        {periodos.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group activity-general-field">
                      <label className="form-label" htmlFor="activity-name">
                        Nombre de la actividad
                      </label>
                      <input
                        className="form-control"
                        id="activity-name"
                        value={form.actividad}
                        onChange={(event) =>
                          update("actividad", event.target.value)
                        }
                        maxLength={250}
                        placeholder="Ej. Jornada de bienestar universitario"
                        required
                      />
                    </div>
                    <div className="form-group activity-form-field--wide activity-general-field">
                      <label className="form-label" htmlFor="activity-program">
                        Programa general de Bienestar{" "}
                        <span className="activity-form-optional">Opcional</span>
                      </label>
                      <p className="activity-program-hint">
                        Elige el programa. Si tiene modalidades, podrás
                        seleccionar una o varias y el sistema completará sus
                        datos relacionados.
                      </p>
                      <select
                        className="form-select"
                        id="activity-program"
                        value={form.programaBienestar}
                        onChange={(event) =>
                          setForm((current) => {
                            const programaBienestar = event.target.value;
                            return {
                              ...current,
                              programaBienestar,
                              subdivisionProgramas: [],
                              ...estrategiasAutocompletadas(
                                programasBienestar,
                                programaBienestar,
                                [],
                              ),
                            };
                          })
                        }
                      >
                        <option value="">No aplica</option>
                        {opcionesProgramasBienestar.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {subdivisionesPrograma.length > 0 && (
                      <div
                        className="form-group activity-form-field--wide activity-modalities-field"
                        role="group"
                        aria-labelledby="activity-subdivision-label"
                      >
                        <div className="activity-modalities-field__heading">
                          <span className="activity-modalities-field__step">
                            2
                          </span>
                          <span>
                            <span
                              className="form-label"
                              id="activity-subdivision-label"
                            >
                              Variables o modalidades
                            </span>
                            <span className="activity-modalities-field__description">
                              Selecciona una o varias opciones para esta
                              actividad.
                            </span>
                          </span>
                          <span className="activity-modalities-field__count">
                            {form.subdivisionProgramas.length}{" "}
                            {form.subdivisionProgramas.length === 1
                              ? "seleccionada"
                              : "seleccionadas"}
                          </span>
                        </div>
                        <div className="activity-modalities-field__toolbar">
                          <p className="activity-modalities__hint">
                            Cada modalidad conservará su tipo de apoyo
                            correspondiente.
                          </p>
                          {subdivisionesPrograma.length > 1 && (
                            <div className="activity-modalities-field__quick-actions">
                              <button
                                type="button"
                                onClick={() =>
                                  updateModalidades(
                                    subdivisionesPrograma.map(
                                      (item) => item.programaCompleto,
                                    ),
                                  )
                                }
                              >
                                Seleccionar todas
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateModalidades([])
                                }
                              >
                                Limpiar
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="activity-modalities">
                          {subdivisionesPrograma.map((item) => {
                            const seleccionada =
                              form.subdivisionProgramas.includes(
                                item.programaCompleto,
                              );
                            return (
                              <label
                                className={`activity-modality${seleccionada ? " activity-modality--selected" : ""}`}
                                key={item.programaCompleto}
                              >
                                <input
                                  className="activity-modality__checkbox"
                                  type="checkbox"
                                  checked={seleccionada}
                                  onChange={(event) =>
                                    updateModalidades(
                                      event.target.checked
                                        ? [
                                            ...form.subdivisionProgramas,
                                            item.programaCompleto,
                                          ]
                                        : form.subdivisionProgramas.filter(
                                            (value) =>
                                              value !== item.programaCompleto,
                                          ),
                                    )
                                  }
                                />
                                <span className="activity-modality__content">
                                  <span className="activity-modality__name">
                                    {item.subdivision}
                                  </span>
                                  <span className="activity-modality__support">
                                    <i
                                      className="fas fa-hand-holding-heart"
                                      aria-hidden="true"
                                    ></i>
                                    {item.tipoApoyo || "Apoyo no especificado"}
                                  </span>
                                </span>
                                <i
                                  className="fas fa-check activity-modality__check"
                                  aria-hidden="true"
                                ></i>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <fieldset
                      className="activity-form-field--wide activity-strategies-field"
                    >
                      <legend className="form-label">
                        Estrategias institucionales{" "}
                        <span className="activity-form-optional">Opcional</span>
                      </legend>
                      <p className="activity-program-hint">
                        Selecciona las estrategias que correspondan a esta
                        actividad. Si las dejas vacías, se conservarán las
                        asociadas al programa elegido.
                      </p>
                      <div className="activity-form-grid">
                        {[
                          [
                            "estrategiaPoliticaBienestar",
                            "Estrategia de Bienestar",
                          ],
                          [
                            "estrategiaPoliticaPermanencia",
                            "Estrategia de Permanencia y graduación",
                          ],
                          [
                            "estrategiaPoliticaEducacionInclusiva",
                            "Estrategia de Educación inclusiva",
                          ],
                        ].map(([field, label], index) => (
                          <div className="form-group" key={field}>
                            <label
                              className="form-label"
                              htmlFor={`activity-${field}`}
                            >
                              {label}
                            </label>
                            <select
                              className="form-select"
                              id={`activity-${field}`}
                              value={form[field] || ""}
                              onChange={(event) =>
                                update(field, event.target.value)
                              }
                            >
                              <option value="">Usar valor del catálogo</option>
                              {opcionesEstrategias[index][1].map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </fieldset>
                    {filasCatalogoSeleccionadas.length > 0 && (
                      <section
                        className="activity-catalog-summary activity-form-field--wide"
                        aria-live="polite"
                      >
                        <div className="activity-catalog-summary__heading">
                          <span className="activity-catalog-summary__icon">
                            <i
                              className="fas fa-wand-magic-sparkles"
                              aria-hidden="true"
                            ></i>
                          </span>
                          <span>
                            <strong>
                              Datos que se completarán automáticamente
                            </strong>
                            <small>
                              Se guardarán junto con la actividad y sus
                              modalidades.
                            </small>
                          </span>
                        </div>
                        <div className="activity-catalog-summary__grid">
                          {[
                            [
                              "Componente",
                              valoresCatalogoSeleccionados("componente"),
                            ],
                            [
                              "Línea de acción",
                              valoresCatalogoSeleccionados("lineaAccion"),
                            ],
                            ["Tipos de apoyo", apoyosCatalogoSeleccionados],
                          ]
                            .filter(([, values]) => values.length)
                            .map(([label, values]) => (
                              <div
                                className="activity-catalog-summary__item"
                                key={label}
                              >
                                <span>{label}</span>
                                <strong>{values.join(" · ")}</strong>
                              </div>
                            ))}
                        </div>
                        {estrategiasCatalogoSeleccionadas.length > 0 && (
                          <details className="activity-catalog-summary__strategies">
                            <summary>
                              Ver estrategias institucionales asociadas
                            </summary>
                            <dl>
                              {estrategiasCatalogoSeleccionadas.map(
                                ([label, values]) => (
                                  <div key={label}>
                                    <dt>{label}</dt>
                                    <dd>{values.join(" · ")}</dd>
                                  </div>
                                ),
                              )}
                            </dl>
                          </details>
                        )}
                      </section>
                    )}
                  </div>
                </section>

                <section className="activity-form-section activity-form-section--schedule">
                  <div className="activity-form-section__heading">
                    <span className="activity-form-section__icon">
                      <i className="far fa-calendar-alt" aria-hidden="true"></i>
                    </span>
                    <span>
                      <h3>Fecha y lugar</h3>
                      <p>
                        Define cuándo se realizará y en qué modalidad y sede.
                      </p>
                    </span>
                  </div>
                  <div className="activity-form-grid activity-schedule-grid">
                    <div className="form-group activity-schedule-field">
                      <label className="form-label" htmlFor="activity-start">
                        Fecha inicial
                      </label>
                      <input
                        className="form-control"
                        id="activity-start"
                        type="date"
                        value={form.fechaInicio}
                        onChange={(event) =>
                          update("fechaInicio", event.target.value)
                        }
                        required
                      />
                    </div>
                    <div className="form-group activity-schedule-field">
                      <label className="form-label" htmlFor="activity-end">
                        Fecha final
                      </label>
                      <input
                        className="form-control"
                        id="activity-end"
                        type="date"
                        value={form.fechaFinalizacion}
                        onChange={(event) =>
                          update("fechaFinalizacion", event.target.value)
                        }
                        required
                      />
                    </div>
                    <div className="form-group activity-schedule-field">
                      <label className="form-label" htmlFor="activity-mode">
                        Modalidad
                      </label>
                      <select
                        className="form-select"
                        id="activity-mode"
                        value={form.modalidad}
                        onChange={(event) =>
                          update("modalidad", event.target.value)
                        }
                      >
                        <option value="">Selecciona la modalidad</option>
                        {["Presencial", "Virtual", "Híbrida"].map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </div>
                    <fieldset className="form-group activity-campus-picker">
                      <legend className="activity-campus-picker__heading">
                        <span className="activity-campus-picker__icon">
                          <i
                            className="fas fa-location-dot"
                            aria-hidden="true"
                          ></i>
                        </span>
                        <span className="activity-campus-picker__title">
                          <span className="form-label">
                            Sedes de la actividad <span>*</span>
                          </span>
                          <small>Selecciona una o varias sedes</small>
                        </span>
                        <span className="activity-campus-picker__count">
                          {form.ubicacion.length} seleccionada
                          {form.ubicacion.length === 1 ? "" : "s"}
                        </span>
                      </legend>
                      <div className="activity-campus-picker__options">
                        {CAMPUS_ACTIVIDAD.map((campus) => {
                          const seleccionado = form.ubicacion.includes(campus);
                          return (
                            <label
                              className={`activity-campus-picker__option${seleccionado ? " is-selected" : ""}`}
                              key={campus}
                            >
                              <input
                                type="checkbox"
                                checked={seleccionado}
                                aria-label={campus}
                                onChange={(event) =>
                                  update(
                                    "ubicacion",
                                    event.target.checked
                                      ? [...form.ubicacion, campus]
                                      : form.ubicacion.filter(
                                          (item) => item !== campus,
                                        ),
                                  )
                                }
                              />
                              <span className="activity-campus-picker__campus-icon">
                                <i
                                  className="fas fa-building"
                                  aria-hidden="true"
                                ></i>
                              </span>
                              <span className="activity-campus-picker__campus-copy">
                                <strong>{campus}</strong>
                                <small>Sede universitaria</small>
                              </span>
                              <span className="activity-campus-picker__check">
                                <i
                                  className="fas fa-check"
                                  aria-hidden="true"
                                ></i>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <p className="activity-campus-picker__selection">
                        <i
                          className={`fas ${form.ubicacion.length ? "fa-circle-check" : "fa-circle-info"}`}
                          aria-hidden="true"
                        ></i>
                        {form.ubicacion.length
                          ? `Se realizará en: ${form.ubicacion.join(", ")}`
                          : "Elige al menos una sede para continuar."}
                      </p>
                    </fieldset>
                  </div>
                </section>

                <section className="activity-form-section">
                  <div className="activity-form-section__heading">
                    <span className="activity-form-section__icon">
                      <i className="fas fa-align-left" aria-hidden="true"></i>
                    </span>
                    <span>
                      <h3>Descripción</h3>
                      <p>
                        Agrega información adicional para contextualizar la
                        actividad.
                      </p>
                    </span>
                    <span className="activity-form-optional">Opcional</span>
                  </div>
                  <textarea
                    className="form-control activity-form-description"
                    id="activity-description"
                    aria-label="Descripción de la actividad"
                    value={form.descripcion}
                    onChange={(event) =>
                      update("descripcion", event.target.value)
                    }
                    rows={3}
                    placeholder="Describe brevemente el propósito o los detalles de la actividad."
                  />
                </section>
              </div>
              <div className="activity-form-footer">
                {error && (
                  <div className="auth-error" role="alert">
                    {error}
                  </div>
                )}
                <div className="activity-form-footer__actions">
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => setForm(null)}
                    disabled={guardando}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn btn-primary activity-form-submit"
                    type="submit"
                    disabled={guardando}
                  >
                    <i
                      className={`fas ${guardando ? "fa-spinner fa-spin" : "fa-check"}`}
                      aria-hidden="true"
                    ></i>
                    {guardando
                      ? "Guardando…"
                      : form.idEventoExistente
                        ? "Guardar cambios"
                        : "Crear actividad"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </Modal>
      )}

      {confirmacionEliminacionMasiva && (
        <Modal
          title="Eliminar actividades seleccionadas"
          subtitle="Confirma el alcance antes de continuar."
          onClose={() => {
            if (!eliminandoActividades) {
              setConfirmacionEliminacionMasiva(false);
              setErrorEliminacionMasiva("");
            }
          }}
        >
          <section className="activity-bulk-confirm">
            <div className="activity-bulk-confirm__warning">
              <span className="activity-bulk-confirm__icon" aria-hidden="true">
                <i className="fas fa-triangle-exclamation"></i>
              </span>
              <div>
                <strong>
                  Se eliminarán permanentemente{" "}
                  {actividadesSeleccionadasVisibles.length} actividades
                </strong>
                <p>
                  También se borrarán {participantesSeleccionados} inscripciones
                  y las modalidades asociadas. Los
                  perfiles personales y estudiantiles no se eliminarán. Esta
                  acción no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="activity-bulk-confirm__list">
              <strong>Actividades incluidas</strong>
              <ul>
                {actividadesSeleccionadasVisibles.slice(0, 6).map((activity) => (
                  <li key={activity.id}>
                    <span>{activity.actividad || "Actividad sin nombre"}</span>
                    <small>
                      {activity.periodo || "Sin periodo"} ·{" "}
                      {Number(activity.totalParticipantes || 0)} inscripciones
                    </small>
                  </li>
                ))}
              </ul>
              {actividadesSeleccionadasVisibles.length > 6 && (
                <small>
                  Y {actividadesSeleccionadasVisibles.length - 6} actividades
                  más.
                </small>
              )}
            </div>
            {errorEliminacionMasiva && (
              <div className="auth-error" role="alert">
                {errorEliminacionMasiva}
              </div>
            )}
            <div className="activity-bulk-confirm__actions">
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => {
                  setConfirmacionEliminacionMasiva(false);
                  setErrorEliminacionMasiva("");
                }}
                disabled={eliminandoActividades}
              >
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={deleteSelectedActivities}
                disabled={
                  eliminandoActividades ||
                  actividadesSeleccionadasVisibles.length === 0
                }
              >
                <i
                  className={`fas ${eliminandoActividades ? "fa-spinner fa-spin" : "fa-trash-can"}`}
                  aria-hidden="true"
                ></i>
                {eliminandoActividades
                  ? "Eliminando…"
                  : `Eliminar ${actividadesSeleccionadasVisibles.length} actividades`}
              </button>
            </div>
          </section>
        </Modal>
      )}

      {participantes && (
        <Modal
          title="Participantes de la actividad"
          subtitle={participantes.actividad || "Actividad"}
          onClose={() => setParticipantes(null)}
          wide
        >
          <section className="card activity-modal__card activity-participants-card">
            <div className="activity-participants-heading">
              <div>
                <span className="activity-admin__eyebrow">
                  GESTIÓN DE ASISTENTES
                </span>
                <h2>Personas inscritas</h2>
                <p>
                  Consulta el programa o modalidad elegida, el apoyo asignado y
                  administra las inscripciones.
                </p>
              </div>
              {!participantes.cargando && !participantes.error && (
                <span className="activity-participants-count">
                  <i className="fas fa-users" aria-hidden="true"></i>
                  {participantes.filas.length}{" "}
                  {participantes.filas.length === 1
                    ? "participante"
                    : "participantes"}
                </span>
              )}
            </div>
            {participantes.aviso && (
              <div className="autosave-banner" role="status">
                {participantes.aviso}
              </div>
            )}
            {errorEliminacionInscripcion && (
              <div className="auth-error" role="alert">
                {errorEliminacionInscripcion}
              </div>
            )}
            {confirmacionEliminacion && (
              <div className="activity-delete-confirm" role="alert">
                <span className="activity-delete-confirm__icon">
                  <i
                    className="fas fa-triangle-exclamation"
                    aria-hidden="true"
                  ></i>
                </span>
                <div className="activity-delete-confirm__copy">
                  <strong>
                    ¿Eliminar a{" "}
                    {confirmacionEliminacion.apellidosNombres ||
                      confirmacionEliminacion.identificacion}
                    ?
                  </strong>
                  {confirmacionEliminacion.roles?.includes("ESTUDIANTE") ? (
                    <p>
                      Solo se quitará de esta actividad. Su perfil de estudiante
                      y sus datos institucionales se conservarán.
                    </p>
                  ) : (
                    <p>
                      Se quitará de esta actividad. Si no tiene otras
                      inscripciones, también se eliminará su perfil de este rol;
                      si las tiene, se conservará. Otros roles de la persona no
                      se eliminarán y los datos personales solo se borrarán si
                      no tienen otros vínculos. Esta acción no se puede
                      deshacer.
                    </p>
                  )}
                </div>
                <div className="activity-delete-confirm__actions">
                  <button
                    className="btn btn-outline btn-sm"
                    type="button"
                    onClick={() => setConfirmacionEliminacion(null)}
                    disabled={Boolean(eliminandoInscripcionId)}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    type="button"
                    onClick={() => removeParticipant(confirmacionEliminacion)}
                    disabled={Boolean(eliminandoInscripcionId)}
                  >
                    <i
                      className={`fas ${eliminandoInscripcionId ? "fa-spinner fa-spin" : "fa-trash-can"}`}
                      aria-hidden="true"
                    ></i>
                    {eliminandoInscripcionId ? "Eliminando…" : "Sí, eliminar"}
                  </button>
                </div>
              </div>
            )}
            {participantes.cargando ? (
              <div className="activity-participants-state" role="status">
                <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>
                <span>Cargando participantes...</span>
              </div>
            ) : participantes.error ? (
              <div className="auth-error" role="alert">
                {participantes.error}
              </div>
            ) : participantes.filas.length === 0 ? (
              <div className="activity-participants-empty">
                <span>
                  <i className="fas fa-user-group" aria-hidden="true"></i>
                </span>
                <strong>Aún no hay participantes</strong>
                <p>
                  Cuando se registren personas en esta actividad, aparecerán
                  aquí.
                </p>
              </div>
            ) : (
              <>
                <div className="activity-participants-toolbar">
                  <label className="activity-participants-search">
                    <i className="fas fa-search" aria-hidden="true"></i>
                    <input
                      type="search"
                      aria-label="Buscar participantes"
                      placeholder="Buscar por nombre, documento, rol, modalidad o apoyo"
                      value={busquedaParticipante}
                      onChange={(event) =>
                        setBusquedaParticipante(event.target.value)
                      }
                    />
                  </label>
                  <span
                    className="activity-participants-toolbar__count"
                    role="status"
                  >
                    {participantesFiltrados.length} de{" "}
                    {participantes.filas.length} participantes
                  </span>
                </div>
                {participantesFiltrados.length === 0 ? (
                  <div className="activity-participants-no-results">
                    No hay participantes que coincidan con la búsqueda.
                  </div>
                ) : (
                  <div className="table-responsive activity-participants-table-wrap">
                    <table className="table activity-participants-table">
                      <thead>
                        <tr>
                          <th>Persona</th>
                          <th>Rol</th>
                          <th>Programa / modalidad</th>
                          <th>Apoyo asignado</th>
                          <th className="activity-participants-table__actions-heading">
                            Administrar
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {participantesFiltrados.map((row) => (
                          <tr
                            className={
                              (row.roles || [row.rolParticipacion]).length > 1
                                ? "vec-multiple-roles"
                                : undefined
                            }
                            key={row.id}
                          >
                            <td data-label="Persona">
                              <div className="activity-participants-person">
                                <span
                                  className="activity-participants-person__avatar"
                                  aria-hidden="true"
                                >
                                  {(
                                    row.apellidosNombres ||
                                    row.identificacion ||
                                    "P"
                                  )
                                    .trim()
                                    .charAt(0)
                                    .toLocaleUpperCase("es")}
                                </span>
                                <span className="activity-participants-person__details">
                                  <span className="vec-multiple-roles__person">
                                    <strong>
                                      {row.apellidosNombres ||
                                        "Nombre no registrado"}
                                    </strong>
                                    {(row.roles || [row.rolParticipacion]).length > 1 && (
                                      <span
                                        className="vec-multiple-roles__badge"
                                        aria-label={`${row.roles.length} roles`}
                                        title={row.roles
                                          .map((role) => ETIQUETAS_ROL_PARTICIPANTE[role] || role)
                                          .join(" · ")}
                                      >
                                        <i className="fas fa-layer-group" aria-hidden="true"></i>
                                        {row.roles.length} roles
                                      </span>
                                    )}
                                  </span>
                                  <small>
                                    <i
                                      className="far fa-id-card"
                                      aria-hidden="true"
                                    ></i>
                                    {row.identificacion ||
                                      "Documento no registrado"}
                                  </small>
                                  {row.correo && (
                                    <small>
                                      <i
                                        className="far fa-envelope"
                                        aria-hidden="true"
                                      ></i>
                                      {row.correo}
                                    </small>
                                  )}
                                </span>
                              </div>
                            </td>
                            <td data-label="Rol">
                              {(() => {
                                const role = normalizarRolParticipante(row.rolParticipacion);
                                const otherRoles = (row.roles || [])
                                  .map(normalizarRolParticipante)
                                  .filter((otherRole) => otherRole !== role);
                                const multipleRoles = otherRoles.length > 0;
                                const label = ETIQUETAS_ROL_PARTICIPANTE[role]
                                  || row.detalleTipoParticipante
                                  || row.rolParticipacion
                                  || "Sin rol";
                                const renderRoleBadge = (roleValue, roleLabel) => (
                                  <span
                                    className={`activity-participants-role activity-participants-role--${roleValue.toLowerCase()}`}
                                  >
                                    <i
                                      className={`fas ${ICONOS_ROL_PARTICIPANTE[roleValue] || "fa-user"}`}
                                      aria-hidden="true"
                                    ></i>
                                    {roleLabel}
                                  </span>
                                );
                                return (
                                  <div
                                    className={`activity-participants-role-cell${multipleRoles ? " activity-participants-role-cell--multiple" : ""}`}
                                  >
                                    <div className="activity-participants-role-cell__primary">
                                      {multipleRoles && (
                                        <small className="activity-participants-role-cell__label">
                                          Rol principal
                                        </small>
                                      )}
                                      {renderRoleBadge(role, label)}
                                      {row.detalleTipoParticipante
                                        && row.detalleTipoParticipante !== label
                                        && role !== "COLABORADOR" && (
                                          <small className="activity-participants-role-cell__detail">
                                            {row.detalleTipoParticipante}
                                          </small>
                                        )}
                                    </div>
                                    {multipleRoles && (
                                      <div className="activity-participants-role-cell__other">
                                        <small className="activity-participants-role-cell__label">
                                          Rol adicional
                                        </small>
                                        <div className="activity-participants-role-cell__other-badges">
                                          {otherRoles.map((otherRole) => (
                                            <span key={otherRole}>
                                              {renderRoleBadge(
                                                otherRole,
                                                ETIQUETAS_ROL_PARTICIPANTE[otherRole] || otherRole,
                                              )}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td data-label="Programa / modalidad">
                              <span className="activity-participants-modality">
                                <strong>
                                  {row.programaBienestar ||
                                    "Sin programa de Bienestar"}
                                </strong>
                                <small>
                                  {row.programaModalidad ||
                                    "Modalidad no especificada"}
                                </small>
                              </span>
                            </td>
                            <td data-label="Apoyo asignado">
                              <span className="activity-participants-support">
                                <i
                                  className="fas fa-hand-holding-heart"
                                  aria-hidden="true"
                                ></i>
                                {row.tipoApoyo || "Sin clasificar"}
                              </span>
                              {row.tipoApoyoObservacion && (
                                <div
                                  className="activity-participants-support-note"
                                  role="note"
                                  aria-label="Observación sobre el tipo de apoyo"
                                >
                                  <strong>
                                    <i
                                      className="fas fa-triangle-exclamation"
                                      aria-hidden="true"
                                    ></i>
                                    Apoyo observado
                                  </strong>
                                  <span>
                                    “{row.tipoApoyoObservacion}” fue informado
                                    en el Excel y se guardó solo para esta
                                    inscripción porque no está en el catálogo
                                    de apoyos.
                                  </span>
                                </div>
                              )}
                            </td>
                            <td data-label="Administrar">
                              <div className="activity-participants-actions">
                                <button
                                  className="btn btn-outline btn-sm"
                                  type="button"
                                  onClick={() => showHistory(row)}
                                  title="Ver historial"
                                  aria-label={`Ver historial de ${row.apellidosNombres || row.identificacion}`}
                                >
                                  <i
                                    className="fas fa-clock-rotate-left"
                                    aria-hidden="true"
                                  ></i>
                                  <span>Historial</span>
                                </button>
                                <button
                                  className="btn btn-outline btn-sm"
                                  type="button"
                                  onClick={() =>
                                    setEdicionApoyo({
                                      id: row.id,
                                      persona: row.apellidosNombres,
                                      tipoActual:
                                        row.tipoApoyo || "Sin clasificar",
                                      idTipoApoyo: row.idTipoApoyo || "",
                                      motivo: "",
                                    })
                                  }
                                  title="Corregir tipo de apoyo"
                                  aria-label={`Corregir apoyo de ${row.apellidosNombres || row.identificacion}`}
                                >
                                  <i
                                    className="fas fa-sliders"
                                    aria-hidden="true"
                                  ></i>
                                  <span>Apoyo</span>
                                </button>
                                <button
                                  className="btn btn-danger btn-sm activity-participants-actions__delete"
                                  type="button"
                                  onClick={() =>
                                    setConfirmacionEliminacion(row)
                                  }
                                  disabled={Boolean(eliminandoInscripcionId)}
                                  title="Eliminar participante de esta actividad"
                                  aria-label={`Eliminar a ${row.apellidosNombres || row.identificacion} de esta actividad`}
                                >
                                  <i
                                    className="fas fa-trash-can"
                                    aria-hidden="true"
                                  ></i>
                                  <span>Eliminar</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        </Modal>
      )}
      {edicionApoyo && (
        <Modal
          title="Corregir tipo de apoyo"
          onClose={() => setEdicionApoyo(null)}
        >
          <section className="card activity-modal__card">
            <div className="card-header">
              <h2 className="card-title">Corregir tipo de apoyo</h2>
            </div>
            <p>
              <strong>{edicionApoyo.persona}</strong> · Tipo actual:{" "}
              {edicionApoyo.tipoActual}
            </p>
            <form onSubmit={saveSupportCorrection}>
              <div className="form-group">
                <label className="form-label" htmlFor="correction-support-type">
                  Tipo de apoyo correcto
                </label>
                <select
                  className="form-select"
                  id="correction-support-type"
                  value={edicionApoyo.idTipoApoyo}
                  onChange={(event) =>
                    setEdicionApoyo((current) => ({
                      ...current,
                      idTipoApoyo: event.target.value,
                    }))
                  }
                >
                  <option value="">Sin clasificar / no aplica</option>
                  {tiposApoyo.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label
                  className="form-label"
                  htmlFor="correction-support-reason"
                >
                  Motivo de la corrección
                </label>
                <textarea
                  className="form-control"
                  id="correction-support-reason"
                  value={edicionApoyo.motivo}
                  onChange={(event) =>
                    setEdicionApoyo((current) => ({
                      ...current,
                      motivo: event.target.value,
                    }))
                  }
                  minLength={5}
                  maxLength={500}
                  required
                  rows={3}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: ".5rem",
                }}
              >
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => setEdicionApoyo(null)}
                  disabled={guardandoApoyo}
                >
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={guardandoApoyo}
                >
                  {guardandoApoyo ? "Guardando…" : "Guardar corrección"}
                </button>
              </div>
            </form>
          </section>
        </Modal>
      )}
      {historial && (
        <Modal
          title="Historial de participación"
          onClose={() => setHistorial(null)}
          wide
        >
          <section className="card activity-modal__card">
            <div
              className="card-header"
              style={{ display: "flex", justifyContent: "space-between" }}
            >
              <h2 className="card-title">
                Historial de {historial.person.apellidosNombres}
              </h2>
              <button
                className="btn btn-outline btn-sm"
                type="button"
                onClick={() => setHistorial(null)}
              >
                Cerrar
              </button>
            </div>
            {historial.rows.length === 0 ? (
              <p className="text-muted">
                Esta persona todavía no tiene actividades.
              </p>
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Actividad</th>
                      <th>Periodo</th>
                      <th>Fecha</th>
                      <th>Estado</th>
                      <th>Rol</th>
                      <th>Apoyo</th>
                      <th>Asistencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.rows.map((row, index) => (
                      <tr key={`${row.idActividad}-${index}`}>
                        <td>{row.actividad}</td>
                        <td>{row.periodo}</td>
                        <td>
                          {String(row.fechaInicio).slice(0, 10)} –{" "}
                          {String(row.fechaFinalizacion).slice(0, 10)}
                        </td>
                        <td>{row.estado}</td>
                        <td>{row.rol}</td>
                        <td>{row.tipoApoyo || "—"}</td>
                        <td>
                          {row.asistenciaVerificada
                            ? "Verificada"
                            : "Pendiente"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </Modal>
      )}
    </>
  );
}
