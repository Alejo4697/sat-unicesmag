/* ==========================================================================
   Feature: Reportes y Exportación / SNIES (RQF13/RQF21)
   GET /api/reportes             -> resumen numérico para la pantalla de reportes
   GET /api/reportes/snies       -> filas para el consolidado SNIES/MEN
   GET /api/reportes/intervenciones -> filas para el histórico de intervenciones
   GET /api/reportes/remisiones     -> filas para el histórico de remisiones

   Estos 3 últimos leen directo de MOCK_DATA (igual que export.js leía
   directo de window.SAT_STATE.getData()) en vez de llamar a las rutas de
   las otras features: "Reportes" es su propio contexto de lectura, con su
   propio permiso ("reportes"), independiente de si ese rol también tiene
   acceso a Ficha 360°, Alertas, Intervenciones o Remisiones.
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";

const router = Router();

router.use(identifyUser, requireModule("reportes"));

router.get("/", (req, res) => {
  res.json({
    dashboardStats: MOCK_DATA.dashboardStats,
    totalAlertas: MOCK_DATA.alertas.length,
    totalIntervenciones: MOCK_DATA.intervenciones.length,
    totalRemisiones: MOCK_DATA.remisiones.length
  });
});

router.get("/snies", (req, res) => {
  const filas = MOCK_DATA.estudiantes.map((e) => ({
    codigoIES: 1728,
    periodo: "2025-2",
    codEstudiante: e.codigo,
    documento: e.documento,
    programa: e.programa,
    semestre: e.semestre,
    nivelRiesgo: e.riesgoGlobal,
    totalIntervenciones: MOCK_DATA.intervenciones.filter((i) => i.codigoEstudiante === e.codigo).length,
    estadoPermanencia: "Activo"
  }));
  res.json(filas);
});

router.get("/intervenciones", (req, res) => {
  // TODO: este CSV no incluye todavía el tipo de intervención
  // (`i.tipoIntervencion`, catálogo sat.tipos_intervencion). Falta sumar esa
  // columna acá y evaluar si el consolidado SNIES/MEN también la necesita.
  const filas = MOCK_DATA.intervenciones.map((i) => ({
    idIntervencion: i.id,
    codEstudiante: i.codigoEstudiante,
    atendidoPor: i.atendidoPor,
    cargo: i.cargoAtendio,
    fecha: i.fecha,
    sensibleVBG: i.esSensibleVBG ? "SI" : "NO",
    estado: i.cerrado ? "Cerrada" : "Abierta"
  }));
  res.json(filas);
});

router.get("/remisiones", (req, res) => {
  const filas = MOCK_DATA.remisiones.map((r) => ({
    idRemision: r.id,
    codEstudiante: r.codigoEstudiante,
    remitidoPor: r.remitidoPor,
    areaDestino: r.areaDestino,
    nivelRiesgo: r.nivelRiesgo,
    estado: r.estado,
    fecha: r.fechaRemision
  }));
  res.json(filas);
});

export default router;
