import { MOCK_DATA } from "../../shared/menu/mockData.js";
import { sanitizarIntervencion } from "../../shared/seguridad/vbg.js";
import { esUsuarioRestringidoAPrograma, coincidePrograma } from "../../shared/seguridad/alcanceDirectivo.js";

const TODOS = "";

const estudiantePorCodigo = (codigo) => MOCK_DATA.estudiantes.find((e) => e.codigo === codigo) || null;

function datosEstudiante(estudiante, codigo) {
  return {
    codEstudiante: codigo,
    estudiante: estudiante ? `${estudiante.nombres} ${estudiante.apellidos}` : "",
    programa: estudiante?.programa || "",
    semestre: estudiante?.semestre ?? "",
    periodo: estudiante?.periodo || ""
  };
}

function filtroDesdeQuery(query, user) {
  const periodo = (query.periodo || TODOS).trim();
  let programa = (query.programa || TODOS).trim();
  const semestre = (query.semestre || TODOS).trim();
  const nivelRiesgo = (query.nivelRiesgo || TODOS).trim();

  const esRestringido = esUsuarioRestringidoAPrograma(user);
  if (esRestringido && user?.programa) {
    programa = user.programa;
  }

  const hayFiltros = !!(periodo || programa || semestre || nivelRiesgo);

  return (estudiante) => {
    if (!estudiante) return !hayFiltros;
    if (esRestringido && user?.programa && !coincidePrograma(estudiante.programa, user.programa)) {
      return false;
    }
    if (periodo && estudiante.periodo !== periodo) return false;
    if (programa && !coincidePrograma(estudiante.programa, programa)) return false;
    if (semestre && String(estudiante.semestre) !== semestre) return false;
    if (nivelRiesgo && estudiante.riesgoGlobal !== nivelRiesgo) return false;
    return true;
  };
}

const unicos = (valores) => [...new Set(valores.filter((v) => v !== undefined && v !== null && v !== ""))];

export async function obtenerResumen() {
  return {
    dashboardStats: MOCK_DATA.dashboardStats,
    totalAlertas: MOCK_DATA.alertas.length,
    totalIntervenciones: MOCK_DATA.intervenciones.length,
    totalRemisiones: MOCK_DATA.remisiones.length
  };
}

export async function obtenerFiltros(user) {
  const est = MOCK_DATA.estudiantes;
  const esRestringido = esUsuarioRestringidoAPrograma(user);
  const programasDisponibles = esRestringido && user?.programa
    ? [user.programa]
    : unicos(est.map((e) => e.programa)).sort();

  return {
    periodos: unicos(est.map((e) => e.periodo)).sort().reverse(),
    programas: programasDisponibles,
    semestres: unicos(est.map((e) => e.semestre)).sort((a, b) => a - b),
    nivelesRiesgo: ["Muy Alto", "Alto", "Medio", "Bajo"].filter((n) =>
      est.some((e) => e.riesgoGlobal === n)
    )
  };
}

export async function exportarSnies(query, user) {
  const pasa = filtroDesdeQuery(query, user);
  return MOCK_DATA.estudiantes.filter(pasa).map((e) => ({
    codigoIES: 1728,
    periodo: e.periodo,
    codEstudiante: e.codigo,
    documento: e.documento,
    estudiante: `${e.nombres} ${e.apellidos}`,
    programa: e.programa,
    semestre: e.semestre,
    nivelRiesgo: e.riesgoGlobal,
    totalIntervenciones: MOCK_DATA.intervenciones.filter((i) => i.codigoEstudiante === e.codigo).length,
    totalRemisiones: MOCK_DATA.remisiones.filter((r) => r.codigoEstudiante === e.codigo).length,
    encuestaRespondida: e.encuestaRespondida ? "SI" : "NO",
    estadoPermanencia: "Activo"
  }));
}

export async function exportarIntervenciones(query, user) {
  const pasa = filtroDesdeQuery(query, user);
  return MOCK_DATA.intervenciones
    .map((i) => ({ i, e: estudiantePorCodigo(i.codigoEstudiante) }))
    .filter(({ e }) => pasa(e))
    .map(({ i, e }) => {
      const sanitizada = sanitizarIntervencion(i, user);
      return {
        idIntervencion: i.id,
        ...datosEstudiante(e, i.codigoEstudiante),
        nivelRiesgo: e?.riesgoGlobal || "",
        tipoIntervencion: i.tipoIntervencion || "",
        motivo: sanitizada.motivo || "",
        atendidoPor: i.atendidoPor,
        cargo: i.cargoAtendio,
        fecha: i.fecha,
        sensibleVBG: i.esSensibleVBG ? "SI" : "NO",
        estado: i.cerrado ? "Cerrada" : "Abierta"
      };
    });
}

export async function exportarRemisiones(query, user) {
  const pasa = filtroDesdeQuery(query, user);
  return MOCK_DATA.remisiones
    .map((r) => ({ r, e: estudiantePorCodigo(r.codigoEstudiante) }))
    .filter(({ e }) => pasa(e))
    .map(({ r, e }) => ({
      idRemision: r.id,
      ...datosEstudiante(e, r.codigoEstudiante),
      tipoApoyo: r.tipoApoyo || "",
      lineaAccion: r.lineaAccion || "",
      componente: r.componente || "",
      programaBienestar: r.programa || "",
      proyecto: r.proyecto || "",
      areaDestino: r.areaDestino,
      profesionalAsignado: r.profesionalAsignado,
      remitidoPor: r.remitidoPor,
      nivelRiesgo: r.nivelRiesgo,
      estado: r.estado,
      escalado48h: r.escalado48h ? "SI" : "NO",
      fecha: r.fechaRemision
    }));
}
