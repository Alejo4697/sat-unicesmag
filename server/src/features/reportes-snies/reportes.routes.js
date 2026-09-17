/* ==========================================================================
   Feature: Reportes y Exportación / SNIES (RQF13/RQF21)
   GET /api/reportes                -> resumen numérico para la pantalla
   GET /api/reportes/filtros        -> opciones de los filtros (periodo,
                                       programa, semestre, nivel de riesgo)
   GET /api/reportes/snies          -> filas del consolidado SNIES/MEN
   GET /api/reportes/intervenciones -> filas del histórico de intervenciones
   GET /api/reportes/remisiones     -> filas del histórico de remisiones

   Estos 3 últimos leen directo de MOCK_DATA (igual que export.js leía
   directo de window.SAT_STATE.getData()) en vez de llamar a las rutas de
   las otras features: "Reportes" es su propio contexto de lectura, con su
   propio permiso ("reportes"), independiente de si ese rol también tiene
   acceso a Ficha 360°, Alertas, Intervenciones o Remisiones.
   ==========================================================================
   FILTROS (RQF13): los 3 listados aceptan ?periodo=&programa=&semestre=
   &nivelRiesgo=. Antes la barra de filtros de la pantalla era decorativa;
   ahora recorta de verdad lo exportado. El filtro se resuelve SIEMPRE
   contra el estudiante dueño de la fila (MOCK_DATA.estudiantes), que es
   quien tiene programa, semestre, periodo y riesgo global.

   Las filas además vienen ENRIQUECIDAS con los datos del estudiante
   (nombre, programa, semestre, periodo) para que el CSV se entienda sin
   tener que cruzarlo a mano con otra hoja.
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";

const router = Router();

router.use(identifyUser, requireModule("reportes"));

const TODOS = ""; // valor que envía el cliente cuando no filtra

const estudiantePorCodigo = (codigo) => MOCK_DATA.estudiantes.find((e) => e.codigo === codigo) || null;

// Datos del estudiante que se repiten en los 3 reportes.
function datosEstudiante(estudiante, codigo) {
  return {
    codEstudiante: codigo,
    estudiante: estudiante ? `${estudiante.nombres} ${estudiante.apellidos}` : "",
    programa: estudiante?.programa || "",
    semestre: estudiante?.semestre ?? "",
    periodo: estudiante?.periodo || ""
  };
}

/**
 * Construye el predicado de filtrado a partir del query string.
 * Una fila sin estudiante identificable solo pasa si no hay filtros.
 */
function filtroDesdeQuery(query) {
  const periodo = (query.periodo || TODOS).trim();
  const programa = (query.programa || TODOS).trim();
  const semestre = (query.semestre || TODOS).trim();
  const nivelRiesgo = (query.nivelRiesgo || TODOS).trim();
  const hayFiltros = !!(periodo || programa || semestre || nivelRiesgo);

  return (estudiante) => {
    if (!estudiante) return !hayFiltros;
    if (periodo && estudiante.periodo !== periodo) return false;
    if (programa && estudiante.programa !== programa) return false;
    if (semestre && String(estudiante.semestre) !== semestre) return false;
    if (nivelRiesgo && estudiante.riesgoGlobal !== nivelRiesgo) return false;
    return true;
  };
}

const unicos = (valores) => [...new Set(valores.filter((v) => v !== undefined && v !== null && v !== ""))];

router.get("/", (req, res) => {
  res.json({
    dashboardStats: MOCK_DATA.dashboardStats,
    totalAlertas: MOCK_DATA.alertas.length,
    totalIntervenciones: MOCK_DATA.intervenciones.length,
    totalRemisiones: MOCK_DATA.remisiones.length
  });
});

// Opciones reales de la barra de filtros (antes estaban quemadas en el JSX).
router.get("/filtros", (req, res) => {
  const est = MOCK_DATA.estudiantes;
  res.json({
    periodos: unicos(est.map((e) => e.periodo)).sort().reverse(),
    programas: unicos(est.map((e) => e.programa)).sort(),
    semestres: unicos(est.map((e) => e.semestre)).sort((a, b) => a - b),
    nivelesRiesgo: ["Muy Alto", "Alto", "Medio", "Bajo"].filter((n) =>
      est.some((e) => e.riesgoGlobal === n)
    )
  });
});

router.get("/snies", (req, res) => {
  const pasa = filtroDesdeQuery(req.query);
  const filas = MOCK_DATA.estudiantes.filter(pasa).map((e) => ({
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
  res.json(filas);
});

router.get("/intervenciones", (req, res) => {
  const pasa = filtroDesdeQuery(req.query);
  const filas = MOCK_DATA.intervenciones
    .map((i) => ({ i, e: estudiantePorCodigo(i.codigoEstudiante) }))
    .filter(({ e }) => pasa(e))
    .map(({ i, e }) => ({
      idIntervencion: i.id,
      ...datosEstudiante(e, i.codigoEstudiante),
      nivelRiesgo: e?.riesgoGlobal || "",
      tipoIntervencion: i.tipoIntervencion || "",
      motivo: i.motivo || "",
      atendidoPor: i.atendidoPor,
      cargo: i.cargoAtendio,
      fecha: i.fecha,
      sensibleVBG: i.esSensibleVBG ? "SI" : "NO",
      estado: i.cerrado ? "Cerrada" : "Abierta"
    }));
  res.json(filas);
});

router.get("/remisiones", (req, res) => {
  const pasa = filtroDesdeQuery(req.query);
  const filas = MOCK_DATA.remisiones
    .map((r) => ({ r, e: estudiantePorCodigo(r.codigoEstudiante) }))
    .filter(({ e }) => pasa(e))
    .map(({ r, e }) => ({
      idRemision: r.id,
      ...datosEstudiante(e, r.codigoEstudiante),
      // Matriz de Bienestar (vacío en remisiones directas a un área).
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
  res.json(filas);
});

export default router;
