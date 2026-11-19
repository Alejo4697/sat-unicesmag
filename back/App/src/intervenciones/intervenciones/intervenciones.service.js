import { MOCK_DATA } from "../../shared/menu/mockData.js";
import { sanitizarIntervencion } from "../../shared/seguridad/vbg.js";
import { query } from "../../../../database/pool.js";
import { esUsuarioRestringidoAPrograma, coincidePrograma } from "../../shared/seguridad/alcanceDirectivo.js";

export async function listarTipos() {
  const { rows } = await query(
    `SELECT id_tipos_intervencion AS id, nombre, descripcion
     FROM sat.tipos_intervencion
     WHERE activo = true
     ORDER BY nombre`
  );
  return rows;
}

export async function listarIntervenciones(codigoEstudiante, user) {
  try {
    let sql = `
      SELECT i.id_intervenciones AS id,
             e.codigo_externo AS "codigoEstudiante",
             p.nombre AS "programaEstudiante",
             CONCAT(u.nombres, ' ', u.apellidos) AS "atendidoPor",
             'Docente / Profesional' AS "cargoAtendio",
             i.id_usuarios AS "idUsuarioAtendio",
             i.fecha_atencion AS fecha,
             i.creado_en AS "fechaRegistro",
             ti.nombre AS "tipoIntervencion",
             i.descripcion AS motivo,
             i.descripcion AS "resumenAcuerdo",
             c.es_confidencialidad_especial AS "esSensibleVBG",
             COALESCE(i.estado, CASE WHEN i.cerrada_en IS NOT NULL THEN 'Atendida' ELSE 'Pendiente' END) AS estado,
             (LOWER(COALESCE(i.estado, '')) IN ('cerrada', 'atendida') OR i.cerrada_en IS NOT NULL) AS cerrado
      FROM sat.intervenciones i
      JOIN sat.casos c ON i.id_casos = c.id_casos
      JOIN sat.estudiantes e ON c.id_estudiantes = e.id_estudiantes
      JOIN sat.tipos_intervencion ti ON i.id_tipos_intervencion = ti.id_tipos_intervencion
      LEFT JOIN sat.usuarios u ON i.id_usuarios = u.id_usuarios
    `;
    const params = [];

    if (codigoEstudiante) {
      sql += ` WHERE e.codigo_externo = $1 OR e.numero_documento = $1 OR e.id_estudiantes::text = $1`;
      params.push(codigoEstudiante);
    }

    sql += ` ORDER BY i.fecha_atencion DESC LIMIT 100`;

    const { rows } = await query(sql, params);

    const mockFiltrado = codigoEstudiante
      ? MOCK_DATA.intervenciones.filter((i) => i.codigoEstudiante === codigoEstudiante)
      : MOCK_DATA.intervenciones;

    const idsDb = new Set(rows.map((r) => r.id));
    const mocksRestantes = mockFiltrado.filter((m) => !idsDb.has(m.id));

    let total = [...rows, ...mocksRestantes];
    if (esUsuarioRestringidoAPrograma(user)) {
      const progUser = user.programa;
      const userId = user.id;
      const userNombre = (user.nombre || "").toLowerCase();
      total = total.filter((i) => {
        const coincideProg = coincidePrograma(i.programaEstudiante, progUser);
        const esMio = (i.idUsuarioAtendio && i.idUsuarioAtendio === userId) ||
                      (i.atendidoPor && userNombre && i.atendidoPor.toLowerCase().includes(userNombre));
        return coincideProg || esMio;
      });
    }
    return total.map((i) => sanitizarIntervencion(i, user));
  } catch (err) {
    console.warn("Fallo al consultar intervenciones en PostgreSQL:", err.message);
    const lista = codigoEstudiante
      ? MOCK_DATA.intervenciones.filter((i) => i.codigoEstudiante === codigoEstudiante)
      : MOCK_DATA.intervenciones;
    return lista.map((i) =>
      sanitizarIntervencion(
        { ...i, adjuntos: i.adjuntos ?? [], notasAclaratorias: i.notasAclaratorias ?? [] },
        user
      )
    );
  }
}

export async function registrarIntervencion(data, user) {
  const { codigoEstudiante, tipoIntervencion, motivo, resumenAcuerdo, esSensibleVBG, adjuntos, canalAtencion, fechaManual, fecha } = data;

  if (!codigoEstudiante || !tipoIntervencion || !motivo || !resumenAcuerdo) {
    const error = new Error("Diligencie todos los campos requeridos (incluido el tipo de intervención).");
    error.status = 400;
    throw error;
  }

  const fechaAtencionISO = (() => {
    const fechaRef = fechaManual || fecha;
    if (fechaRef) {
      if (typeof fechaRef === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fechaRef)) {
        const [y, m, d] = fechaRef.split("-").map(Number);
        const now = new Date();
        const fechaObj = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
        return fechaObj.toISOString();
      }
      const parsed = new Date(fechaRef);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return new Date().toISOString();
  })();

  // 1. Validar y obtener tipo de intervención
  const { rows: tipos } = await query(
    `SELECT id_tipos_intervencion, nombre FROM sat.tipos_intervencion WHERE activo = true AND nombre = $1`,
    [tipoIntervencion]
  );

  let idTipo = tipos[0]?.id_tipos_intervencion;
  if (!idTipo) {
    const { rows: todosTipos } = await query(
      `SELECT id_tipos_intervencion, nombre FROM sat.tipos_intervencion WHERE activo = true ORDER BY nombre`
    );
    const validos = todosTipos.map((r) => r.nombre);
    const error = new Error(`Tipo de intervención inválido. Opciones válidas: ${validos.join(", ")}.`);
    error.status = 400;
    throw error;
  }

  // 2. Buscar estudiante en PostgreSQL
  let estudianteDb = null;
  try {
    const { rows: estRows } = await query(
      `SELECT e.id_estudiantes, e.codigo_externo, e.numero_documento, p.nombre AS programa FROM sat.estudiantes e LEFT JOIN sat.matriculas m ON m.id_estudiantes = e.id_estudiantes LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos = COALESCE(m.id_programas_academicos, e.id_programas_academicos) WHERE e.codigo_externo = $1 OR e.numero_documento = $1 OR e.id_estudiantes::text = $1 LIMIT 1`,
      [codigoEstudiante]
    );
    if (estRows.length > 0) {
      estudianteDb = estRows[0];
      if (esUsuarioRestringidoAPrograma(user) && estudianteDb.programa) {
        if (!coincidePrograma(estudianteDb.programa, user.programa)) {
          const error = new Error(`Seguridad SAT: Su perfil solo tiene autorización para registrar intervenciones de estudiantes pertenecientes a su programa académico (${user.programa}).`);
          error.status = 403;
          throw error;
        }
      }
    }
  } catch {
    // Fallback
  }

  let idCaso = null;
  let idIntervencionGenerada = null;

  if (estudianteDb) {
    const { rows: casos } = await query(
      `SELECT id_casos FROM sat.casos WHERE id_estudiantes = $1 ORDER BY creado_en DESC LIMIT 1`,
      [estudianteDb.id_estudiantes]
    );

    if (casos.length > 0) {
      idCaso = casos[0].id_casos;
    } else {
      const { rows: estados } = await query(
        `SELECT id_estados_caso FROM sat.estados_caso WHERE LOWER(nombre) = 'abierto' LIMIT 1`
      );
      const idEstadoAbierto = estados[0]?.id_estados_caso;

      const { rows: nuevoCaso } = await query(
        `INSERT INTO sat.casos
          (id_estudiantes, id_estados_caso, es_confidencialidad_especial, abierto_en, creado_en, actualizado_en)
         VALUES ($1, $2, $3, NOW(), NOW(), NOW())
         RETURNING id_casos`,
        [estudianteDb.id_estudiantes, idEstadoAbierto, !!esSensibleVBG]
      );
      idCaso = nuevoCaso[0]?.id_casos;
    }

    const userIdValido = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user?.id)
      ? user.id
      : null;

    let idUsuarioFinal = userIdValido;
    if (!idUsuarioFinal) {
      const { rows: adminUser } = await query(`SELECT id_usuarios FROM sat.usuarios WHERE activo = true LIMIT 1`);
      idUsuarioFinal = adminUser[0]?.id_usuarios;
    }

    const { rows: insertRes } = await query(
      `INSERT INTO sat.intervenciones
        (id_casos, id_tipos_intervencion, id_usuarios, fecha_atencion, descripcion, estado, canal_atencion, es_tutorias, cerrada_en, creado_en, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, 'Pendiente', $6, $7, NULL, NOW(), NOW())
       RETURNING id_intervenciones`,
      [
        idCaso,
        idTipo,
        idUsuarioFinal,
        fechaAtencionISO,
        `${motivo} - ${resumenAcuerdo}`,
        canalAtencion || "Presencial",
        tipoIntervencion.toLowerCase().includes("tutor")
      ]
    );
    idIntervencionGenerada = insertRes[0]?.id_intervenciones;
  }

  const ahora = new Date().toISOString();
  const nueva = {
    id: idIntervencionGenerada || `INT-2026-${Math.floor(100 + Math.random() * 900)}`,
    codigoEstudiante,
    atendidoPor: user?.nombre || "Personal Institucional",
    cargoAtendio: user?.cargo || "Acompañamiento",
    idUsuarioAtendio: user?.id,
    fecha: fechaAtencionISO,
    fechaRegistro: ahora,
    tipoIntervencion,
    motivo,
    resumenAcuerdo,
    adjuntos: Array.isArray(adjuntos) ? adjuntos : [],
    esSensibleVBG: !!esSensibleVBG,
    estado: "Pendiente",
    cerrado: false,
    notasAclaratorias: []
  };

  MOCK_DATA.intervenciones.unshift(nueva);
  return sanitizarIntervencion(nueva, user);
}

export async function actualizarEstado(id, data, user) {
  const { estado, cerrado } = data;

  let nuevoEstado = typeof estado === "string" ? estado.trim() : undefined;
  let nuevoCerrado = typeof cerrado === "boolean" ? cerrado : undefined;

  if (nuevoEstado && nuevoCerrado === undefined) {
    const estadoLower = nuevoEstado.toLowerCase();
    nuevoCerrado = estadoLower === "atendida" || estadoLower === "cerrada" || estadoLower === "finalizada";
  } else if (nuevoCerrado !== undefined && !nuevoEstado) {
    nuevoEstado = nuevoCerrado ? "Atendida" : "Pendiente";
  }

  try {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      await query(
        `UPDATE sat.intervenciones
         SET estado = COALESCE($1, estado),
             cerrada_en = CASE WHEN $2 = true THEN COALESCE(cerrada_en, NOW()) ELSE NULL END,
             actualizado_en = NOW()
         WHERE id_intervenciones = $3`,
        [nuevoEstado || (nuevoCerrado ? "Atendida" : "Pendiente"), nuevoCerrado, id]
      );
    }
  } catch (dbErr) {
    console.warn("Fallo al actualizar intervención en PostgreSQL:", dbErr.message);
  }

  const intervencion = MOCK_DATA.intervenciones.find((i) => String(i.id) === String(id));
  if (intervencion) {
    if (nuevoCerrado !== undefined) intervencion.cerrado = nuevoCerrado;
    if (nuevoEstado) intervencion.estado = nuevoEstado;
    return sanitizarIntervencion(intervencion, user);
  }

  return { id, estado: nuevoEstado, cerrado: nuevoCerrado, ok: true };
}
