import bcrypt from "bcryptjs";
import { MENU_CONFIG } from "../../shared/menu/menuConfig.js";
import {
  getMapaPermisos,
  setPermisoModulo,
  esBloqueado,
  PREFIJO_ACCESO
} from "../../shared/seguridad/permisosModulos.js";
import { pool, query } from "../../../../database/pool.js";
import { ejecutarSincronizacion } from "../../shared/sincronizacion/sincronizacion.service.js";

const ROL_REPORTE_ACTIVIDADES = "reporte_actividades";
const LINEA_ACCION_NOMBRE_SQL = "regexp_replace(BTRIM(nombre), '[[:space:]]+', ' ', 'g')";
const LINEA_ACCION_NORMALIZADA_SQL = `translate(LOWER(${LINEA_ACCION_NOMBRE_SQL}), 'áéíóúüñ', 'aeiouun')`;
const LINEAS_ACCION_EXCLUIDAS = "('fin de formulas', 'paz y conivencia')";

async function guardarPermisosLineasReporte(client, idUsuario, rol, lineasSeleccionadas) {
  if (String(rol || "").trim().toLowerCase() !== ROL_REPORTE_ACTIVIDADES) {
    return [];
  }

  if (!Array.isArray(lineasSeleccionadas)) {
    const err = new Error("Selecciona al menos una línea de acción para el rol Reporte de Actividades.");
    err.status = 400;
    throw err;
  }
  if (lineasSeleccionadas.some((linea) => typeof linea !== "string")) {
    const err = new Error("Una o más líneas de acción seleccionadas no son válidas.");
    err.status = 400;
    throw err;
  }

  const lineas = [...new Set(
    lineasSeleccionadas.map((linea) => linea.trim()).filter(Boolean)
  )];
  if (lineas.length === 0) {
    const err = new Error("Selecciona al menos una línea de acción para el rol Reporte de Actividades.");
    err.status = 400;
    throw err;
  }

  const { rows } = await client.query(
    `SELECT DISTINCT ${LINEA_ACCION_NOMBRE_SQL} AS nombre
     FROM sat.lineas_accion
     WHERE ${LINEA_ACCION_NOMBRE_SQL} = ANY($1::text[])
       AND ${LINEA_ACCION_NORMALIZADA_SQL} NOT IN ${LINEAS_ACCION_EXCLUIDAS}`,
    [lineas]
  );
  const lineasValidas = new Set(rows.map((linea) => linea.nombre));
  if (lineas.some((linea) => !lineasValidas.has(linea))) {
    const err = new Error("Una o más líneas de acción seleccionadas no son válidas.");
    err.status = 400;
    throw err;
  }

  await client.query(
    `INSERT INTO sat.actividades_vec_permisos_linea_accion
       (id_usuarios, lineas_accion, acceso_global)
     VALUES ($1, $2::text[], false)
     ON CONFLICT (id_usuarios)
     DO UPDATE SET lineas_accion = EXCLUDED.lineas_accion,
                   acceso_global = false`,
    [idUsuario, lineas]
  );

  return lineas;
}

const USUARIO_SELECT_ENHANCED = `
  SELECT u.id_usuarios AS id,
         u.id_usuarios,
         (u.nombres || ' ' || u.apellidos) AS nombre,
         u.nombres,
         u.apellidos,
         u.correo_institucional AS email,
         u.numero_documento AS documento,
         COALESCE(d.codigo_externo, u.numero_documento) AS codigo,
         (
           SELECT r.nombre
           FROM sat.usuarios_roles ur
           JOIN sat.roles r ON r.id_roles = ur.id_roles
           WHERE ur.id_usuarios = u.id_usuarios
           ORDER BY ur.asignado_en NULLS LAST
           LIMIT 1
         ) AS rol,
         COALESCE(u.cargo, p.cargo, 'Personal Institucional') AS cargo,
         COALESCE(prog_up.nombre, prog_d.nombre, 'Todos') AS programa,
         COALESCE(up.id_programas_academicos, d.id_programas_academicos) AS id_programa,
         u.activo,
         COALESCE(
           (
             SELECT permisos.lineas_accion
             FROM sat.actividades_vec_permisos_linea_accion permisos
             WHERE permisos.id_usuarios = u.id_usuarios
           ),
           ARRAY[]::text[]
         ) AS "lineasAccion",
         true AS tiene_cuenta,
         'usuario' AS tipo_registro
  FROM sat.usuarios u
  LEFT JOIN sat.personas p ON u.id_personas = p.id
  LEFT JOIN sat.docentes d ON d.id_usuarios = u.id_usuarios OR (d.numero_documento = u.numero_documento AND u.numero_documento IS NOT NULL)
  LEFT JOIN sat.usuarios_programas up ON up.id_usuarios = u.id_usuarios
  LEFT JOIN sat.programas_academicos prog_up ON up.id_programas_academicos = prog_up.id_programas_academicos
  LEFT JOIN sat.programas_academicos prog_d ON d.id_programas_academicos = prog_d.id_programas_academicos
`;

export async function buscarUsuarios(qParam, tipoParam) {
  const q = String(qParam || "").trim();
  const tipo = String(tipoParam || "todos").toLowerCase();

  if (
    !q &&
    tipo !== "docentes" &&
    tipo !== "estudiantes" &&
    tipo !== "administrativos"
  ) {
    const { rows } = await query(
      `${USUARIO_SELECT_ENHANCED} WHERE u.eliminado_en IS NULL ORDER BY u.creado_en DESC`
    );
    return rows;
  }

  const paramQ = `%${q}%`;
  const resultados = [];
  const docsVistos = new Set();
  const correosVistos = new Set();

  if (tipo === "todos" || tipo === "usuarios") {
    const { rows: usuariosRows } = await query(
      `${USUARIO_SELECT_ENHANCED}
       WHERE u.eliminado_en IS NULL
         AND (
           $1 = ''
           OR u.numero_documento ILIKE $1
           OR u.correo_institucional ILIKE $1
           OR (u.nombres || ' ' || u.apellidos) ILIKE $1
           OR d.codigo_externo ILIKE $1
         )
       ORDER BY u.creado_en DESC
       LIMIT 60`,
      [q ? paramQ : ""]
    );

    for (const u of usuariosRows) {
      if (u.documento) docsVistos.add(String(u.documento).trim());
      if (u.email) correosVistos.add(String(u.email).trim().toLowerCase());
      resultados.push(u);
    }
  }

  if (tipo === "todos" || tipo === "docentes") {
    const { rows: docentesRows } = await query(
      `SELECT 'doc_' || d.id_docentes AS id,
              NULL AS id_usuarios,
              (d.nombres || ' ' || d.apellidos) AS nombre,
              d.nombres,
              d.apellidos,
              COALESCE(d.correo_institucional, '') AS email,
              d.numero_documento AS documento,
              COALESCE(d.codigo_externo, d.numero_documento) AS codigo,
              NULL AS rol,
              COALESCE(d.tipo_vinculo, 'Docente') AS cargo,
              COALESCE(prog.nombre, 'No asignado') AS programa,
              d.id_programas_academicos AS id_programa,
              false AS activo,
              false AS tiene_cuenta,
              'docente' AS tipo_registro
       FROM sat.docentes d
       LEFT JOIN sat.programas_academicos prog ON d.id_programas_academicos = prog.id_programas_academicos
       WHERE (
         $1 = ''
         OR d.numero_documento ILIKE $1
         OR d.correo_institucional ILIKE $1
         OR (d.nombres || ' ' || d.apellidos) ILIKE $1
         OR d.codigo_externo ILIKE $1
       )
       LIMIT 60`,
      [q ? paramQ : ""]
    );

    for (const d of docentesRows) {
      const docTrim = d.documento ? String(d.documento).trim() : null;
      const mailTrim = d.email ? String(d.email).trim().toLowerCase() : null;
      if ((docTrim && docsVistos.has(docTrim)) || (mailTrim && correosVistos.has(mailTrim))) {
        continue;
      }
      if (docTrim) docsVistos.add(docTrim);
      if (mailTrim) correosVistos.add(mailTrim);
      resultados.push(d);
    }
  }

  if (q && (tipo === "todos" || tipo === "estudiantes")) {
    const { rows: estudiantesRows } = await query(
      `SELECT 'est_' || e.id_estudiantes AS id,
              NULL AS id_usuarios,
              (e.nombres || ' ' || e.apellidos) AS nombre,
              e.nombres,
              e.apellidos,
              COALESCE(e.correo_institucional, e.correo_personal, '') AS email,
              e.numero_documento AS documento,
              COALESCE(e.codigo_externo, e.numero_documento) AS codigo,
              'estudiante' AS rol,
              'Estudiante - ' || COALESCE(e.estado_matricula, 'MATRICULADO') AS cargo,
              COALESCE(prog.nombre, 'No asignado') AS programa,
              e.id_programas_academicos AS id_programa,
              (e.estado_matricula = 'MATRICULADO' OR e.estado_matricula = 'ACTIVO') AS activo,
              false AS tiene_cuenta,
              'estudiante' AS tipo_registro
       FROM sat.estudiantes e
       LEFT JOIN sat.programas_academicos prog ON e.id_programas_academicos = prog.id_programas_academicos
       WHERE (
         e.numero_documento ILIKE $1
         OR e.codigo_externo ILIKE $1
         OR e.correo_institucional ILIKE $1
         OR e.correo_personal ILIKE $1
         OR (e.nombres || ' ' || e.apellidos) ILIKE $1
       )
       LIMIT 30`,
      [paramQ]
    );

    for (const est of estudiantesRows) {
      const docTrim = est.documento ? String(est.documento).trim() : null;
      const mailTrim = est.email ? String(est.email).trim().toLowerCase() : null;
      if ((docTrim && docsVistos.has(docTrim)) || (mailTrim && correosVistos.has(mailTrim))) {
        continue;
      }
      if (docTrim) docsVistos.add(docTrim);
      if (mailTrim) correosVistos.add(mailTrim);
      resultados.push(est);
    }
  }

  if ((q && tipo === "todos") || tipo === "administrativos") {
    const { rows: administrativosRows } = await query(
      `SELECT COALESCE(u.id_usuarios::text, 'adm_' || pv.id_participantes_vec::text) AS id,
              u.id_usuarios,
              COALESCE(
                NULLIF(BTRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), ''),
                NULLIF(BTRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido)), '')
              ) AS nombre,
              COALESCE(
                NULLIF(BTRIM(u.nombres), ''),
                NULLIF(BTRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre)), '')
              ) AS nombres,
              COALESCE(
                NULLIF(BTRIM(u.apellidos), ''),
                NULLIF(BTRIM(CONCAT_WS(' ', p.primer_apellido, p.segundo_apellido)), '')
              ) AS apellidos,
              COALESCE(
                NULLIF(BTRIM(u.correo_institucional), ''),
                NULLIF(BTRIM(p.correo_institucional), ''),
                NULLIF(BTRIM(p.correo_electronico), '')
              ) AS email,
              p.numero_identificacion AS documento,
              COALESCE(NULLIF(BTRIM(pv.codigo), ''), p.numero_identificacion) AS codigo,
              COALESCE((
                SELECT r.nombre
                FROM sat.usuarios_roles ur
                JOIN sat.roles r ON r.id_roles = ur.id_roles
                WHERE ur.id_usuarios = u.id_usuarios
                ORDER BY ur.asignado_en NULLS LAST
                LIMIT 1
              ), 'Administrativo') AS rol,
              COALESCE(NULLIF(BTRIM(u.cargo), ''), NULLIF(BTRIM(pv.cargo), ''), 'Administrativo') AS cargo,
              'Todos' AS programa,
              NULL AS id_programa,
              COALESCE(u.activo AND u.eliminado_en IS NULL, false) AS activo,
              (u.id_usuarios IS NOT NULL AND u.eliminado_en IS NULL) AS tiene_cuenta,
              'administrativo' AS tipo_registro
       FROM sat.participantes_vec pv
       JOIN sat.personas p ON p.id = pv.id_personas
       LEFT JOIN LATERAL (
         SELECT usuario.*
         FROM sat.usuarios usuario
         WHERE usuario.id_personas = p.id
            OR usuario.numero_documento = p.numero_identificacion
         ORDER BY (usuario.eliminado_en IS NULL) DESC,
                  usuario.activo DESC,
                  usuario.creado_en DESC
         LIMIT 1
       ) u ON true
       WHERE pv.tipo_participante = 'ADMINISTRATIVO'
         AND (
           $1 = ''
           OR p.numero_identificacion ILIKE $1
           OR COALESCE(pv.codigo, '') ILIKE $1
           OR COALESCE(u.correo_institucional, p.correo_institucional, p.correo_electronico, '') ILIKE $1
           OR COALESCE(pv.cargo, '') ILIKE $1
           OR COALESCE(pv.dependencia, '') ILIKE $1
           OR BTRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido)) ILIKE $1
           OR BTRIM(CONCAT_WS(' ', p.primer_apellido, p.segundo_apellido, p.primer_nombre, p.segundo_nombre)) ILIKE $1
           OR COALESCE(u.nombres || ' ' || u.apellidos, '') ILIKE $1
         )
       ORDER BY nombre
       LIMIT 500`,
      [q ? paramQ : ""]
    );

    for (const administrativo of administrativosRows) {
      const docTrim = administrativo.documento
        ? String(administrativo.documento).trim()
        : null;
      const mailTrim = administrativo.email
        ? String(administrativo.email).trim().toLowerCase()
        : null;
      if (
        (docTrim && docsVistos.has(docTrim)) ||
        (mailTrim && correosVistos.has(mailTrim))
      ) {
        continue;
      }
      if (docTrim) docsVistos.add(docTrim);
      if (mailTrim) correosVistos.add(mailTrim);
      resultados.push(administrativo);
    }
  }

  return resultados;
}

export async function listarProgramas() {
  const { rows } = await query(`
    SELECT id_programas_academicos AS id, nombre, codigo_externo, activo
    FROM sat.programas_academicos
    WHERE activo = true
    ORDER BY nombre;
  `);
  return rows;
}

export function listarCargos() {
  return {
    administrativo: [
      "Coordinador de Acompañamiento",
      "Vicerrectora de Evangelización de las Culturas",
      "Administrador de Sistema SAT"
    ],
    profesional: [
      "Docente Acompañante",
      "Docente Tutor",
      "Coordinador Paz y Convivencia",
      "Enfermería San Damián",
      "Coordinador Pastoral",
      "Unidad de Salud María Goretti",
      "Trabajo Social",
      "Unidad de Servicios Psicológicos (USP)",
      "Unidad de Servicios Psicológicos Leopoldo Mandic",
      "Inclusión y Diversidad",
      "Consultorios Jurídicos"
    ],
    directivo: [
      "Director de Programa",
      "Coordinador de Especializaciones",
      "Coordinador Académico (Psicología)",
      "Coordinador Académico (Sistemas)",
      "Coordinador Académico"
    ]
  };
}

export async function listarLineasAccion() {
  const { rows } = await query(
    `SELECT DISTINCT ON (LOWER(${LINEA_ACCION_NOMBRE_SQL}))
            id_lineas_accion AS id,
            ${LINEA_ACCION_NOMBRE_SQL} AS nombre
     FROM sat.lineas_accion
     WHERE NULLIF(${LINEA_ACCION_NOMBRE_SQL}, '') IS NOT NULL
       AND ${LINEA_ACCION_NORMALIZADA_SQL} NOT IN ${LINEAS_ACCION_EXCLUIDAS}
     ORDER BY LOWER(${LINEA_ACCION_NOMBRE_SQL}), ${LINEA_ACCION_NOMBRE_SQL}, id_lineas_accion`
  );
  return rows;
}

export async function gestionarAccesoUsuario(body) {
  const {
    id_usuarios,
    documento,
    codigo,
    nombre,
    email,
    rol,
    cargo,
    id_programa,
    activo = true,
    resetear_password = false,
    password: passwordPersonalizada,
    lineasAccion
  } = body;

  if (!email || !nombre) {
    const error = new Error("El nombre y el correo institucional son obligatorios.");
    error.status = 400;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const partes = String(nombre).trim().split(/\s+/);
    const nombres = partes[0] || "Usuario";
    const apellidos = partes.length > 1 ? partes.slice(1).join(" ") : "";
    const emailNorm = String(email).trim().toLowerCase();
    const docNorm = documento ? String(documento).trim() : null;

    let targetUserId = id_usuarios;

    if (!targetUserId) {
      const { rows: exist } = await client.query(
        `SELECT id_usuarios FROM sat.usuarios 
         WHERE LOWER(correo_institucional) = $1 OR ($2::text IS NOT NULL AND numero_documento = $2)
         LIMIT 1`,
        [emailNorm, docNorm]
      );
      if (exist.length > 0) {
        targetUserId = exist[0].id_usuarios;
      }
    }

    const claveSolicitada = (passwordPersonalizada && String(passwordPersonalizada).trim())
      ? String(passwordPersonalizada).trim()
      : (resetear_password ? "cesmag2026*" : null);

    let claveAplicada = claveSolicitada;

    if (targetUserId) {
      const { rows: userDb } = await client.query(
        `SELECT password_hash FROM sat.usuarios WHERE id_usuarios = $1`,
        [targetUserId]
      );
      const tienePass = Boolean(userDb[0]?.password_hash);
      const claveFinal = claveSolicitada || (!tienePass ? "cesmag2026*" : null);
      claveAplicada = claveFinal || "Contraseña preexistente en base de datos";

      const updates = [
        `nombres = $1`,
        `apellidos = $2`,
        `correo_institucional = $3`,
        `cargo = $4`,
        `activo = $5`,
        `intentos_fallidos = 0`,
        `bloqueado_hasta = NULL`,
        `eliminado_en = NULL`,
        `actualizado_en = NOW()`
      ];
      const params = [nombres, apellidos, emailNorm, cargo || "Personal Institucional", activo];
      let pIdx = 6;

      if (docNorm) {
        updates.push(`numero_documento = $${pIdx}`);
        params.push(docNorm);
        pIdx++;
      }

      if (claveFinal) {
        const hash = await bcrypt.hash(claveFinal, 10);
        updates.push(`password_hash = $${pIdx}`);
        params.push(hash);
        pIdx++;
        updates.push(`debe_cambiar_password = true`);
      }

      params.push(targetUserId);
      await client.query(
        `UPDATE sat.usuarios SET ${updates.join(", ")} WHERE id_usuarios = $${pIdx}`,
        params
      );
    } else {
      const claveFinalNueva = claveSolicitada || "cesmag2026*";
      claveAplicada = claveFinalNueva;
      const hash = await bcrypt.hash(claveFinalNueva, 10);
      const { rows: nuevo } = await client.query(
        `INSERT INTO sat.usuarios (
          tipo_documento, numero_documento, nombres, apellidos, correo_institucional,
          password_hash, cargo, activo, debe_cambiar_password, intentos_fallidos, bloqueado_hasta, creado_en, actualizado_en
        ) VALUES (
          'CC', $1, $2, $3, $4, $5, $6, $7, true, 0, NULL, NOW(), NOW()
        )
        RETURNING id_usuarios`,
        [docNorm || `DOC-${Date.now()}`, nombres, apellidos, emailNorm, hash, cargo || "Docente Acompañante", activo]
      );
      targetUserId = nuevo[0].id_usuarios;
    }

    const rolElegido = (rol || "profesional").toLowerCase();
    const { rows: rolRows } = await client.query(
      `SELECT id_roles FROM sat.roles WHERE LOWER(nombre) = $1 LIMIT 1`,
      [rolElegido]
    );

    if (rolElegido === ROL_REPORTE_ACTIVIDADES && rolRows.length === 0) {
      const err = new Error("No se encontró el rol Reporte de Actividades.");
      err.status = 400;
      throw err;
    }

    if (rolRows.length > 0) {
      const idRol = rolRows[0].id_roles;
      await client.query(`DELETE FROM sat.usuarios_roles WHERE id_usuarios = $1`, [targetUserId]);
      await client.query(
        `INSERT INTO sat.usuarios_roles (id_usuarios, id_roles, asignado_en) VALUES ($1, $2, NOW())`,
        [targetUserId, idRol]
      );
    }

    await guardarPermisosLineasReporte(client, targetUserId, rolElegido, lineasAccion);

    if (id_programa && id_programa !== "todos" && id_programa !== "Todos") {
      await client.query(`DELETE FROM sat.usuarios_programas WHERE id_usuarios = $1`, [targetUserId]);
      await client.query(
        `INSERT INTO sat.usuarios_programas (id_usuarios, id_programas_academicos, rol_en_programa, asignado_en)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (id_usuarios, id_programas_academicos) DO NOTHING`,
        [targetUserId, id_programa, rolElegido === "directivo" ? "DIRECTOR" : "DOCENTE_ACOMPANANTE"]
      );
    } else {
      await client.query(`DELETE FROM sat.usuarios_programas WHERE id_usuarios = $1`, [targetUserId]);
    }

    if (docNorm || emailNorm) {
      await client.query(
        `UPDATE sat.docentes
         SET id_usuarios = $1,
             correo_institucional = COALESCE(correo_institucional, $2)
         WHERE numero_documento = $3 OR LOWER(correo_institucional) = $2`,
        [targetUserId, emailNorm, docNorm]
      );
    }

    await client.query("COMMIT");

    const { rows: resFinal } = await client.query(
      `${USUARIO_SELECT_ENHANCED} WHERE u.id_usuarios = $1`,
      [targetUserId]
    );

    return {
      ok: true,
      mensaje: `Acceso configurado exitosamente para ${nombre}. Credencial: ${emailNorm} | Clave: ${claveAplicada}`,
      usuario: resFinal[0]
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function toggleEstadoUsuario(id) {
  const { rows } = await query(
    `UPDATE sat.usuarios
     SET activo = NOT activo, actualizado_en = NOW()
     WHERE id_usuarios = $1
     RETURNING id_usuarios, activo, nombres, apellidos`,
    [id]
  );
  if (!rows.length) {
    const error = new Error("Usuario no encontrado.");
    error.status = 404;
    throw error;
  }
  return {
    ok: true,
    id: rows[0].id_usuarios,
    activo: rows[0].activo,
    mensaje: `Acceso del usuario ${rows[0].nombres} ${rows[0].apellidos} actualizado a ${rows[0].activo ? "Activo" : "Inactivo"}.`
  };
}

export async function resetPasswordUsuario(id) {
  const hash = await bcrypt.hash("cesmag2026*", 10);
  const { rows } = await query(
    `UPDATE sat.usuarios
     SET password_hash = $1, debe_cambiar_password = true, actualizado_en = NOW()
     WHERE id_usuarios = $2
     RETURNING id_usuarios, correo_institucional, nombres, apellidos`,
    [hash, id]
  );
  if (!rows.length) {
    const error = new Error("Usuario no encontrado.");
    error.status = 404;
    throw error;
  }
  return {
    ok: true,
    mensaje: `Contraseña restablecida exitosamente a "cesmag2026*" para ${rows[0].correo_institucional}.`
  };
}

export async function obtenerEstadoSincronizacion() {
  const { rows: cargaRows } = await query(`
    SELECT id_cargas_sincronizacion, tipo_dato, iniciada_en, finalizada_en, estado, registros_procesados
    FROM sat.cargas_sincronizacion
    ORDER BY iniciada_en DESC
    LIMIT 1;
  `);

  const { rows: conteos } = await query(`
    SELECT 
      (SELECT COUNT(*) FROM sat.estudiantes) AS total_estudiantes,
      (SELECT COUNT(*) FROM sat.personas) AS total_personas,
      (SELECT COUNT(*) FROM sat.matriculas) AS total_matriculas,
      (SELECT COUNT(*) FROM sat.matriculas_asignaturas) AS total_calificaciones,
      (SELECT COUNT(*) FROM sat.asignaturas) AS total_asignaturas,
      (SELECT COUNT(*) FROM sat.usuarios WHERE eliminado_en IS NULL) AS total_usuarios,
      (SELECT COUNT(*) FROM sat.docentes) AS total_docentes,
      (SELECT COUNT(*) FROM sat.participantes_vec WHERE tipo_participante = 'EGRESADO') AS total_egresados,
      (SELECT COUNT(*) FROM sat.participantes_vec WHERE tipo_participante = 'ADMINISTRATIVO') AS total_administrativos,
      (SELECT COUNT(*) FROM sat.facultades) AS total_facultades;
  `);

  return {
    ok: true,
    conectado: true,
    ultimaCarga: cargaRows[0] || null,
    metricas: conteos[0] || {}
  };
}

export async function crearUsuario(body) {
  const { nombre, email, rol, cargo, programa, lineasAccion } = body;
  if (!nombre || !email || !cargo) {
    const error = new Error("Complete todos los campos del usuario.");
    error.status = 400;
    throw error;
  }

  const partes = String(nombre).trim().split(/\s+/);
  const nombres = partes[0];
  const apellidos = partes.length > 1 ? partes.slice(1).join(" ") : "";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const hash = await bcrypt.hash("cesmag2026*", 10);
    const { rows: creado } = await client.query(
      `INSERT INTO sat.usuarios
         (correo_institucional, password_hash, numero_documento, nombres, apellidos, cargo, debe_cambiar_password, activo)
       VALUES ($1, $2, $3, $4, $5, $6, true, true)
       RETURNING id_usuarios`,
      [email, hash, `TMP-${Date.now()}`, nombres, apellidos, cargo]
    );
    const idUsuario = creado[0].id_usuarios;

    let rolAsignado = rol || "profesional";
    if (rol) {
      const { rows: rolRows } = await client.query(
        `SELECT id_roles, nombre
         FROM sat.roles
         WHERE activo = true AND (LOWER(nombre) = LOWER($1) OR nombre ILIKE '%' || $1 || '%')
         ORDER BY (LOWER(nombre) = LOWER($1)) DESC
         LIMIT 1`,
        [rol]
      );
      if (rolRows.length) {
        await client.query(
          `INSERT INTO sat.usuarios_roles (id_usuarios, id_roles) VALUES ($1, $2)`,
          [idUsuario, rolRows[0].id_roles]
        );
        rolAsignado = rolRows[0].nombre;
      }
    }

    if (
      String(rol || "").trim().toLowerCase() === ROL_REPORTE_ACTIVIDADES &&
      String(rolAsignado).trim().toLowerCase() !== ROL_REPORTE_ACTIVIDADES
    ) {
      const err = new Error("No se encontró el rol Reporte de Actividades.");
      err.status = 400;
      throw err;
    }

    const lineasGuardadas = await guardarPermisosLineasReporte(
      client,
      idUsuario,
      rolAsignado,
      lineasAccion
    );

    await client.query("COMMIT");

    return {
      id: idUsuario,
      nombre,
      email,
      rol: rolAsignado,
      cargo: cargo || "",
      programa: programa || "Todos",
      lineasAccion: lineasGuardadas,
      activo: true,
      tiene_cuenta: true
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "23505") {
      err.status = 409;
      err.message = "Ya existe un usuario con ese correo o documento.";
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function eliminarUsuario(id) {
  const { rows } = await query(
    `WITH baja AS (
       UPDATE sat.usuarios
       SET activo = false, eliminado_en = now(), actualizado_en = now()
       WHERE id_usuarios = $1 AND eliminado_en IS NULL
       RETURNING id_usuarios, nombres, apellidos, correo_institucional
     )
     SELECT baja.id_usuarios AS id,
            (baja.nombres || ' ' || baja.apellidos) AS nombre,
            baja.correo_institucional AS email,
            (
              SELECT r.nombre
              FROM sat.usuarios_roles ur
              JOIN sat.roles r ON r.id_roles = ur.id_roles
              WHERE ur.id_usuarios = baja.id_usuarios
              ORDER BY ur.asignado_en NULLS LAST
              LIMIT 1
            ) AS rol,
            '' AS cargo,
            'Todos' AS programa
     FROM baja`,
    [id]
  );
  if (!rows.length) {
    const error = new Error("Usuario no encontrado.");
    error.status = 404;
    throw error;
  }
  return rows[0];
}

export async function obtenerUmbralesRiesgo() {
  const { rows } = await query(
    `SELECT id_umbrales_permanencia, etapa, etapa_nombre, semestres_texto,
            semestre_min, semestre_max, nivel, puntaje_min, puntaje_max, orden, color_hex
     FROM sat.umbrales_permanencia
     ORDER BY semestre_min ASC, orden ASC`
  );

  const etapasMap = new Map();
  rows.forEach((r) => {
    if (!etapasMap.has(r.etapa)) {
      etapasMap.set(r.etapa, {
        etapa: r.etapa,
        nombre: r.etapa_nombre,
        semestres: r.semestres_texto,
        semestre_min: r.semestre_min,
        semestre_max: r.semestre_max,
        niveles: []
      });
    }
    etapasMap.get(r.etapa).niveles.push({
      id: r.id_umbrales_permanencia,
      nivel: r.nivel,
      puntaje_min: Number(r.puntaje_min),
      puntaje_max: Number(r.puntaje_max),
      orden: r.orden,
      color_hex: r.color_hex
    });
  });

  return {
    ok: true,
    etapas: Array.from(etapasMap.values()),
    alto: 91,
    medio: 84
  };
}

export async function actualizarUmbralesRiesgo(body) {
  const { etapas, alto, medio } = body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (Array.isArray(etapas)) {
      for (const e of etapas) {
        if (Array.isArray(e.niveles)) {
          for (const n of e.niveles) {
            await client.query(
              `UPDATE sat.umbrales_permanencia
               SET puntaje_min = $1, puntaje_max = $2, actualizado_en = now()
               WHERE etapa = $3 AND nivel = $4`,
              [Number(n.puntaje_min), Number(n.puntaje_max), e.etapa, n.nivel]
            );
          }
        }
      }
    }

    if (alto != null && medio != null) {
      await client.query(
        `UPDATE sat.rangos_riesgo SET puntaje_min = $1, actualizado_en = now()
         WHERE lower(nombre) = 'alto'`,
        [Number(alto)]
      ).catch(() => {});
      await client.query(
        `UPDATE sat.rangos_riesgo SET puntaje_min = $1, actualizado_en = now()
         WHERE lower(nombre) = 'medio'`,
        [Number(medio)]
      ).catch(() => {});
    }

    await client.query("COMMIT");

    const { rows } = await client.query(
      `SELECT id_umbrales_permanencia, etapa, etapa_nombre, semestres_texto,
              semestre_min, semestre_max, nivel, puntaje_min, puntaje_max, orden, color_hex
       FROM sat.umbrales_permanencia
       ORDER BY semestre_min ASC, orden ASC`
    );

    const etapasMap = new Map();
    rows.forEach((r) => {
      if (!etapasMap.has(r.etapa)) {
        etapasMap.set(r.etapa, {
          etapa: r.etapa,
          nombre: r.etapa_nombre,
          semestres: r.semestres_texto,
          semestre_min: r.semestre_min,
          semestre_max: r.semestre_max,
          niveles: []
        });
      }
      etapasMap.get(r.etapa).niveles.push({
        id: r.id_umbrales_permanencia,
        nivel: r.nivel,
        puntaje_min: Number(r.puntaje_min),
        puntaje_max: Number(r.puntaje_max),
        orden: r.orden,
        color_hex: r.color_hex
      });
    });

    return {
      ok: true,
      mensaje: "Umbrales institucionales de riesgo actualizados exitosamente.",
      etapas: Array.from(etapasMap.values()),
      alto: Number(alto || 91),
      medio: Number(medio || 84)
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function ejecutarSinc() {
  return await ejecutarSincronizacion();
}

export async function obtenerMatrizPermisos() {
  const { rows: roles } = await query(
    `SELECT nombre AS id, nombre, descripcion
     FROM sat.roles
     WHERE activo = true
     ORDER BY array_position(
                ARRAY['admin','profesional','directivo','reporte_actividades','estudiante']::varchar[],
                nombre
              ) NULLS LAST,
              nombre`
  );
  const mapa = await getMapaPermisos();
  const modulos = MENU_CONFIG.flatMap((section) =>
    section.items.map((item) => ({
      id: item.id,
      name: item.name,
      icon: item.icon,
      seccion: section.title,
      oculto: !!item.hidden,
      roles: mapa[item.id] || [],
      bloqueados: roles.map((r) => r.id).filter((rol) => esBloqueado(item.id, rol))
    }))
  );

  const { rows } = await query(
    `SELECT r.id_roles AS id,
            r.nombre,
            COALESCE(
              (SELECT array_agg((u.nombres || ' ' || u.apellidos) ORDER BY u.apellidos, u.nombres)
               FROM sat.usuarios_roles ur
               JOIN sat.usuarios u ON u.id_usuarios = ur.id_usuarios
               WHERE ur.id_roles = r.id_roles AND u.eliminado_en IS NULL),
              ARRAY[]::text[]
            ) AS integrantes,
            COALESCE(
              (SELECT array_agg(p.codigo ORDER BY p.codigo)
               FROM sat.roles_permisos rp
               JOIN sat.permisos p ON p.id_permisos = rp.id_permisos
               WHERE rp.id_roles = r.id_roles
                 AND p.codigo NOT LIKE $1 || '%'),
              ARRAY[]::text[]
            ) AS permisos
     FROM sat.roles r
     WHERE r.activo = true
     ORDER BY r.nombre`,
    [PREFIJO_ACCESO]
  );

  return {
    roles,
    modulos,
    rolesYPermisos: rows
  };
}

export async function actualizarPermisoModulo(modulo, rol, permitido) {
  if (!modulo || !rol || typeof permitido !== "boolean") {
    const error = new Error("Envíe { modulo, rol, permitido: true | false }.");
    error.status = 400;
    throw error;
  }
  const roles = await setPermisoModulo(modulo, rol, permitido);
  return { modulo, roles };
}
