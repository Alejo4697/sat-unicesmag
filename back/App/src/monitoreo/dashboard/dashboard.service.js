import { MOCK_DATA } from "../../shared/menu/mockData.js";
import { sanitizarIntervencion } from "../../shared/seguridad/vbg.js";
import { query } from "../../../../database/pool.js";

// Obtiene la lista completa de estudiantes combinando la Base de Datos PostgreSQL y MOCK_DATA
export async function obtenerEstudiantesCombinados() {
  let estudiantes = [];

  try {
    const { rows } = await query(`
      SELECT e.id_estudiantes AS id,
             e.codigo_externo AS codigo,
             COALESCE(per.numero_identificacion, e.numero_documento) AS documento,
             COALESCE(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre), e.nombres) AS nombres,
             COALESCE(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido), e.apellidos) AS apellidos,
             COALESCE(m.semestre, e.semestre_actual, 1) AS semestre,
             COALESCE(p.nombre, 'Programa Institucional') AS programa,
             COALESCE(rr.nombre, 'Sin evaluar') AS "riesgoGlobal",
             EXISTS(SELECT 1 FROM sat.respuestas_caracterizacion rc WHERE rc.id_estudiantes = e.id_estudiantes) AS "encuestaRespondida"
      FROM sat.estudiantes e
      LEFT JOIN sat.personas per ON per.id = e.id_personas
      LEFT JOIN LATERAL (
        SELECT m_lat.*
        FROM sat.matriculas m_lat
        LEFT JOIN sat.periodos_academicos pa_lat ON pa_lat.id_periodos_academicos = m_lat.id_periodos_academicos
        WHERE m_lat.id_estudiantes = e.id_estudiantes
        ORDER BY pa_lat.fecha_inicio DESC NULLS LAST, m_lat.semestre DESC
        LIMIT 1
      ) m ON true
      LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos = COALESCE(m.id_programas_academicos, e.id_programas_academicos)
      LEFT JOIN LATERAL (
        SELECT cr_1.id_rangos_riesgo
        FROM sat.calificaciones_riesgo cr_1
        WHERE cr_1.id_estudiantes = e.id_estudiantes AND cr_1.vigente = true
        ORDER BY cr_1.calculado_en DESC LIMIT 1
      ) cr ON true
      LEFT JOIN sat.rangos_riesgo rr ON rr.id_rangos_riesgo = cr.id_rangos_riesgo
    `);
    estudiantes = rows.map((r) => {
      let riesgo = r.riesgoGlobal;
      if (riesgo === "ALTO") riesgo = "Alto";
      else if (riesgo === "MEDIO") riesgo = "Medio";
      else if (riesgo === "BAJO") riesgo = "Bajo";

      return {
        id: r.id,
        codigo: r.codigo,
        documento: r.documento,
        nombres: r.nombres,
        apellidos: r.apellidos,
        semestre: Number(r.semestre) || 1,
        programa: r.programa,
        riesgoGlobal: riesgo,
        encuestaRespondida: Boolean(r.encuestaRespondida)
      };
    });
  } catch (err) {
    console.warn("Error al consultar sat.estudiantes para dashboard:", err.message);
  }

  // Complementar con MOCK_DATA
  const codigosExistentes = new Set(estudiantes.map((e) => e.codigo));
  MOCK_DATA.estudiantes.forEach((m) => {
    if (!codigosExistentes.has(m.codigo)) {
      estudiantes.push({
        id: `est_${m.codigo}`,
        codigo: m.codigo,
        documento: m.documento,
        nombres: m.nombres,
        apellidos: m.apellidos,
        semestre: Number(m.semestre) || 1,
        programa: m.programa,
        riesgoGlobal: m.riesgoGlobal || (m.encuestaRespondida ? "Medio" : "Sin evaluar"),
        encuestaRespondida: Boolean(m.encuestaRespondida)
      });
    }
  });

  return estudiantes;
}

// Obtiene la agregación de dimensiones de riesgo combinando DB y MOCK_DATA
export async function obtenerDimensionesAgregadas(programa = null) {
  const dimensiones = {
    IND: { Alto: 0, Medio: 0, Bajo: 0 },
    INS: { Alto: 0, Medio: 0, Bajo: 0 },
    ACA: { Alto: 0, Medio: 0, Bajo: 0 },
    SOC: { Alto: 0, Medio: 0, Bajo: 0 },
    GEST_PROG: { Alto: 0, Medio: 0, Bajo: 0 }
  };
  let totalEnvios = 0;

  try {
    let sql = `
      SELECT cr.id_calificaciones_riesgo, cr.id_estudiantes, cr.factores, rr.nombre AS riesgo_global, COALESCE(p.nombre, '') AS programa
      FROM sat.calificaciones_riesgo cr
      LEFT JOIN sat.estudiantes e ON cr.id_estudiantes = e.id_estudiantes
      LEFT JOIN sat.programas_academicos p ON e.id_programas_academicos = p.id_programas_academicos
      LEFT JOIN sat.rangos_riesgo rr ON rr.id_rangos_riesgo = cr.id_rangos_riesgo
      WHERE cr.vigente = true
    `;
    const params = [];
    if (programa && programa !== "Todos") {
      sql += ` AND LOWER(COALESCE(p.nombre, '')) = LOWER($1)`;
      params.push(programa);
    }

    const { rows: califRows } = await query(sql, params);

    califRows.forEach((c) => {
      let fact = typeof c.factores === "string" ? JSON.parse(c.factores) : c.factores || {};
      let dims = fact.dimensiones || fact.porDimension || {};
      let conto = false;
      Object.entries(dims).forEach(([dim, val]) => {
        const dimKey = dim === "GEST PROG" ? "GEST_PROG" : dim;
        if (dimensiones[dimKey] && val && val.riesgo) {
          const r =
            val.riesgo === "Alto" || val.riesgo === "ALTO"
              ? "Alto"
              : val.riesgo === "Bajo" || val.riesgo === "BAJO"
              ? "Bajo"
              : "Medio";
          dimensiones[dimKey][r] += 1;
          conto = true;
        }
      });
      if (conto) totalEnvios++;
    });
  } catch (err) {
    console.warn("Error agregando calificaciones de DB:", err.message);
  }

  // Complementar con MOCK_DATA.caracterizaciones
  const mockEnvios = !programa || programa === "Todos"
    ? MOCK_DATA.caracterizaciones
    : MOCK_DATA.caracterizaciones.filter((c) => {
        const est = MOCK_DATA.estudiantes.find((e) => e.codigo === c.codigoEstudiante);
        return est && est.programa.toLowerCase() === programa.toLowerCase();
      });

  mockEnvios.forEach((envio) => {
    if (envio.porDimension) {
      let conto = false;
      Object.entries(envio.porDimension).forEach(([dim, val]) => {
        const dimKey = dim === "GEST PROG" ? "GEST_PROG" : dim;
        if (dimensiones[dimKey] && val && val.riesgo) {
          const r =
            val.riesgo === "Alto" || val.riesgo === "ALTO"
              ? "Alto"
              : val.riesgo === "Bajo" || val.riesgo === "BAJO"
              ? "Bajo"
              : "Medio";
          dimensiones[dimKey][r] += 1;
          conto = true;
        }
      });
      if (conto) totalEnvios++;
    }
  });

  return { dimensiones, totalEnvios };
}

const DIAS_NOTIFICACION_INTERVENCION = 30;

export function normalizarTexto(valor) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function esPerfilDocenteAcompanante(cargo) {
  const c = normalizarTexto(cargo);
  if (c.includes("asistencial") || c.includes("psicolog")) return false;
  return (
    c.includes("docente") ||
    c.includes("acompana") ||
    c.includes("tutor") ||
    c.includes("tiempo completo") ||
    c.includes("medio tiempo") ||
    c.includes("catedra")
  );
}

export function esCoordinadorInstitucional(cargo) {
  const c = normalizarTexto(cargo);
  return c.includes("coordinador de acompanamiento") || c.includes("coordinadora de acompanamiento");
}

function programaDeEstudiante(codigo) {
  return MOCK_DATA.estudiantes.find((e) => e.codigo === codigo)?.programa || null;
}

const GRUPOS_AREA = [
  ["psicolog", "usp", "escucha", "salud mental"],
  ["goretti", "salud fisica", "atencion en salud"],
  ["enfermeria", "damian"],
  ["trabajo social", "padrino", "beca", "descuento", "unifamilia", "poliza", "subsidio"],
  ["pastoral", "espiritual"],
  ["paz", "convivencia", "bienestar interior"],
  ["inclusion", "diversidad", "reda", "discapacidad"],
  ["deporte", "cultura"],
  ["juridic", "consultorio"],
  ["tutor", "primer paso"],
  ["acompan", "vocacional"]
];

function coincideAreaProfesional(remision, user) {
  const nombre = normalizarTexto(user.nombre);
  const cargo = normalizarTexto(user.cargo);
  const dependencia = normalizarTexto(user.dependencia);
  const perfilUsuario = `${cargo} ${dependencia}`.trim();

  const profAsig = normalizarTexto(remision.profesionalAsignado);
  const remitido = normalizarTexto(remision.remitidoPor);
  const area = normalizarTexto(remision.areaDestino);
  const textoRemision = `${area} ${profAsig} ${normalizarTexto(remision.programa)} ${normalizarTexto(remision.proyecto)}`;

  if (nombre && ((profAsig && (profAsig.includes(nombre) || nombre.includes(profAsig))) || (remitido && remitido.includes(nombre)))) {
    return true;
  }
  if (dependencia && area && (area.includes(dependencia) || dependencia.includes(area))) {
    return true;
  }
  if (cargo && area && (area.includes(cargo) || cargo.includes(area))) {
    return true;
  }

  let usuarioTieneGrupoEspecifico = false;
  for (const palabras of GRUPOS_AREA) {
    const userEnGrupo = palabras.some((p) => perfilUsuario.includes(p));
    if (userEnGrupo) {
      usuarioTieneGrupoEspecifico = true;
      if (palabras.some((p) => textoRemision.includes(p))) {
        return true;
      }
    }
  }

  if (!usuarioTieneGrupoEspecifico) {
    const progUser = normalizarTexto(user.programa);
    if (progUser && progUser !== "todos" && progUser !== "no asignado") {
      const progEst = normalizarTexto(remision.programaEstudiante || programaDeEstudiante(remision.codigoEstudiante));
      return progEst.includes(progUser) || progUser.includes(progEst);
    }
    return true;
  }

  return false;
}

export async function obtenerBandejaCasos(user, { porPrograma }) {
  let remisiones = [];
  let intervenciones = [];

  try {
    const { rows } = await query(
      `SELECT * FROM (
         SELECT DISTINCT ON (r.id_remisiones)
                r.id_remisiones AS id,
                e.codigo_externo AS "codigoEstudiante",
                p.nombre AS "programaEstudiante",
                CONCAT(ur.nombres, ' ', ur.apellidos) AS "remitidoPor",
                d.nombre AS "areaDestino",
                CASE
                  WHEN r.id_usuarios_profesional IS NOT NULL AND r.id_usuarios_profesional <> r.id_usuarios_remitente
                    THEN CONCAT(up.nombres, ' ', up.apellidos)
                  ELSE COALESCE(d.nombre, 'Bandeja General / Por Asignar')
                END AS "profesionalAsignado",
                CASE WHEN r.escalada THEN 'Alto' ELSE 'Medio' END AS "nivelRiesgo",
                r.generada_en AS "fechaRemision",
                er.nombre AS estado
         FROM sat.remisiones r
         JOIN sat.casos c ON r.id_casos = c.id_casos
         JOIN sat.estudiantes e ON c.id_estudiantes = e.id_estudiantes
         LEFT JOIN sat.matriculas m ON m.id_estudiantes = e.id_estudiantes
         LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos = COALESCE(m.id_programas_academicos, e.id_programas_academicos)
         LEFT JOIN sat.dependencias d ON r.id_dependencias = d.id_dependencias
         LEFT JOIN sat.estados_remision er ON r.id_estados_remision = er.id_estados_remision
         LEFT JOIN sat.usuarios ur ON r.id_usuarios_remitente = ur.id_usuarios
         LEFT JOIN sat.usuarios up ON r.id_usuarios_profesional = up.id_usuarios
         ORDER BY r.id_remisiones, r.generada_en DESC
       ) sub
       ORDER BY sub."fechaRemision" DESC
       LIMIT 150`
    );
    const mockPorId = new Map(MOCK_DATA.remisiones.map((m) => [m.id, m]));
    remisiones = rows.map((r) => {
      const m = mockPorId.get(r.id);
      return m ? { ...m, ...r, profesionalAsignado: m.profesionalAsignado || r.profesionalAsignado, nivelRiesgo: m.nivelRiesgo || r.nivelRiesgo } : r;
    });
  } catch (err) {
    console.warn("Bandeja de casos: fallo al consultar remisiones:", err.message);
  }

  try {
    const { rows } = await query(
      `SELECT * FROM (
         SELECT DISTINCT ON (i.id_intervenciones)
                i.id_intervenciones AS id,
                e.codigo_externo AS "codigoEstudiante",
                p.nombre AS "programaEstudiante",
                CONCAT(u.nombres, ' ', u.apellidos) AS "atendidoPor",
                i.fecha_atencion AS fecha,
                i.creado_en AS "fechaRegistro",
                i.descripcion AS motivo,
                c.es_confidencialidad_especial AS "esSensibleVBG",
                COALESCE(i.estado, CASE WHEN i.cerrada_en IS NOT NULL THEN 'Atendida' ELSE 'Pendiente' END) AS estado,
                (LOWER(COALESCE(i.estado, '')) IN ('cerrada', 'atendida') OR i.cerrada_en IS NOT NULL) AS cerrado
         FROM sat.intervenciones i
         JOIN sat.casos c ON i.id_casos = c.id_casos
         JOIN sat.estudiantes e ON c.id_estudiantes = e.id_estudiantes
         LEFT JOIN sat.matriculas m ON m.id_estudiantes = e.id_estudiantes
         LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos = COALESCE(m.id_programas_academicos, e.id_programas_academicos)
         LEFT JOIN sat.usuarios u ON i.id_usuarios = u.id_usuarios
         ORDER BY i.id_intervenciones, i.fecha_atencion DESC
       ) sub
       ORDER BY sub.fecha DESC
       LIMIT 150`
    );
    intervenciones = rows;
  } catch (err) {
    console.warn("Bandeja de casos: fallo al consultar intervenciones:", err.message);
  }

  const idsRem = new Set(remisiones.map((r) => r.id));
  remisiones = [...remisiones, ...MOCK_DATA.remisiones.filter((r) => !idsRem.has(r.id))];
  const idsInt = new Set(intervenciones.map((i) => i.id));
  intervenciones = [...intervenciones, ...MOCK_DATA.intervenciones.filter((i) => !idsInt.has(i.id))];

  const nombre = normalizarTexto(user.nombre);
  const programaUsuario = normalizarTexto(user.programa);
  const tieneProgramaEspecifico =
    Boolean(programaUsuario) &&
    programaUsuario !== "todos" &&
    programaUsuario !== "no asignado" &&
    programaUsuario !== "programa institucional";

  let misRemisiones;
  let misIntervenciones;
  if (porPrograma) {
    if (!tieneProgramaEspecifico) {
      misRemisiones = remisiones;
      misIntervenciones = intervenciones;
    } else {
      misRemisiones = remisiones.filter((r) => {
        const progEst = normalizarTexto(r.programaEstudiante || programaDeEstudiante(r.codigoEstudiante));
        const coincideProg = progEst && (progEst.includes(programaUsuario) || programaUsuario.includes(progEst));
        return coincideProg || coincideAreaProfesional(r, user);
      });
      misIntervenciones = intervenciones.filter((i) => {
        const progEst = normalizarTexto(i.programaEstudiante || programaDeEstudiante(i.codigoEstudiante));
        const coincideProg = progEst && (progEst.includes(programaUsuario) || programaUsuario.includes(progEst));
        const coincideAutor = nombre && normalizarTexto(i.atendidoPor).includes(nombre);
        return coincideProg || coincideAutor;
      });
    }
  } else {
    misRemisiones = remisiones.filter((r) => coincideAreaProfesional(r, user));
    const codigosEstudiantesRemitidos = new Set(misRemisiones.map((r) => r.codigoEstudiante).filter(Boolean));
    misIntervenciones = intervenciones.filter((i) => {
      const coincideAutor = nombre && normalizarTexto(i.atendidoPor).includes(nombre);
      return coincideAutor || codigosEstudiantesRemitidos.has(i.codigoEstudiante);
    });
  }

  const remisionesPendientes = misRemisiones.filter((r) => r.estado !== "Atendida" && r.estado !== "Cerrada").length;
  const intervencionesAbiertas = misIntervenciones.filter((i) => {
    const est = String(i.estado || "").toLowerCase();
    return !i.cerrado && est !== "cerrada" && est !== "atendida";
  }).length;
  const intervencionesNotificadas = intervencionesAbiertas;

  return {
    misIntervenciones: misIntervenciones.map((i) => sanitizarIntervencion(i, user)),
    misRemisiones,
    resumen: {
      intervencionesTotal: misIntervenciones.length,
      intervencionesAbiertas,
      remisionesTotal: misRemisiones.length,
      remisionesPendientes
    },
    notificaciones: {
      remisiones: remisionesPendientes,
      intervenciones: intervencionesNotificadas,
      total: remisionesPendientes + intervencionesNotificadas
    }
  };
}

export async function obtenerDashboard(user) {
  const { rol, nombre, programa, cargo } = user;
  const esDocenteAcompanante = esPerfilDocenteAcompanante(cargo);
  const esAdmin = rol === "admin" && !esDocenteAcompanante;
  const esCoordinadorAcompanamiento = esCoordinadorInstitucional(cargo);
  const periodoActual = "2025 II";
  const estudiantes = await obtenerEstudiantesCombinados();

  if (esAdmin || (esCoordinadorAcompanamiento && !esDocenteAcompanante)) {
    const totalMatriculados = estudiantes.length;
    const encuestados = estudiantes.filter((e) => e.encuestaRespondida);
    const totalEncuestados = encuestados.length;
    const totalFaltantes = totalMatriculados - totalEncuestados;

    const distribucionRiesgo = {
      bajo: estudiantes.filter((e) => e.riesgoGlobal === "Bajo").length,
      medio: estudiantes.filter((e) => e.riesgoGlobal === "Medio").length,
      alto: estudiantes.filter((e) => e.riesgoGlobal === "Alto").length
    };

    const porSemestre = {
      semestre1: {
        total: estudiantes.filter((e) => e.semestre === 1).length,
        encuestados: estudiantes.filter((e) => e.semestre === 1 && e.encuestaRespondida).length,
        faltantes: estudiantes.filter((e) => e.semestre === 1 && !e.encuestaRespondida).length,
        riesgoAlto: estudiantes.filter((e) => e.semestre === 1 && e.riesgoGlobal === "Alto").length
      },
      semestre4: {
        total: estudiantes.filter((e) => e.semestre === 4).length,
        encuestados: estudiantes.filter((e) => e.semestre === 4 && e.encuestaRespondida).length,
        faltantes: estudiantes.filter((e) => e.semestre === 4 && !e.encuestaRespondida).length,
        riesgoAlto: estudiantes.filter((e) => e.semestre === 4 && e.riesgoGlobal === "Alto").length
      },
      semestre7: {
        total: estudiantes.filter((e) => e.semestre === 7).length,
        encuestados: estudiantes.filter((e) => e.semestre === 7 && e.encuestaRespondida).length,
        faltantes: estudiantes.filter((e) => e.semestre === 7 && !e.encuestaRespondida).length,
        riesgoAlto: estudiantes.filter((e) => e.semestre === 7 && e.riesgoGlobal === "Alto").length
      }
    };

    const bandejaInst = !esAdmin ? await obtenerBandejaCasos(user, { porPrograma: true }) : {};

    return {
      vista: "institucional",
      periodoActual,
      totalEstudiantesMatriculados: totalMatriculados,
      totalEncuestadosCaracterizacion: totalEncuestados,
      totalFaltantesCaracterizacion: totalFaltantes,
      distribucionRiesgo,
      porSemestre,
      ...bandejaInst
    };
  }

  if (rol === "directivo" || esDocenteAcompanante) {
    const tieneProg = programa && normalizarTexto(programa) !== "todos" && normalizarTexto(programa) !== "no asignado";
    const programaTarget = tieneProg ? programa : "Todos";
    const alumnos = tieneProg
      ? estudiantes.filter((e) => normalizarTexto(e.programa) === normalizarTexto(programaTarget))
      : estudiantes;
    const encuestados = alumnos.filter((e) => e.encuestaRespondida).length;
    const alertasAbiertas = MOCK_DATA.alertas.filter(
      (a) => (!tieneProg || normalizarTexto(a.programa) === normalizarTexto(programaTarget)) && a.estado !== "Cerrada"
    ).length;
    const bandejaPrograma = await obtenerBandejaCasos(user, { porPrograma: true });

    return {
      vista: "programa",
      periodoActual,
      programa: programaTarget,
      esDocenteAcompanante: Boolean(esDocenteAcompanante),
      kpis: {
        estudiantesPrograma: alumnos.length,
        encuestadosPrograma: encuestados,
        faltantesPrograma: alumnos.length - encuestados,
        riesgoAltoPrograma: alumnos.filter((e) => e.riesgoGlobal === "Alto").length,
        alertasAbiertasPrograma: alertasAbiertas
      },
      ...bandejaPrograma
    };
  }

  if (rol === "profesional") {
    const bandeja = await obtenerBandejaCasos(user, { porPrograma: false });
    return {
      vista: "profesional",
      periodoActual,
      usuario: nombre,
      ...bandeja
    };
  }

  const bandejaGeneral = await obtenerBandejaCasos(user, { porPrograma: true });
  return {
    vista: "profesional",
    periodoActual,
    usuario: nombre,
    ...bandejaGeneral
  };
}

export async function obtenerNotificaciones(user) {
  const { rol, cargo } = user;
  const vacio = { remisiones: 0, intervenciones: 0, total: 0 };
  const esDocenteAcompanante = esPerfilDocenteAcompanante(cargo);
  const esAdmin = rol === "admin" && !esDocenteAcompanante;
  if (esAdmin || rol === "estudiante") {
    return vacio;
  }
  const porPrograma = rol === "directivo" || esDocenteAcompanante || rol === "reporte_actividades";
  const bandeja = await obtenerBandejaCasos(user, { porPrograma });
  return bandeja.notificaciones;
}

export async function obtenerResultadosCaracterizacion(queryFilters, user) {
  const rol = user?.rol;
  const cargo = user?.cargo || "";
  const esDocenteAcompanante = esPerfilDocenteAcompanante(cargo);
  const esAdmin = rol === "admin" && !esDocenteAcompanante;
  const esCoordinador = esAdmin || esCoordinadorInstitucional(cargo);
  const esDirectivo = rol === "directivo";

  if (!esAdmin && !esCoordinador && !esDocenteAcompanante && !esDirectivo) {
    const error = new Error("Acceso denegado. Los resultados de la encuesta solo están autorizados para Administrador, Coordinador de Acompañamiento y Docente Acompañante.");
    error.status = 403;
    throw error;
  }

  const tieneProgramaFijo = Boolean(user?.programa) && normalizarTexto(user.programa) !== "todos" && normalizarTexto(user.programa) !== "no asignado";
  const esRestringido = (esDocenteAcompanante || esDirectivo) && !esCoordinador && !esAdmin && tieneProgramaFijo;
  const programaUsuario = tieneProgramaFijo ? user.programa : null;

  const filtroPeriodo = queryFilters.periodo || "todos";
  const filtroSemestre = queryFilters.semestre || "todos";
  const filtroCampo = queryFilters.campo || "todos";
  let filtroPrograma = queryFilters.programa || "todos";
  const busqueda = (queryFilters.q || "").trim().toLowerCase();

  if (esRestringido && programaUsuario) {
    filtroPrograma = programaUsuario;
  }

  let estudiantes = [];
  try {
    const { rows } = await query(`
      SELECT 
        e.id_estudiantes AS id,
        e.codigo_externo AS codigo,
        COALESCE(per.numero_identificacion, e.numero_documento) AS documento,
        COALESCE(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre), e.nombres) AS nombres,
        COALESCE(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido), e.apellidos) AS apellidos,
        COALESCE(m.semestre, e.semestre_actual, 1) AS semestre,
        COALESCE(p.nombre, 'Programa Institucional') AS programa,
        COALESCE(pa.nombre, '2025-2') AS periodo,
        rc.id_respuestas_caracterizacion,
        rc.creado_en AS fecha_encuesta,
        CASE WHEN rc.id_respuestas_caracterizacion IS NOT NULL THEN 'RESPONDIDA' ELSE 'PENDIENTE' END AS estado_encuesta,
        COALESCE(rr.nombre, 'Sin evaluar') AS riesgo_global,
        cr.puntaje_global,
        cr.factores
    FROM sat.estudiantes e
    LEFT JOIN sat.personas per ON per.id = e.id_personas
    LEFT JOIN LATERAL (
      SELECT m_lat.*
      FROM sat.matriculas m_lat
      LEFT JOIN sat.periodos_academicos pa_lat ON pa_lat.id_periodos_academicos = m_lat.id_periodos_academicos
      WHERE m_lat.id_estudiantes = e.id_estudiantes
      ORDER BY pa_lat.fecha_inicio DESC NULLS LAST, m_lat.semestre DESC
      LIMIT 1
    ) m ON true
      LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos = COALESCE(m.id_programas_academicos, e.id_programas_academicos)
      LEFT JOIN sat.respuestas_caracterizacion rc ON rc.id_estudiantes = e.id_estudiantes
      LEFT JOIN sat.periodos_academicos pa ON pa.id_periodos_academicos = rc.id_periodos_academicos
      LEFT JOIN LATERAL (
        SELECT cr_1.id_rangos_riesgo, cr_1.puntaje_global, cr_1.factores
        FROM sat.calificaciones_riesgo cr_1
        WHERE cr_1.id_estudiantes = e.id_estudiantes AND cr_1.vigente = true
        ORDER BY cr_1.calculado_en DESC LIMIT 1
      ) cr ON true
      LEFT JOIN sat.rangos_riesgo rr ON rr.id_rangos_riesgo = cr.id_rangos_riesgo
    `);

    estudiantes = rows.map((r) => {
      let factoresParsed = {};
      if (typeof r.factores === "string") {
        try { factoresParsed = JSON.parse(r.factores); } catch {}
      } else if (r.factores && typeof r.factores === "object") {
        factoresParsed = r.factores;
      }

      const porDim = factoresParsed.porDimension || factoresParsed.dimensiones || {};
      const tieneResp = r.estado_encuesta === "RESPONDIDA";

      const alertInd = porDim.IND?.riesgo || (tieneResp ? "Medio" : "N/A");
      const alertIns = porDim.INS?.riesgo || (tieneResp ? "Medio" : "N/A");
      const alertAca = porDim.ACA?.riesgo || (tieneResp ? "Medio" : "N/A");
      const alertSoc = porDim.SOC?.riesgo || (tieneResp ? "Medio" : "N/A");

      let riesgo = r.riesgo_global;
      if (riesgo === "ALTO") riesgo = "Alto";
      else if (riesgo === "MEDIO") riesgo = "Medio";
      else if (riesgo === "BAJO") riesgo = "Bajo";
      else if (!riesgo || riesgo === "Sin evaluar") riesgo = tieneResp ? "Medio" : "Sin evaluar";

      const nombreCompleto = `${r.nombres || ""} ${r.apellidos || ""}`.trim();
      const tieneAlerta = riesgo === "Alto" || riesgo === "Medio" ||
        alertInd === "Alto" || alertIns === "Alto" || alertAca === "Alto" || alertSoc === "Alto";

      return {
        id: r.id,
        codigo: r.codigo,
        documento: r.documento,
        nombres: r.nombres,
        apellidos: r.apellidos,
        nombreCompleto,
        semestre: Number(r.semestre) || 1,
        programa: r.programa,
        periodo: r.periodo,
        fechaEncuesta: r.fecha_encuesta,
        estadoEncuesta: r.estado_encuesta,
        riesgoGlobal: riesgo,
        puntajeGlobal: r.puntaje_global ? Number(r.puntaje_global) : null,
        alertaIndividual: alertInd,
        alertaAsistencial: alertIns,
        alertaAcademica: alertAca,
        alertaSocioeconomica: alertSoc,
        porDimension: porDim,
        tieneAlerta
      };
    });
  } catch (err) {
    console.warn("Fallo al consultar estudiantes para resultados de caracterización:", err.message);
  }

  const codigosExistentes = new Set(estudiantes.map((e) => e.codigo));
  MOCK_DATA.estudiantes.forEach((m) => {
    if (!codigosExistentes.has(m.codigo)) {
      const caracMock = MOCK_DATA.caracterizaciones.find((c) => c.codigoEstudiante === m.codigo);
      const porDim = caracMock?.porDimension || {};
      const tieneResp = Boolean(m.encuestaRespondida || caracMock);
      const riesgo = m.riesgoGlobal || (tieneResp ? "Medio" : "Sin evaluar");

      estudiantes.push({
        id: `est_${m.codigo}`,
        codigo: m.codigo,
        documento: m.documento,
        nombres: m.nombres,
        apellidos: m.apellidos,
        nombreCompleto: `${m.nombres || ""} ${m.apellidos || ""}`.trim(),
        semestre: Number(m.semestre) || 1,
        programa: m.programa,
        periodo: m.periodo || "2025 II",
        fechaEncuesta: caracMock?.fecha || null,
        estadoEncuesta: tieneResp ? "RESPONDIDA" : "PENDIENTE",
        riesgoGlobal: riesgo,
        puntajeGlobal: m.puntajeRiesgo || (caracMock ? caracMock.promedioGlobal * 25 : null),
        alertaIndividual: porDim.IND?.riesgo || (tieneResp ? "Medio" : "N/A"),
        alertaAsistencial: porDim.INS?.riesgo || (tieneResp ? "Medio" : "N/A"),
        alertaAcademica: porDim.ACA?.riesgo || (tieneResp ? "Medio" : "N/A"),
        alertaSocioeconomica: porDim.SOC?.riesgo || (tieneResp ? "Medio" : "N/A"),
        porDimension: porDim,
        tieneAlerta: riesgo === "Alto" || riesgo === "Medio"
      });
    }
  });

  const programasDisponibles = Array.from(
    new Set(estudiantes.map((e) => e.programa).filter(Boolean))
  ).sort();

  const periodosDisponibles = ["2026-1", "2025-2", "2025-1", "2024-2", "2023-II"];

  let filtrados = estudiantes;

  if (filtroPrograma && filtroPrograma !== "todos") {
    filtrados = filtrados.filter(
      (e) => e.programa.toLowerCase() === filtroPrograma.toLowerCase()
    );
  }

  if (filtroSemestre && filtroSemestre !== "todos") {
    const semNum = Number(filtroSemestre);
    filtrados = filtrados.filter((e) => e.semestre === semNum);
  }

  if (filtroPeriodo && filtroPeriodo !== "todos") {
    filtrados = filtrados.filter((e) => {
      const pNorm = String(e.periodo || "").replace(" II", "-2").replace(" I", "-1");
      const fNorm = String(filtroPeriodo).replace(" II", "-2").replace(" I", "-1");
      return pNorm.toLowerCase() === fNorm.toLowerCase() || e.estadoEncuesta === "PENDIENTE";
    });
  }

  if (filtroCampo && filtroCampo !== "todos") {
    filtrados = filtrados.filter((e) => {
      if (e.estadoEncuesta !== "RESPONDIDA") return false;
      if (filtroCampo === "IND") return e.alertaIndividual === "Alto" || e.alertaIndividual === "Medio";
      if (filtroCampo === "INS") return e.alertaAsistencial === "Alto" || e.alertaAsistencial === "Medio";
      if (filtroCampo === "ACA") return e.alertaAcademica === "Alto" || e.alertaAcademica === "Medio";
      if (filtroCampo === "SOC") return e.alertaSocioeconomica === "Alto" || e.alertaSocioeconomica === "Medio";
      return true;
    });
  }

  if (busqueda) {
    filtrados = filtrados.filter(
      (e) =>
        e.codigo?.toLowerCase().includes(busqueda) ||
        e.documento?.toLowerCase().includes(busqueda) ||
        e.nombreCompleto?.toLowerCase().includes(busqueda)
    );
  }

  const totalEstudiantes = filtrados.length;
  const encuestados = filtrados.filter((e) => e.estadoEncuesta === "RESPONDIDA").length;
  const faltantes = totalEstudiantes - encuestados;
  const porcentajeAvance = totalEstudiantes > 0 ? Number(((encuestados / totalEstudiantes) * 100).toFixed(1)) : 0;
  const alertasPermanencia = filtrados.filter((e) => e.tieneAlerta).length;

  const distribucionRiesgo = {
    alto: filtrados.filter((e) => e.riesgoGlobal === "Alto").length,
    medio: filtrados.filter((e) => e.riesgoGlobal === "Medio").length,
    bajo: filtrados.filter((e) => e.riesgoGlobal === "Bajo").length,
    sinEvaluar: filtrados.filter((e) => e.riesgoGlobal === "Sin evaluar").length
  };

  const respondidos = filtrados.filter((e) => e.estadoEncuesta === "RESPONDIDA");
  const distribucionPorDimension = {
    IND: {
      Alto: respondidos.filter((e) => e.alertaIndividual === "Alto").length,
      Medio: respondidos.filter((e) => e.alertaIndividual === "Medio").length,
      Bajo: respondidos.filter((e) => e.alertaIndividual === "Bajo").length
    },
    INS: {
      Alto: respondidos.filter((e) => e.alertaAsistencial === "Alto").length,
      Medio: respondidos.filter((e) => e.alertaAsistencial === "Medio").length,
      Bajo: respondidos.filter((e) => e.alertaAsistencial === "Bajo").length
    },
    ACA: {
      Alto: respondidos.filter((e) => e.alertaAcademica === "Alto").length,
      Medio: respondidos.filter((e) => e.alertaAcademica === "Medio").length,
      Bajo: respondidos.filter((e) => e.alertaAcademica === "Bajo").length
    },
    SOC: {
      Alto: respondidos.filter((e) => e.alertaSocioeconomica === "Alto").length,
      Medio: respondidos.filter((e) => e.alertaSocioeconomica === "Medio").length,
      Bajo: respondidos.filter((e) => e.alertaSocioeconomica === "Bajo").length
    }
  };

  const porSemestre = {
    semestre1: {
      total: filtrados.filter((e) => e.semestre === 1).length,
      encuestados: filtrados.filter((e) => e.semestre === 1 && e.estadoEncuesta === "RESPONDIDA").length,
      faltantes: filtrados.filter((e) => e.semestre === 1 && e.estadoEncuesta === "PENDIENTE").length,
      riesgoAlto: filtrados.filter((e) => e.semestre === 1 && e.riesgoGlobal === "Alto").length
    },
    semestre4: {
      total: filtrados.filter((e) => e.semestre === 4).length,
      encuestados: filtrados.filter((e) => e.semestre === 4 && e.estadoEncuesta === "RESPONDIDA").length,
      faltantes: filtrados.filter((e) => e.semestre === 4 && e.estadoEncuesta === "PENDIENTE").length,
      riesgoAlto: filtrados.filter((e) => e.semestre === 4 && e.riesgoGlobal === "Alto").length
    },
    semestre7: {
      total: filtrados.filter((e) => e.semestre === 7).length,
      encuestados: filtrados.filter((e) => e.semestre === 7 && e.estadoEncuesta === "RESPONDIDA").length,
      faltantes: filtrados.filter((e) => e.semestre === 7 && e.estadoEncuesta === "PENDIENTE").length,
      riesgoAlto: filtrados.filter((e) => e.semestre === 7 && e.riesgoGlobal === "Alto").length
    }
  };

  return {
    periodoActual: filtroPeriodo !== "todos" ? filtroPeriodo : "2025-2",
    programaSeleccionado: filtroPrograma,
    semestreSeleccionado: filtroSemestre,
    campoSeleccionado: filtroCampo,
    metadatos: {
      esRestringido,
      programaUsuario,
      programasDisponibles,
      periodosDisponibles
    },
    kpis: {
      totalEstudiantes,
      encuestados,
      faltantes,
      porcentajeAvance,
      alertasPermanencia
    },
    distribucionRiesgo,
    distribucionPorDimension,
    porSemestre,
    estudiantes: filtrados.slice(0, 300)
  };
}

export async function obtenerRiesgoDimensiones(user) {
  const { rol, programa } = user;
  const progFiltro = rol === "directivo" ? programa : null;
  return await obtenerDimensionesAgregadas(progFiltro);
}
