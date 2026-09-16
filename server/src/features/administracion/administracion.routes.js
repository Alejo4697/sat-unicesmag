/* ==========================================================================
   Feature: Administración - Usuarios y Parámetros (solo admin)
   GET    /api/administracion/usuarios          -> lista completa de usuarios
   POST   /api/administracion/usuarios          -> crear usuario (RQF05)
   DELETE /api/administracion/usuarios/:id      -> desactivar/quitar usuario
   GET    /api/administracion/umbrales-riesgo   -> umbrales actuales (RQF11)
   PUT    /api/administracion/umbrales-riesgo   -> actualizar umbrales (RQF11)
   POST   /api/administracion/sincronizar       -> simula la sincronización
                                                     académica institucional (RQF08)
   GET    /api/administracion/matriz-permisos   -> módulos x roles (editable)
                                                     + roles[].permisos
   PUT    /api/administracion/matriz-permisos   -> { modulo, rol, permitido }
                                                     concede/quita el acceso
                                                     (sat.roles_permisos)

   Catálogos administrables (CRUD contra schema `sat`) en catalogos.routes.js:
     /api/administracion/areas-remision      <-> sat.dependencias
     /api/administracion/estados-remision    <-> sat.estados_remision
     /api/administracion/tipos-intervencion  <-> sat.tipos_intervencion
   ==========================================================================
   Esta feature es la ÚNICA migrada a PostgreSQL real (schema `sat`) - ver
   server/src/shared/db/pool.js. El resto de features (alertas, intervenciones,
   etc.) y el middleware de RBAC (requireRole.js) siguen usando MOCK_DATA a
   propósito. /sincronizar se mantiene como simulación. La matriz de acceso
   por módulo ya es editable y vive en BD (shared/security/permisosModulos.js).

   La forma del JSON de cada endpoint se conserva 1:1 con la versión mock para
   no romper client/src/features/administracion/AdministracionPage.jsx:
     - usuario  -> { id, nombre, email, rol, cargo, programa }
     - umbrales -> { alto, medio }   (números)
     - matriz   -> { roles: [{ id, nombre, descripcion }],
                     modulos: [{ id, name, icon, seccion, roles, bloqueados }],
                     rolesYPermisos: [{ id, nombre, integrantes, permisos }] }

   Notas de mapeo (schema `sat` no tiene equivalente directo para todo):
     - `rol`      -> sat.roles.nombre del primer rol asignado (texto tal cual).
     - `cargo`    -> "" y `programa` -> "Todos": aún no hay columna/enlace real.
     - POST crea el usuario con credenciales placeholder + debe_cambiar_password.
     - DELETE es soft-delete (activo=false, eliminado_en=now()).
     - umbrales <-> sat.rangos_riesgo.puntaje_min de las filas "Alto" / "Medio".
   ========================================================================== */

import { Router } from "express";
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

const router = Router();

router.use(identifyUser, requireModule("administracion"));

// Catálogos administrables (áreas de remisión, estados de remisión, tipos de
// intervención) - CRUD contra el schema `sat`, ver catalogos.routes.js.
router.use(catalogosRoutes);

// SELECT reutilizable: proyecta una fila de sat.usuarios a la forma JSON
// { id, nombre, email, rol, cargo, programa } que ya espera el cliente.
const USUARIO_SELECT = `
  SELECT u.id_usuarios AS id,
         (u.nombres || ' ' || u.apellidos) AS nombre,
         u.correo_institucional AS email,
         (
           SELECT r.nombre
           FROM sat.usuarios_roles ur
           JOIN sat.roles r ON r.id_roles = ur.id_roles
           WHERE ur.id_usuarios = u.id_usuarios
           ORDER BY ur.asignado_en NULLS LAST
           LIMIT 1
         ) AS rol,
         '' AS cargo,
         'Todos' AS programa
  FROM sat.usuarios u
`;

router.get("/usuarios", async (req, res, next) => {
  try {
    const { rows } = await query(
      `${USUARIO_SELECT} WHERE u.eliminado_en IS NULL ORDER BY u.creado_en`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Espeja crearUsuario() de assets/js/administracion.js.
router.post("/usuarios", async (req, res, next) => {
  const { nombre, email, rol, cargo, programa } = req.body;
  if (!nombre || !email || !cargo) {
    return res.status(400).json({ error: "Complete todos los campos del usuario." });
  }

  // "Dr. Juan Manuel Botina" -> nombres="Dr.", apellidos="Juan Manuel Botina".
  // sat.usuarios separa nombres/apellidos; el formulario manda un solo campo.
  const partes = String(nombre).trim().split(/\s+/);
  const nombres = partes[0];
  const apellidos = partes.length > 1 ? partes.slice(1).join(" ") : "";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Credenciales placeholder: el alta desde Administración no captura
    // documento ni contraseña. Se marca debe_cambiar_password para forzar
    // el cambio cuando exista autenticación real (RQF01).
    const { rows: creado } = await client.query(
      `INSERT INTO sat.usuarios
         (correo_institucional, password_hash, numero_documento, nombres, apellidos, debe_cambiar_password)
       VALUES ($1, 'PENDIENTE', $2, $3, $4, true)
       RETURNING id_usuarios`,
      [email, `TMP-${Date.now()}`, nombres, apellidos]
    );
    const idUsuario = creado[0].id_usuarios;

    // Vincula el rol si el texto recibido coincide con un sat.roles.nombre
    // (exacto o por coincidencia parcial). Si no hay match, el usuario queda
    // creado sin rol - se puede asignar después.
    let rolAsignado = rol || "profesional";
    if (rol) {
      const { rows: rolRows } = await client.query(
        `SELECT id_roles, nombre
         FROM sat.roles
         WHERE activo = true AND (nombre = $1 OR nombre ILIKE '%' || $1 || '%')
         ORDER BY (nombre = $1) DESC
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
      programa: programa || "Todos"
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

// Espeja desactivarUsuario(): soft-delete, devuelve el usuario dado de baja
// con la misma forma que GET /usuarios.
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
    // id inválido (no es uuid) -> 22P02: mismo 404 que "no encontrado".
    if (err.code === "22P02") {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }
    next(err);
  }
});

// Umbrales de semaforización (RQF11): las filas "Alto" y "Medio" de
// sat.rangos_riesgo. `alto`/`medio` = puntaje_min de cada rango.
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

// Espeja guardarUmbralesRiesgo().
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

// Espeja simularSincronizacionAcademica() - sigue siendo una simulación
// (no hay un sistema académico real que consultar todavía), pero ahora
// corre en el servidor en vez de ser un setTimeout puramente decorativo
// en el navegador. `estudiantesSincronizados` es un número simulado hasta
// que exista la integración real con el sistema académico (RQF08).
router.post("/sincronizar", (req, res) => {
  const estudiantesSincronizados = 4800 + Math.floor(Math.random() * 120);
  res.json({
    ok: true,
    estudiantesSincronizados,
    mensaje: `Se sincronizaron ${estudiantesSincronizados} estudiantes correctamente.`
  });
});

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

// Concede (permitido=true) o quita (false) el acceso de un rol a un módulo.
// Responde el módulo con su lista de roles actualizada.
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
