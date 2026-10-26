/* ==========================================================================
   Feature: Administración - Usuarios y Parámetros (solo admin)
   ========================================================================== */

import { Router } from "express";
import bcrypt from "bcryptjs";
import { MENU_CONFIG } from "../../shared/data/menuConfig.js";
import {
  getMapaPermisos,
  setPermisoModulo,
  esBloqueado,
  PREFIJO_ACCESO
} from "../../shared/security/permisosModulos.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";
import { pool, query } from "../../shared/db/pool.js";
import catalogosRoutes from "./catalogos.routes.js";
import { ejecutarSincronizacion } from "../../shared/services/syncService.js";

const router = Router();

router.use(identifyUser, requireModule("administracion"));

// Catálogos administrables (áreas de remisión, estados de remisión, tipos de intervención)
router.use(catalogosRoutes);

// SELECT enriquecido reutilizable: proyecta usuario completo con rol, cargo, programa y código
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
         true AS tiene_cuenta,
         'usuario' AS tipo_registro
  FROM sat.usuarios u
  LEFT JOIN sat.personas p ON u.id_personas = p.id
  LEFT JOIN sat.docentes d ON d.id_usuarios = u.id_usuarios OR (d.numero_documento = u.numero_documento AND u.numero_documento IS NOT NULL)
  LEFT JOIN sat.usuarios_programas up ON up.id_usuarios = u.id_usuarios
  LEFT JOIN sat.programas_academicos prog_up ON up.id_programas_academicos = prog_up.id_programas_academicos
  LEFT JOIN sat.programas_academicos prog_d ON d.id_programas_academicos = prog_d.id_programas_academicos
`;

// --------------------------------------------------------------------------
// 1. GET /usuarios - Búsqueda multicriterio (código, cédula, nombre, correo)
// --------------------------------------------------------------------------
router.get("/usuarios", async (req, res, next) => {
  const q = String(req.query.q || "").trim();
  const tipo = String(req.query.tipo || "todos").toLowerCase();

  try {
    if (!q && tipo !== "docentes" && tipo !== "estudiantes") {
      const { rows } = await query(
        `${USUARIO_SELECT_ENHANCED} WHERE u.eliminado_en IS NULL ORDER BY u.creado_en DESC`
      );
      return res.json(rows);
    }

    const paramQ = `%${q}%`;
    const resultados = [];
    const docsVistos = new Set();
    const correosVistos = new Set();

    // 1. Buscar en sat.usuarios (usuarios existentes con cuenta)
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

    // 2. Buscar en sat.docentes (docentes sincronizados de prod18sep2)
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

    // 3. Buscar en sat.estudiantes (cuando hay consulta o filtro)
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

    res.json(resultados);
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// 2. GET /programas - Catálogo de programas académicos para asignación
// --------------------------------------------------------------------------
router.get("/programas", async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT id_programas_academicos AS id, nombre, codigo_externo, activo
      FROM sat.programas_academicos
      WHERE activo = true
      ORDER BY nombre;
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// 3. GET /cargos-catalogo - Catálogo de cargos e integrantes según diagrama
// --------------------------------------------------------------------------
router.get("/cargos-catalogo", (req, res) => {
  res.json({
    administrativo: [
      "Coordinador de Acompañamiento",
      "Vicerrectora de Evangelización de las Culturas",
      "Administrador de Sistema SAT"
    ],
    profesional: [
      "Docente Acompañante",
      "Docente Tutor",
      "Docente Asistencial Unidad Servicios Psicológicos",
      "Coordinador Paz y Convivencia",
      "Enfermería San Damián",
      "Coordinador Pastoral",
      "Área de Salud María Goretti",
      "Psicólogo de Área",
      "Trabajo Social",
      "Unidad de Servicios Psicológicos (USP)",
      "Coordinador de Servicios Psicológicos",
      "Consultorios Jurídicos"
    ],
    directivo: [
      "Director de Programa",
      "Coordinador de Especializaciones",
      "Coordinador Académico (Psicología)",
      "Coordinador Académico (Sistemas)",
      "Coordinador Académico"
    ]
  });
});

// --------------------------------------------------------------------------
// 4. POST /usuarios/gestionar-acceso - Crear o administrar acceso completo
// --------------------------------------------------------------------------
router.post("/usuarios/gestionar-acceso", async (req, res, next) => {
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
    password: passwordPersonalizada
  } = req.body;

  if (!email || !nombre) {
    return res.status(400).json({ error: "El nombre y el correo institucional son obligatorios." });
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
      // Verificar si el usuario ya cuenta con hash de contraseña
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

    // Asignar rol
    const rolElegido = (rol || "profesional").toLowerCase();
    const { rows: rolRows } = await client.query(
      `SELECT id_roles FROM sat.roles WHERE LOWER(nombre) = $1 LIMIT 1`,
      [rolElegido]
    );

    if (rolRows.length > 0) {
      const idRol = rolRows[0].id_roles;
      await client.query(`DELETE FROM sat.usuarios_roles WHERE id_usuarios = $1`, [targetUserId]);
      await client.query(
        `INSERT INTO sat.usuarios_roles (id_usuarios, id_roles, asignado_en) VALUES ($1, $2, NOW())`,
        [targetUserId, idRol]
      );
    }

    // Asignar Programa si aplica
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

    // Vincular y sincronizar a sat.docentes si es docente
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

    res.json({
      ok: true,
      mensaje: `Acceso configurado exitosamente para ${nombre}. Credencial: ${emailNorm} | Clave: ${claveAplicada}`,
      usuario: resFinal[0]
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// --------------------------------------------------------------------------
// 5. PATCH /usuarios/:id/toggle-estado - Alternar estado activo/inactivo
// --------------------------------------------------------------------------
router.patch("/usuarios/:id/toggle-estado", async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE sat.usuarios
       SET activo = NOT activo, actualizado_en = NOW()
       WHERE id_usuarios = $1
       RETURNING id_usuarios, activo, nombres, apellidos`,
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }
    res.json({
      ok: true,
      id: rows[0].id_usuarios,
      activo: rows[0].activo,
      mensaje: `Acceso del usuario ${rows[0].nombres} ${rows[0].apellidos} actualizado a ${rows[0].activo ? "Activo" : "Inactivo"}.`
    });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// 6. POST /usuarios/:id/reset-password - Restablecer contraseña a temporal
// --------------------------------------------------------------------------
router.post("/usuarios/:id/reset-password", async (req, res, next) => {
  try {
    const hash = await bcrypt.hash("cesmag2026*", 10);
    const { rows } = await query(
      `UPDATE sat.usuarios
       SET password_hash = $1, debe_cambiar_password = true, actualizado_en = NOW()
       WHERE id_usuarios = $2
       RETURNING id_usuarios, correo_institucional, nombres, apellidos`,
      [hash, req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }
    res.json({
      ok: true,
      mensaje: `Contraseña restablecida exitosamente a "cesmag2026*" para ${rows[0].correo_institucional}.`
    });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// 7. GET /estado-sincronizacion
// --------------------------------------------------------------------------
router.get("/estado-sincronizacion", async (req, res, next) => {
  try {
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
        (SELECT COUNT(*) FROM sat.facultades) AS total_facultades;
    `);

    res.json({
      ok: true,
      conectado: true,
      ultimaCarga: cargaRows[0] || null,
      metricas: conteos[0] || {}
    });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// 8. POST /usuarios - Crear usuario directo
// --------------------------------------------------------------------------
router.post("/usuarios", async (req, res, next) => {
  const { nombre, email, rol, cargo, programa } = req.body;
  if (!nombre || !email || !cargo) {
    return res.status(400).json({ error: "Complete todos los campos del usuario." });
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

    await client.query("COMMIT");

    res.status(201).json({
      id: idUsuario,
      nombre,
      email,
      rol: rolAsignado,
      cargo: cargo || "",
      programa: programa || "Todos",
      activo: true,
      tiene_cuenta: true
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "23505") {
      err.status = 409;
      err.message = "Ya existe un usuario con ese correo o documento.";
    }
    next(err);
  } finally {
    client.release();
  }
});

// --------------------------------------------------------------------------
// 9. DELETE /usuarios/:id - Desactivar usuario (soft delete)
// --------------------------------------------------------------------------
router.delete("/usuarios/:id", async (req, res, next) => {
  try {
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
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "22P02") {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }
    next(err);
  }
});

// --------------------------------------------------------------------------
// 10. GET & PUT /umbrales-riesgo
// --------------------------------------------------------------------------
router.get("/umbrales-riesgo", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         max(puntaje_min) FILTER (WHERE lower(nombre) = 'alto')  AS alto,
         max(puntaje_min) FILTER (WHERE lower(nombre) = 'medio') AS medio
       FROM sat.rangos_riesgo
       WHERE activo = true`
    );
    const { alto, medio } = rows[0] || {};
    res.json({
      alto: alto == null ? null : Number(alto),
      medio: medio == null ? null : Number(medio)
    });
  } catch (err) {
    next(err);
  }
});

router.put("/umbrales-riesgo", async (req, res, next) => {
  const { alto, medio } = req.body;
  if (alto == null || medio == null) {
    return res.status(400).json({ error: "Debe enviar los umbrales alto y medio." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE sat.rangos_riesgo SET puntaje_min = $1, actualizado_en = now()
       WHERE lower(nombre) = 'alto'`,
      [Number(alto)]
    );
    await client.query(
      `UPDATE sat.rangos_riesgo SET puntaje_min = $1, actualizado_en = now()
       WHERE lower(nombre) = 'medio'`,
      [Number(medio)]
    );
    await client.query("COMMIT");
    res.json({ alto: Number(alto), medio: Number(medio) });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// --------------------------------------------------------------------------
// 11. POST /sincronizar
// --------------------------------------------------------------------------
router.post("/sincronizar", async (req, res, next) => {
  try {
    const resultado = await ejecutarSincronizacion();
    res.json({
      ok: true,
      estudiantesSincronizados: resultado.estudiantes,
      totalProcesados: resultado.totalProcesados,
      calificaciones: resultado.calificaciones,
      facultades: resultado.facultades,
      docentes: resultado.docentes,
      duracionSegundos: resultado.duracionSegundos,
      mensaje: `Sincronización exitosa: ${resultado.estudiantes} estudiantes, ${resultado.docentes || 0} docentes, ${resultado.facultades || 0} facultades y ${resultado.calificaciones} calificaciones procesadas en ${resultado.duracionSegundos}s.`
    });
  } catch (err) {
    console.error("Error en endpoint /sincronizar:", err);
    res.status(500).json({
      ok: false,
      error: "Error durante la sincronización institucional",
      detalle: err.message
    });
  }
});

// --------------------------------------------------------------------------
// 12. GET & PUT /matriz-permisos
// --------------------------------------------------------------------------
router.get("/matriz-permisos", async (req, res, next) => {
  try {
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

    res.json({
      roles,
      modulos,
      rolesYPermisos: rows
    });
  } catch (err) {
    next(err);
  }
});

router.put("/matriz-permisos", async (req, res, next) => {
  const { modulo, rol, permitido } = req.body || {};
  if (!modulo || !rol || typeof permitido !== "boolean") {
    return res.status(400).json({ error: "Envíe { modulo, rol, permitido: true | false }." });
  }
  try {
    const roles = await setPermisoModulo(modulo, rol, permitido);
    res.json({ modulo, roles });
  } catch (err) {
    next(err);
  }
});

export default router;
