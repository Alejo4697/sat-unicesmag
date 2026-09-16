/* ==========================================================================
   SAT-UNICESMAG - Permisos de acceso por módulo (RQF03 / RBAC editable)
   ==========================================================================
   Antes "qué rol ve qué módulo" estaba fijo en shared/data/menuConfig.js.
   Ahora vive en PostgreSQL y se edita desde Administración → Matriz de
   Roles y Permisos:

     sat.modulos          -> un registro por módulo (codigo = id del menú)
     sat.permisos         -> un permiso "acceso:<codigo>" por módulo
     sat.roles_permisos   -> qué rol (sat.roles.nombre = admin, profesional...)
                             tiene ese permiso

   Los datos iniciales los carga shared/db/permisos_modulos.sql
   (npm run db:permisos) copiando los valores por defecto de menuConfig.js.

   menuConfig.js sigue siendo el catálogo de módulos (nombre, ícono, ruta,
   sección) y el RESPALDO: si la BD aún no tiene sat.modulos cargado o no
   responde, se usan sus roles por defecto para no dejar a nadie sin acceso.

   Se cachea en memoria unos segundos para no consultar la BD en cada
   request; cualquier cambio hecho desde la API invalida la caché al
   instante (y lo hecho directo en pgAdmin se ve al vencer el TTL).
   ========================================================================== */

import { query } from "../db/pool.js";
import { MENU_CONFIG, MODULE_ROLES } from "../data/menuConfig.js";

export const PREFIJO_ACCESO = "acceso:";

// Celdas que no se pueden quitar desde la UI: evita que el administrador
// se quede sin acceso a la pantalla desde la que se reparan los permisos.
export const PERMISOS_BLOQUEADOS = [{ modulo: "administracion", rol: "admin" }];

export function esBloqueado(modulo, rol) {
  return PERMISOS_BLOQUEADOS.some((p) => p.modulo === modulo && p.rol === rol);
}

const TTL_MS = 30_000;
let cache = null; // { mapa: { modulo: [roles] }, origen: "bd" | "respaldo", en: timestamp }

export function invalidarPermisos() {
  cache = null;
}

async function leerDeBD() {
  const { rows } = await query(
    `SELECT m.codigo AS modulo,
            COALESCE(array_agg(r.nombre ORDER BY r.nombre)
                     FILTER (WHERE r.nombre IS NOT NULL), ARRAY[]::text[]) AS roles
     FROM sat.modulos m
     JOIN sat.permisos p
       ON p.id_modulos = m.id_modulos AND p.codigo = $1 || m.codigo
     LEFT JOIN sat.roles_permisos rp ON rp.id_permisos = p.id_permisos
     LEFT JOIN sat.roles r ON r.id_roles = rp.id_roles AND r.activo = true
     WHERE m.activo = true AND p.activo = true
     GROUP BY m.codigo`,
    [PREFIJO_ACCESO]
  );
  return rows;
}

/**
 * Mapa { idModulo: [roles] } vigente.
 * Módulos del menú que no estén en la BD conservan su valor por defecto.
 */
export async function getMapaPermisos() {
  if (cache && Date.now() - cache.en < TTL_MS) return cache.mapa;

  const mapa = { ...MODULE_ROLES };
  let origen = "respaldo";
  try {
    const rows = await leerDeBD();
    if (rows.length) {
      rows.forEach((r) => {
        if (r.modulo in mapa) mapa[r.modulo] = r.roles;
      });
      origen = "bd";
    } else {
      console.warn("[permisos] sat.modulos está vacío: se usan los permisos por defecto de menuConfig.js. Ejecute `npm run db:permisos`.");
    }
  } catch (err) {
    console.error("[permisos] No se pudo leer la matriz desde PostgreSQL; se usan los permisos por defecto.", err.message);
  }

  // El admin nunca pierde Administración (ver PERMISOS_BLOQUEADOS).
  PERMISOS_BLOQUEADOS.forEach(({ modulo, rol }) => {
    if (mapa[modulo] && !mapa[modulo].includes(rol)) mapa[modulo] = [...mapa[modulo], rol];
  });

  cache = { mapa, origen, en: Date.now() };
  return mapa;
}

export async function rolesParaModulo(moduleId) {
  const mapa = await getMapaPermisos();
  return mapa[moduleId] || [];
}

/**
 * Secciones del sidebar visibles para un rol (sin ítems `hidden` y sin
 * secciones vacías).
 */
export async function menuParaRol(rol) {
  const mapa = await getMapaPermisos();
  return MENU_CONFIG.map(({ title, items }) => ({
    title,
    items: items.filter((item) => !item.hidden && (mapa[item.id] || []).includes(rol))
  })).filter((section) => section.items.length > 0);
}

/**
 * Concede o quita el acceso de un rol a un módulo.
 * Lanza errores con `status` para que el router responda 400/404.
 */
export async function setPermisoModulo(modulo, rol, permitido) {
  const existeModulo = MENU_CONFIG.some((s) => s.items.some((i) => i.id === modulo));
  if (!existeModulo) {
    throw Object.assign(new Error(`Módulo desconocido: "${modulo}".`), { status: 404 });
  }
  if (!permitido && esBloqueado(modulo, rol)) {
    throw Object.assign(
      new Error("El rol Administrativo no puede perder el acceso a Usuarios y Parámetros."),
      { status: 400 }
    );
  }

  const { rows: ids } = await query(
    `SELECT
       (SELECT id_roles FROM sat.roles WHERE nombre = $1 AND activo = true) AS id_rol,
       (SELECT p.id_permisos
        FROM sat.permisos p
        JOIN sat.modulos m ON m.id_modulos = p.id_modulos
        WHERE m.codigo = $2 AND p.codigo = $3 || $2) AS id_permiso`,
    [rol, modulo, PREFIJO_ACCESO]
  );
  const { id_rol: idRol, id_permiso: idPermiso } = ids[0];
  if (!idRol) {
    throw Object.assign(new Error(`Rol desconocido o inactivo: "${rol}".`), { status: 404 });
  }
  if (!idPermiso) {
    throw Object.assign(
      new Error("La matriz de permisos no está inicializada en la base de datos. Ejecute `npm run db:permisos`."),
      { status: 409 }
    );
  }

  if (permitido) {
    await query(
      `INSERT INTO sat.roles_permisos (id_roles, id_permisos) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [idRol, idPermiso]
    );
  } else {
    await query(`DELETE FROM sat.roles_permisos WHERE id_roles = $1 AND id_permisos = $2`, [idRol, idPermiso]);
  }

  invalidarPermisos();
  return rolesParaModulo(modulo);
}
