/* ==========================================================================
   SAT-UNICESMAG - Menú Dinámico por Rol (RQF03)
   Portado 1:1 desde assets/js/menu.js del mockup estático.
   Catálogo de módulos (id, nombre, ícono, ruta, sección).

   Los `roles` de cada sección son ahora solo los PERMISOS POR DEFECTO:
   el acceso real vive en PostgreSQL (sat.modulos / sat.permisos /
   sat.roles_permisos) y se edita desde Administración → Matriz de Roles y
   Permisos. Ver shared/security/permisosModulos.js. Estos valores se usan
   para sembrar la BD (shared/db/permisos_modulos.sql) y como respaldo si
   la BD no está disponible. Si agrega un módulo nuevo, agréguelo también
   a ese SQL.

   `hidden: true` en un item = el módulo EXISTE y conserva su RBAC (sigue en
   MODULE_ROLES, requireModule() y ProtectedRoute lo resuelven igual), pero
   NO se pinta en el sidebar. Se accede a él desde otra pantalla (p. ej.
   Intervenciones y Remisiones se abren desde la Ficha 360° del estudiante).
   ========================================================================== */

export const MENU_CONFIG = [
  {
    title: "Monitoreo",
    roles: ["admin", "profesional", "directivo", "reporte_actividades"],
    items: [
      { id: "dashboard", name: "Tablero General", icon: "fa-chart-pie", href: "dashboard" }
    ]
  },
  {
    title: "Permanencia & Casos",
    roles: ["admin", "profesional", "directivo"],
    items: [
      { id: "ficha", name: "Ficha 360° Estudiante", icon: "fa-address-card", href: "ficha-estudiante" },
      { id: "alertas", name: "Alertas Tempranas", icon: "fa-bell", href: "alertas" },
      // Fuera del sidebar (hidden): se accede a estos módulos desde los
      // botones de la Ficha 360°, ya con el estudiante en contexto. El RBAC
      // no cambia: siguen en MODULE_ROLES con los roles de esta sección.
      { id: "intervenciones", name: "Intervenciones", icon: "fa-clipboard-check", href: "intervenciones", hidden: true },
      { id: "remisiones", name: "Remisiones", icon: "fa-share-nodes", href: "remisiones", hidden: true }
    ]
  },
  {
    title: "Caracterización",
    roles: ["admin", "estudiante"],
    items: [
      { id: "caracterizacion", name: "Formulario Caracterización (Instrumento)", icon: "fa-list-check", href: "caracterizacion" }
    ]
  },

  {
    title: "Informes & SNIES",
    // NOTA: en el mockup original hay una inconsistencia real entre menu.js
    // (que sí le da acceso al módulo a reporte_actividades) y mock-data.js
    // (cuyo objeto de permisos de ese rol no incluye ningún permiso de
    // reportes). Se preserva el comportamiento visible tal cual estaba
    // en el mockup; conviene revisarlo con el dueño del producto.
    roles: ["admin", "profesional", "directivo", "reporte_actividades"],
    items: [
      { id: "reportes", name: "Reportes y Exportación", icon: "fa-file-arrow-down", href: "reportes" }
    ]
  },
  {
    title: "Administración",
    roles: ["admin"],
    items: [
      { id: "administracion", name: "Usuarios y Parámetros", icon: "fa-sliders", href: "administracion" }
    ]
  }
];

// { dashboard: [...roles], ficha: [...roles], ... } - búsqueda O(1) por módulo.
// Incluye TODOS los items, también los `hidden`: ocultar un módulo del
// sidebar no cambia quién puede usarlo (RBAC).
export const MODULE_ROLES = Object.fromEntries(
  MENU_CONFIG.flatMap((section) => section.items.map((item) => [item.id, section.roles]))
);

export function rolesForModule(moduleId) {
  return MODULE_ROLES[moduleId] || [];
}
