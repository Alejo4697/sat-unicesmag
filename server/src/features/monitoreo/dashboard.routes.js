/* ==========================================================================
   Feature: Monitoreo (Tablero General - sección "Monitoreo" del menú)
   GET /api/dashboard                    -> estadísticas para el tablero general
   GET /api/dashboard/riesgo-dimensiones -> conteo de riesgo Alto/Medio/Bajo
                                             por dimensión, agregado de los
                                             envíos reales del instrumento de
                                             Caracterización (MOCK_DATA.caracterizaciones).

   En el mockup original (dashboard.js) este segundo gráfico usaba números
   fijos inventados en el propio JS. Acá se agregan de verdad los envíos
   que ya se guardaron - si todavía no hay ninguno, se responde con ceros
   en vez de inventar datos, y el cliente lo muestra como "aún sin datos".

   Segmentación por rol (misma filosofía que sanitizarIntervencion /
   sanitizarAlerta: el servidor decide qué ve cada quién, el cliente solo
   pinta lo que recibe). El payload trae un campo `vista` que le dice al
   cliente qué forma tiene:
     - admin                -> vista "institucional": los KPI globales +
                               ambas gráficas, igual que antes.
     - directivo            -> vista "programa": todo recortado a
                               req.user.programa (conteo de estudiantes,
                               alertas abiertas del programa y la
                               semaforización filtrada a ese programa).
     - profesional          -> vista "profesional": su bandeja de casos
                               (intervenciones que atendió + remisiones
                               asignadas), con RNF01 aplicado.
     - reporte_actividades  -> vista "actividades-pendiente": sin datos de
                               permanencia; su tablero está por definir con
                               el dueño de producto.
     - cualquier otro rol   -> vista "no-configurada": aviso neutro. NO se
                               cae a "institucional" para no exponer los KPI
                               globales a un rol no contemplado.
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";
import { sanitizarIntervencion } from "../../shared/security/vbg.js";

const router = Router();

router.use(identifyUser, requireModule("dashboard"));

// Estudiantes de un programa académico concreto (para la vista "directivo").
function estudiantesDePrograma(programa) {
  return MOCK_DATA.estudiantes.filter((e) => e.programa === programa);
}

// Agrega el conteo de riesgo Alto/Medio/Bajo por dimensión de una lista de
// envíos del instrumento. Se factorizó para poder reusarla tanto con todos
// los envíos (admin) como con los de un solo programa (directivo).
function agregarRiesgoPorDimension(envios) {
  const conteos = {}; // { IND: { Alto: 0, Medio: 0, Bajo: 0 }, ... }
  envios.forEach((envio) => {
    Object.entries(envio.porDimension).forEach(([dim, val]) => {
      if (!conteos[dim]) conteos[dim] = { Alto: 0, Medio: 0, Bajo: 0 };
      conteos[dim][val.riesgo] += 1;
    });
  });
  return conteos;
}

router.get("/", (req, res) => {
  const { rol, nombre, programa } = req.user;
  const periodoActual = MOCK_DATA.dashboardStats.periodoActual;

  // ---- Directivo: todo recortado a su programa ---------------------------
  if (rol === "directivo") {
    const alumnos = estudiantesDePrograma(programa);
    const encuestados = alumnos.filter((e) => e.encuestaRespondida).length;
    const alertasAbiertas = MOCK_DATA.alertas.filter(
      (a) => a.programa === programa && a.estado !== "Cerrada"
    ).length;

    return res.json({
      vista: "programa",
      periodoActual,
      programa,
      kpis: {
        estudiantesPrograma: alumnos.length,
        encuestadosPrograma: encuestados,
        faltantesPrograma: alumnos.length - encuestados,
        riesgoAltoPrograma: alumnos.filter((e) => e.riesgoGlobal === "Alto").length,
        alertasAbiertasPrograma: alertasAbiertas
      }
    });
  }

  // ---- Profesional: su bandeja de casos --------------------------------
  if (rol === "profesional") {
    const misIntervenciones = MOCK_DATA.intervenciones
      .filter((i) => i.atendidoPor === nombre)
      .map((i) => sanitizarIntervencion(i, req.user));
    const misRemisiones = MOCK_DATA.remisiones.filter((r) => r.profesionalAsignado === nombre);

    return res.json({
      vista: "profesional",
      periodoActual,
      usuario: nombre,
      misIntervenciones,
      misRemisiones,
      resumen: {
        intervencionesTotal: misIntervenciones.length,
        intervencionesAbiertas: misIntervenciones.filter((i) => !i.cerrado).length,
        remisionesTotal: misRemisiones.length,
        remisionesPendientes: misRemisiones.filter((r) => r.estado !== "Atendida").length
      }
    });
  }

  // ---- Reporte de actividades: tablero por definir ---------------------
  if (rol === "reporte_actividades") {
    return res.json({
      vista: "actividades-pendiente",
      periodoActual,
      mensaje:
        "El tablero de actividades para este rol aún no está definido. " +
        "Su alcance (qué indicadores de actividades registradas mostrar) se " +
        "debe acordar con el dueño de producto."
    });
  }

  // ---- Admin: vista institucional -------------------------------------
  // Se mantiene el payload de siempre, solo se le agrega el discriminador
  // `vista` para el cliente.
  if (rol === "admin") {
    return res.json({ vista: "institucional", ...MOCK_DATA.dashboardStats });
  }

  // ---- Cualquier otro rol con acceso al módulo pero sin vista propia --
  // NO se cae a "institucional" a propósito: eso expondría los KPI
  // institucionales completos a un rol no contemplado. Mismo tratamiento
  // neutro que "actividades-pendiente", con su propio mensaje.
  res.json({
    vista: "no-configurada",
    periodoActual,
    mensaje:
      "El Tablero General todavía no tiene una vista definida para tu rol. " +
      "Solicita al equipo del SAT que configure qué indicadores te corresponden."
  });
});

router.get("/riesgo-dimensiones", (req, res) => {
  const { rol, programa } = req.user;

  let envios;
  if (rol === "directivo") {
    const codigos = new Set(estudiantesDePrograma(programa).map((e) => e.codigo));
    envios = MOCK_DATA.caracterizaciones.filter((c) => codigos.has(c.codigoEstudiante));
  } else if (rol === "admin") {
    envios = MOCK_DATA.caracterizaciones;
  } else {
    // profesional / reporte_actividades: esta gráfica no aplica a su vista.
    envios = [];
  }

  res.json({ dimensiones: agregarRiesgoPorDimension(envios), totalEnvios: envios.length });
});

export default router;
