/* ==========================================================================
   Feature: Estudiante (Módulo Exclusivo para Estudiantes - SAT-UNICESMAG)
   ==========================================================================
   Endpoints:
     POST /api/estudiante/solicitar-otp      -> Valida cédula y correo, despacha OTP
     POST /api/estudiante/verificar-otp      -> Valida OTP, emite sesión de estudiante
     GET  /api/estudiante/instrumento        -> Obtiene preguntas activas actualizadas del instrumento
     GET  /api/estudiante/estado             -> Consulta elegibilidad (semestre 1, 4, 7) y estado/resultado de encuesta
     POST /api/estudiante/guardar-encuesta   -> Guarda respuestas de caracterización con confirmación y devuelve diagnóstico completo
   ========================================================================== */

import { Router } from "express";
import crypto from "crypto";
import { query } from "../../shared/db/pool.js";
import { enviarCorreoOtp } from "../../shared/services/emailService.js";
import { INSTRUMENTO_ITEMS, DIM_NOMBRES, evaluarInstrumento } from "../caracterizacion/instrumento.js";
import { MOCK_DATA } from "../../shared/data/mockData.js";

const router = Router();

// Semestres institucionales habilitados para caracterización obligatoria
const SEMESTRES_ELEGIBLES = [1, 4, 7];

function mapCategoria(cat) {
  if (!cat) return "IND";
  const upper = String(cat).toUpperCase().trim();
  if (upper === "GEST PROG" || upper === "GEST_PROG") return "GEST_PROG";
  return upper;
}

function mapTipoFrontend(tipoRespuesta) {
  if (tipoRespuesta === "BOOLEANO" || tipoRespuesta === "sino") return "sino";
  if (tipoRespuesta === "LIKERT_INVERSO") return "likert_inverso";
  return "likert";
}

// Helper para ofuscar correo (ej. santiagovillota@unicesmag.edu.co -> s***a@unicesmag.edu.co)
function ofuscarCorreo(email) {
  if (!email || !email.includes("@")) return email || "";
  const [local, dominio] = email.split("@");
  if (local.length <= 2) return `${local[0]}*@${dominio}`;
  return `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}@${dominio}`;
}

async function obtenerDocenteAcompanante() {
  try {
    const docRes = await query(
      `SELECT CONCAT(d.nombres, ' ', d.apellidos) AS nombre_completo
       FROM sat.docentes d
       LIMIT 1`
    );
    if (docRes.rows.length > 0 && docRes.rows[0].nombre_completo?.trim()) {
      return docRes.rows[0].nombre_completo.trim();
    }
  } catch {
    // Fallback
  }
  return "Equipo de Permanencia y Acompañamiento Institucional";
}

async function obtenerPreguntasActivas() {
  try {
    const { rows } = await query(
      `SELECT p.id_preguntas_caracterizacion AS "dbId",
              p.orden AS id,
              p.orden,
              p.categoria,
              p.tipo_respuesta AS "tipoRespuesta",
              p.texto,
              p.obligatoria
       FROM sat.preguntas_caracterizacion p
       WHERE p.activo = true
       ORDER BY p.orden ASC`
    );

    if (rows.length > 0) {
      return rows.map((r) => {
        const dimKey = mapCategoria(r.categoria);
        return {
          id: r.id,
          dbId: r.dbId,
          orden: r.orden,
          dim: dimKey,
          dimNombre: DIM_NOMBRES[dimKey] || DIM_NOMBRES[r.categoria] || r.categoria,
          texto: r.texto,
          tipo: mapTipoFrontend(r.tipoRespuesta),
          tipo_respuesta: r.tipoRespuesta,
          obligatoria: r.obligatoria
        };
      });
    }
  } catch {
    // Fallback a INSTRUMENTO_ITEMS
  }
  return INSTRUMENTO_ITEMS;
}

// --------------------------------------------------------------------------
// 0. GET /instrumento - Preguntas activas actualizadas para el estudiante
// --------------------------------------------------------------------------
router.get("/instrumento", async (req, res) => {
  const items = await obtenerPreguntasActivas();
  res.json(items);
});

// --------------------------------------------------------------------------
// 1. POST /solicitar-otp - Solicitar código OTP sin contraseña
// --------------------------------------------------------------------------
router.post("/solicitar-otp", async (req, res, next) => {
  const { documento, correo } = req.body;

  if (!documento || !correo) {
    return res.status(400).json({
      error: "Debe ingresar el número de documento y el correo electrónico institucional."
    });
  }

  const docLimpio = String(documento).trim();
  const correoLimpio = String(correo).trim().toLowerCase();

  try {
    // 1. Validar en sat.estudiantes si existe y coincide
    let estudiante = null;
    try {
      const { rows } = await query(
        `SELECT e.id_estudiantes, e.codigo_externo, e.numero_documento, e.nombres, e.apellidos,
                e.correo_institucional, e.semestre_actual, e.estado_matricula,
                p.nombre AS programa
         FROM sat.estudiantes e
         LEFT JOIN sat.programas_academicos p ON e.id_programas_academicos = p.id_programas_academicos
         WHERE (e.numero_documento = $1 OR e.codigo_externo = $1)
           AND LOWER(TRIM(e.correo_institucional)) = $2
         LIMIT 1`,
        [docLimpio, correoLimpio]
      );
      if (rows.length > 0) {
        estudiante = rows[0];
      }
    } catch (dbErr) {
      console.warn("Fallo consulta a sat.estudiantes en solicitar-otp:", dbErr.message);
    }

    // Fallback a MOCK_DATA si no se encuentra en DB directa
    if (!estudiante) {
      const mockEst = MOCK_DATA.estudiantes.find(
        (e) => (e.documento === docLimpio || e.codigo === docLimpio) &&
               e.email?.toLowerCase().trim() === correoLimpio
      );
      if (mockEst) {
        estudiante = {
          id_estudiantes: `est_${mockEst.codigo}`,
          codigo_externo: mockEst.codigo,
          numero_documento: mockEst.documento,
          nombres: mockEst.nombres,
          apellidos: mockEst.apellidos,
          correo_institucional: mockEst.email,
          semestre_actual: mockEst.semestre || 1,
          estado_matricula: "MATRICULADO",
          programa: mockEst.programa
        };
      }
    }

    if (!estudiante) {
      return res.status(404).json({
        error: "Los datos ingresados no coinciden con ningún estudiante activo registrado en el sistema. Verifique su número de documento y correo institucional."
      });
    }

    // Verificar matrícula activa
    const matricula = (estudiante.estado_matricula || "MATRICULADO").toUpperCase();
    if (matricula === "RETIRADO" || matricula === "EXPULSADO" || matricula === "INACTIVO") {
      return res.status(403).json({
        error: "El estudiante se encuentra en estado inactivo o retirado. Comuníquese con la Secretaría Académica."
      });
    }

    // 2. Generar código OTP de 6 dígitos numéricos
    const otpNumber = crypto.randomInt(100000, 999999).toString();
    const expiraMinutos = 15;
    const expiraEn = new Date(Date.now() + expiraMinutos * 60 * 1000);

    // 3. Guardar en sat.otp_codigos si el estudiante tiene ID UUID
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(estudiante.id_estudiantes);
    if (esUuid) {
      await query(
        `UPDATE sat.otp_codigos 
         SET usado = true 
         WHERE id_estudiantes = $1 AND usado = false`,
        [estudiante.id_estudiantes]
      );

      await query(
        `INSERT INTO sat.otp_codigos
          (id_estudiantes, codigo, correo_destino, expira_en, intentos_fallidos, max_intentos, usado, ip_origen)
         VALUES ($1, $2, $3, $4, 0, 5, false, $5)`,
        [estudiante.id_estudiantes, otpNumber, estudiante.correo_institucional, expiraEn, req.ip || null]
      );
    }

    // 4. Enviar correo electrónico
    const nombreCompleto = `${estudiante.nombres} ${estudiante.apellidos}`.trim();
    await enviarCorreoOtp({
      correo: estudiante.correo_institucional,
      nombre: nombreCompleto,
      codigoOtp: otpNumber,
      expiraMinutos
    });

    res.json({
      ok: true,
      mensaje: `Se ha enviado un código de verificación de 6 dígitos a su correo institucional.`,
      correoOfuscado: ofuscarCorreo(estudiante.correo_institucional),
      expiraMinutos,
      ...(process.env.NODE_ENV === "development" ? { codigoDev: otpNumber } : {})
    });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// 2. POST /verificar-otp - Validar código OTP e iniciar sesión de estudiante
// --------------------------------------------------------------------------
router.post("/verificar-otp", async (req, res, next) => {
  const { documento, correo, codigo } = req.body;

  if (!documento || !codigo) {
    return res.status(400).json({ error: "Debe ingresar el documento y el código de verificación de 6 dígitos." });
  }

  const docLimpio = String(documento).trim();
  const codigoLimpio = String(codigo).trim();

  try {
    // 1. Obtener estudiante
    let estudiante = null;
    try {
      const { rows } = await query(
        `SELECT e.id_estudiantes, e.codigo_externo, e.numero_documento, e.nombres, e.apellidos,
                e.correo_institucional, e.semestre_actual, e.estado_matricula,
                p.nombre AS programa, s.nombre AS sede
         FROM sat.estudiantes e
         LEFT JOIN sat.programas_academicos p ON e.id_programas_academicos = p.id_programas_academicos
         LEFT JOIN sat.sedes s ON e.id_sedes = s.id_sedes
         WHERE e.numero_documento = $1 OR e.codigo_externo = $1
         LIMIT 1`,
        [docLimpio]
      );
      if (rows.length > 0) {
        estudiante = rows[0];
      }
    } catch {
      // Fallback
    }

    if (!estudiante) {
      const mockEst = MOCK_DATA.estudiantes.find(
        (e) => e.documento === docLimpio || e.codigo === docLimpio
      );
      if (mockEst) {
        estudiante = {
          id_estudiantes: `est_${mockEst.codigo}`,
          codigo_externo: mockEst.codigo,
          numero_documento: mockEst.documento,
          nombres: mockEst.nombres,
          apellidos: mockEst.apellidos,
          correo_institucional: mockEst.email,
          semestre_actual: mockEst.semestre || 1,
          estado_matricula: "MATRICULADO",
          programa: mockEst.programa,
          sede: "Sede Principal - Pasto"
        };
      }
    }

    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado." });
    }

    // 2. Validar OTP en base de datos
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(estudiante.id_estudiantes);
    if (esUuid) {
      const { rows: otpRows } = await query(
        `SELECT id_otp, codigo, expira_en, intentos_fallidos, max_intentos, usado
         FROM sat.otp_codigos
         WHERE id_estudiantes = $1
         ORDER BY creado_en DESC
         LIMIT 1`,
        [estudiante.id_estudiantes]
      );

      if (otpRows.length === 0) {
        return res.status(400).json({ error: "No se ha solicitado ningún código de verificación activo." });
      }

      const otpRegistro = otpRows[0];

      if (otpRegistro.usado) {
        return res.status(400).json({ error: "Este código ya ha sido utilizado. Por favor solicite uno nuevo." });
      }

      if (new Date() > new Date(otpRegistro.expira_en)) {
        return res.status(400).json({ error: "El código de verificación ha expirado. Solicite un nuevo código." });
      }

      if (otpRegistro.intentos_fallidos >= otpRegistro.max_intentos) {
        return res.status(400).json({
          error: "Ha superado el número máximo de intentos permitidos (5). Solicite un nuevo código."
        });
      }

      if (otpRegistro.codigo !== codigoLimpio) {
        await query(
          `UPDATE sat.otp_codigos
           SET intentos_fallidos = intentos_fallidos + 1
           WHERE id_otp = $1`,
          [otpRegistro.id_otp]
        );
        const restantes = otpRegistro.max_intentos - (otpRegistro.intentos_fallidos + 1);
        return res.status(400).json({
          error: `Código de verificación incorrecto. Le quedan ${restantes} ${restantes === 1 ? "intento" : "intentos"}.`
        });
      }

      await query(
        `UPDATE sat.otp_codigos
         SET usado = true, usado_en = NOW()
         WHERE id_otp = $1`,
        [otpRegistro.id_otp]
      );
    }

    // 3. Crear sesión de estudiante con rol exclusivo 'estudiante'
    const usuarioEstudiante = {
      id: estudiante.id_estudiantes,
      id_estudiantes: estudiante.id_estudiantes,
      codigo: estudiante.codigo_externo,
      codigoEstudiante: estudiante.codigo_externo,
      documento: estudiante.numero_documento,
      numeroDocumento: estudiante.numero_documento,
      nombres: estudiante.nombres,
      apellidos: estudiante.apellidos,
      nombre: `${estudiante.nombres} ${estudiante.apellidos}`.trim(),
      email: estudiante.correo_institucional,
      correo: estudiante.correo_institucional,
      semestre: estudiante.semestre_actual || 1,
      semestre_actual: estudiante.semestre_actual || 1,
      programa: estudiante.programa || "Programa Académico UNICESMAG",
      sede: estudiante.sede || "Sede Principal - Pasto",
      rol: "estudiante",
      cargo: "Estudiante Activo"
    };

    res.json({
      ok: true,
      mensaje: "Autenticación exitosa.",
      usuario: usuarioEstudiante
    });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// 3. GET /estado - Consultar elegibilidad y estado/resultado de encuesta para el estudiante
// --------------------------------------------------------------------------
router.get("/estado", async (req, res, next) => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    return res.status(401).json({ error: "No autenticado. Inicie sesión nuevamente." });
  }

  try {
    // 1. Obtener estudiante de BD
    let estudiante = null;
    try {
      const { rows } = await query(
        `SELECT e.id_estudiantes, e.codigo_externo, e.numero_documento, e.nombres, e.apellidos,
                e.correo_institucional, e.semestre_actual, e.estado_matricula,
                p.nombre AS programa, s.nombre AS sede
         FROM sat.estudiantes e
         LEFT JOIN sat.programas_academicos p ON e.id_programas_academicos = p.id_programas_academicos
         LEFT JOIN sat.sedes s ON e.id_sedes = s.id_sedes
         WHERE e.id_estudiantes::text = $1 OR e.codigo_externo = $1 OR e.numero_documento = $1
         LIMIT 1`,
        [userId]
      );
      if (rows.length > 0) {
        estudiante = rows[0];
      }
    } catch {
      // Fallback
    }

    if (!estudiante) {
      const mockEst = MOCK_DATA.estudiantes.find(
        (e) => e.codigo === userId || e.documento === userId || `est_${e.codigo}` === userId
      );
      if (mockEst) {
        estudiante = {
          id_estudiantes: `est_${mockEst.codigo}`,
          codigo_externo: mockEst.codigo,
          numero_documento: mockEst.documento,
          nombres: mockEst.nombres,
          apellidos: mockEst.apellidos,
          correo_institucional: mockEst.email,
          semestre_actual: mockEst.semestre || 1,
          programa: mockEst.programa
        };
      }
    }

    if (!estudiante) {
      return res.status(404).json({ error: "No se encontró el registro del estudiante autenticado." });
    }

    const semestre = Number(estudiante.semestre_actual) || 1;
    const esElegible = SEMESTRES_ELEGIBLES.includes(semestre);

    // 2. Obtener periodo académico activo
    let periodoActivo = { id: "p-2026-1", nombre: "2026-1" };
    try {
      const perRes = await query(
        `SELECT id_periodos_academicos AS id, nombre, fecha_inicio, fecha_fin, activo
         FROM sat.periodos_academicos
         WHERE activo = true
         ORDER BY fecha_inicio DESC
         LIMIT 1`
      );
      if (perRes.rows.length > 0) {
        periodoActivo = perRes.rows[0];
      }
    } catch {
      // Usar fallback
    }

    // 3. Verificar si ya completó la encuesta en el periodo vigente
    let encuestaCompletada = false;
    let fechaCompletado = null;
    let idRespuesta = null;
    let resumenResultado = null;
    let resultadoCompleto = null;

    const docenteAcompanante = await obtenerDocenteAcompanante();

    try {
      const respRes = await query(
        `SELECT rc.id_respuestas_caracterizacion, rc.creado_en, rc.estado,
                cr.puntaje_global, rr.nombre AS "riesgoGlobal", cr.factores
         FROM sat.respuestas_caracterizacion rc
         LEFT JOIN sat.calificaciones_riesgo cr ON cr.id_respuestas_caracterizacion = rc.id_respuestas_caracterizacion
         LEFT JOIN sat.rangos_riesgo rr ON rr.id_rangos_riesgo = cr.id_rangos_riesgo
         WHERE rc.id_estudiantes = $1
           AND (rc.id_periodos_academicos = $2 OR rc.id_periodos_academicos IS NULL)
         ORDER BY rc.creado_en DESC
         LIMIT 1`,
        [estudiante.id_estudiantes, periodoActivo.id]
      );

      if (respRes.rows.length > 0) {
        encuestaCompletada = true;
        const row = respRes.rows[0];
        idRespuesta = row.id_respuestas_caracterizacion;
        fechaCompletado = row.creado_en ? new Date(row.creado_en).toISOString().replace("T", " ").substring(0, 16) : null;
        resumenResultado = {
          riesgoGlobal: row.riesgoGlobal || "Medio",
          puntajeGlobal: row.puntaje_global
        };

        let factoresParsed = {};
        try {
          factoresParsed = typeof row.factores === "string" ? JSON.parse(row.factores) : row.factores || {};
        } catch {
          factoresParsed = {};
        }

        if (factoresParsed.nivelPermanencia && factoresParsed.conceptosPorDimension) {
          resultadoCompleto = {
            porDimension: factoresParsed.dimensiones || factoresParsed.porDimension,
            nivelPermanencia: factoresParsed.nivelPermanencia,
            mensajePermanencia: factoresParsed.mensajePermanencia,
            conceptosPorDimension: factoresParsed.conceptosPorDimension,
            riesgoGlobal: row.riesgoGlobal || factoresParsed.riesgoGlobal || "Medio",
            promedioGlobal: factoresParsed.promedioGlobal || (row.puntaje_global ? Number((Number(row.puntaje_global) / 25).toFixed(2)) : 2.5),
            docenteAcompanante: factoresParsed.docenteAcompanante || docenteAcompanante
          };
        } else {
          // Reconstruir evaluando respuestas_detalle guardadas
          const detRes = await query(
            `SELECT p.orden, rd.valor_numerico
             FROM sat.respuestas_detalle rd
             JOIN sat.preguntas_caracterizacion p ON rd.id_preguntas_caracterizacion = p.id_preguntas_caracterizacion
             WHERE rd.id_respuestas_caracterizacion = $1`,
            [idRespuesta]
          );
          const respuestasMap = {};
          detRes.rows.forEach((r) => {
            respuestasMap[`item_${r.orden}`] = Number(r.valor_numerico) || 2;
          });
          const itemsActivos = await obtenerPreguntasActivas();
          const evalRec = evaluarInstrumento(respuestasMap, itemsActivos);
          resultadoCompleto = {
            ...evalRec,
            docenteAcompanante
          };
        }
      }
    } catch {
      // Fallback a MOCK_DATA
      const envioMock = MOCK_DATA.caracterizaciones.find((c) => c.codigoEstudiante === estudiante.codigo_externo);
      if (envioMock) {
        encuestaCompletada = true;
        fechaCompletado = envioMock.fecha;
        idRespuesta = envioMock.id;
        resumenResultado = {
          riesgoGlobal: envioMock.riesgoGlobal,
          puntajeGlobal: envioMock.promedioGlobal
        };
        const itemsActivos = await obtenerPreguntasActivas();
        const evalRec = evaluarInstrumento(envioMock.respuestas || {}, itemsActivos);
        resultadoCompleto = {
          ...evalRec,
          docenteAcompanante
        };
      }
    }

    res.json({
      estudiante: {
        id: estudiante.id_estudiantes,
        codigo: estudiante.codigo_externo,
        documento: estudiante.numero_documento,
        nombres: estudiante.nombres,
        apellidos: estudiante.apellidos,
        nombreCompleto: `${estudiante.nombres} ${estudiante.apellidos}`.trim(),
        correo: estudiante.correo_institucional,
        semestre,
        programa: estudiante.programa,
        sede: estudiante.sede
      },
      esElegible,
      semestresHabilitados: SEMESTRES_ELEGIBLES,
      periodoActivo,
      encuestaCompletada,
      fechaCompletado,
      idRespuesta,
      resumenResultado,
      resultado: resultadoCompleto,
      mensaje: !esElegible
        ? `La Encuesta de Caracterización no aplica para tu periodo lectivo actual (Semestre ${semestre}). La encuesta institucional está dirigida a estudiantes de 1.º, 4.º y 7.º semestre.`
        : encuestaCompletada
        ? `Ya has completado satisfactoriamente la Encuesta de Caracterización para el periodo ${periodoActivo.nombre}.`
        : `Tienes habilitada la Encuesta de Caracterización Institucional para el periodo ${periodoActivo.nombre}.`
    });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// 4. POST /guardar-encuesta - Guardar respuestas oficiales del estudiante
// --------------------------------------------------------------------------
router.post("/guardar-encuesta", async (req, res, next) => {
  const userId = req.headers["x-user-id"];
  const { respuestas } = req.body;

  if (!userId) {
    return res.status(401).json({ error: "Sesión expirada o no autenticada. Inicie sesión nuevamente." });
  }

  if (!respuestas || typeof respuestas !== "object") {
    return res.status(400).json({ error: "No se recibieron las respuestas del formulario." });
  }

  try {
    // 1. Obtener estudiante
    let estudianteDb = null;
    try {
      const estRes = await query(
        `SELECT id_estudiantes, codigo_externo, numero_documento, nombres, apellidos, semestre_actual
         FROM sat.estudiantes
         WHERE id_estudiantes::text = $1 OR codigo_externo = $1 OR numero_documento = $1
         LIMIT 1`,
        [userId]
      );
      if (estRes.rows.length > 0) {
        estudianteDb = estRes.rows[0];
      }
    } catch {
      // Fallback
    }

    if (!estudianteDb) {
      const mockEst = MOCK_DATA.estudiantes.find(
        (e) => e.codigo === userId || e.documento === userId || `est_${e.codigo}` === userId
      );
      if (mockEst) {
        estudianteDb = {
          id_estudiantes: `est_${mockEst.codigo}`,
          codigo_externo: mockEst.codigo,
          numero_documento: mockEst.documento,
          nombres: mockEst.nombres,
          apellidos: mockEst.apellidos,
          semestre_actual: mockEst.semestre || 1
        };
      }
    }

    if (!estudianteDb) {
      return res.status(404).json({ error: "Estudiante no encontrado." });
    }

    const semestre = Number(estudianteDb.semestre_actual) || 1;
    if (!SEMESTRES_ELEGIBLES.includes(semestre)) {
      return res.status(403).json({
        error: `La encuesta no aplica para estudiantes de semestre ${semestre}. Solo está habilitada para 1.º, 4.º y 7.º semestre.`
      });
    }

    // 2. Obtener preguntas activas para evaluar y persistir
    const itemsActivos = await obtenerPreguntasActivas();
    let opcionesMap = new Map();
    try {
      const { rows: opcRows } = await query(
        `SELECT id_opciones_pregunta, id_preguntas_caracterizacion, valor_numerico FROM sat.opciones_pregunta`
      );
      opcRows.forEach((o) => {
        opcionesMap.set(`${o.id_preguntas_caracterizacion}_${o.valor_numerico}`, o.id_opciones_pregunta);
      });
    } catch {
      // Defaults
    }

    const totalItems = itemsActivos.length;
    const respondidos = Object.keys(respuestas).length;
    if (respondidos < totalItems) {
      return res.status(400).json({
        error: `Debe responder todas las preguntas requeridas (${respondidos}/${totalItems}) antes de confirmar el envío.`
      });
    }

    // 3. Obtener encuesta y periodo activo
    let idEncuesta = null;
    let idPeriodo = null;
    try {
      const encRes = await query(`SELECT id_encuestas_caracterizacion FROM sat.encuestas_caracterizacion WHERE activo = true LIMIT 1`);
      idEncuesta = encRes.rows[0]?.id_encuestas_caracterizacion;

      const perRes = await query(`SELECT id_periodos_academicos FROM sat.periodos_academicos WHERE activo = true LIMIT 1`);
      idPeriodo = perRes.rows[0]?.id_periodos_academicos;
    } catch {
      // Continuar
    }

    // 4. Validar que no haya envío duplicado en el periodo vigente
    if (idPeriodo && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(estudianteDb.id_estudiantes)) {
      const yaEnvio = await query(
        `SELECT id_respuestas_caracterizacion FROM sat.respuestas_caracterizacion
         WHERE id_estudiantes = $1 AND id_periodos_academicos = $2`,
        [estudianteDb.id_estudiantes, idPeriodo]
      );
      if (yaEnvio.rows.length > 0) {
        return res.status(409).json({
          error: "Ya has completado la encuesta de caracterización para el periodo académico vigente. No se permiten envíos duplicados."
        });
      }
    }

    // 5. Evaluar instrumento con matriz de cálculo
    const evaluacion = evaluarInstrumento(respuestas, itemsActivos);
    const docenteAcompanante = await obtenerDocenteAcompanante();

    // 6. Inserción en PostgreSQL
    let idRespuestaCaracterizacion = null;
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(estudianteDb.id_estudiantes);

    if (esUuid && idEncuesta) {
      const rcRes = await query(
        `INSERT INTO sat.respuestas_caracterizacion
          (id_estudiantes, id_encuestas_caracterizacion, id_periodos_academicos, id_usuarios, estado, creado_en)
         VALUES ($1, $2, $3, NULL, 'COMPLETA', NOW())
         RETURNING id_respuestas_caracterizacion`,
        [estudianteDb.id_estudiantes, idEncuesta, idPeriodo]
      );
      idRespuestaCaracterizacion = rcRes.rows[0]?.id_respuestas_caracterizacion;

      // Guardar detalle de cada ítem
      for (const item of itemsActivos) {
        if (item.dbId) {
          const key = `item_${item.id}`;
          const valNumerico = Number(respuestas[key]) || 2;
          const idOpcion = opcionesMap.get(`${item.dbId}_${valNumerico}`) || null;

          await query(
            `INSERT INTO sat.respuestas_detalle
              (id_respuestas_caracterizacion, id_preguntas_caracterizacion, id_opciones_pregunta, valor_numerico)
             VALUES ($1, $2, $3, $4)`,
            [idRespuestaCaracterizacion, item.dbId, idOpcion, valNumerico]
          );
        }
      }

      // Obtener rango de riesgo correspondiente
      let idRangoRiesgo = null;
      const rangoNombre = (evaluacion.riesgoGlobal || "MEDIO").toUpperCase();
      const rangoRes = await query(
        `SELECT id_rangos_riesgo FROM sat.rangos_riesgo WHERE UPPER(nombre) = $1 ORDER BY actualizado_en DESC LIMIT 1`,
        [rangoNombre]
      );
      idRangoRiesgo = rangoRes.rows[0]?.id_rangos_riesgo;
      if (!idRangoRiesgo) {
        const fallbackRango = await query(`SELECT id_rangos_riesgo FROM sat.rangos_riesgo LIMIT 1`);
        idRangoRiesgo = fallbackRango.rows[0]?.id_rangos_riesgo;
      }

      // Persistir calificación de riesgo con todos los datos del diagnóstico para el estudiante
      await query(
        `INSERT INTO sat.calificaciones_riesgo
          (id_estudiantes, id_respuestas_caracterizacion, id_periodos_academicos, tipo_origen,
           puntaje_global, puntaje_academico, puntaje_socioeconomico, puntaje_institucional, puntaje_individual,
           id_rangos_riesgo, factores, vigente, calculado_en)
         VALUES ($1, $2, $3, 'ENCUESTA', $4, $5, $6, $7, $8, $9, $10, true, NOW())`,
        [
          estudianteDb.id_estudiantes,
          idRespuestaCaracterizacion,
          idPeriodo,
          evaluacion.promedioGlobal * 25,
          evaluacion.porDimension.ACA?.suma || 0,
          evaluacion.porDimension.SOC?.suma || 0,
          evaluacion.porDimension.INS?.suma || 0,
          evaluacion.porDimension.IND?.suma || 0,
          idRangoRiesgo,
          JSON.stringify({
            semestre: estudianteDb.semestre_actual,
            dimensiones: evaluacion.porDimension,
            nivelPermanencia: evaluacion.nivelPermanencia,
            mensajePermanencia: evaluacion.mensajePermanencia,
            conceptosPorDimension: evaluacion.conceptosPorDimension,
            promedioGlobal: evaluacion.promedioGlobal,
            riesgoGlobal: evaluacion.riesgoGlobal,
            docenteAcompanante
          })
        ]
      );
    }

    const comprobanteId = idRespuestaCaracterizacion || `CAR-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const fechaEnvio = new Date().toISOString().replace("T", " ").substring(0, 16);

    const resultadoCompleto = {
      ...evaluacion,
      docenteAcompanante
    };

    res.status(201).json({
      ok: true,
      mensaje: "¡Encuesta de caracterización enviada y registrada exitosamente!",
      comprobante: {
        id: comprobanteId,
        fecha: fechaEnvio,
        codigoEstudiante: estudianteDb.codigo_externo,
        estudiante: `${estudianteDb.nombres} ${estudianteDb.apellidos}`,
        semestre: estudianteDb.semestre_actual,
        promedioGlobal: evaluacion.promedioGlobal,
        riesgoGlobal: evaluacion.riesgoGlobal
      },
      resultado: resultadoCompleto
    });
  } catch (err) {
    next(err);
  }
});

export default router;
