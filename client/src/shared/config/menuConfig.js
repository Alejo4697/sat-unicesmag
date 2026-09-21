/* ==========================================================================
   SAT-UNICESMAG - Menú Dinámico por Rol (RQF03) - espejo del cliente
   Debe reflejar server/src/shared/data/menuConfig.js (mismos ids, orden y
   flags `hidden`).

   Los `roles` de aquí son solo el RESPALDO por defecto: el acceso real lo
   trae AuthContext desde GET /api/menu/permisos (matriz editable en
   Administración) y se pasa como `mapa` a las funciones de abajo. Si el
   mapa aún no llegó o falló, se usan estos roles. El backend igual vuelve
   a validar cada request.

   `hidden: true` = el módulo conserva su RBAC (moduleRoles() y por tanto
   ProtectedRoute lo siguen resolviendo) pero no se pinta en el sidebar.
   ========================================================================== */

export const MENU_CONFIG = [
  {
    title: "Monitoreo",
    roles: ["admin", "profesional", "directivo", "reporte_actividades"],
    items: [{ id: "dashboard", name: "Tablero General", icon: "fa-chart-pie", href: "/dashboard" }]
  },
  {
    title: "Permanencia & Casos",
    roles: ["admin", "profesional", "directivo"],
    items: [
      { id: "ficha", name: "Ficha 360° Estudiante", icon: "fa-address-card", href: "/ficha-estudiante" },
      { id: "alertas", name: "Alertas Tempranas", icon: "fa-bell", href: "/alertas" },
      // Fuera del sidebar (hidden): se abren desde la Ficha 360°. RBAC intacto.
      { id: "intervenciones", name: "Intervenciones", icon: "fa-clipboard-check", href: "/intervenciones", hidden: true },
      { id: "remisiones", name: "Remisiones", icon: "fa-share-nodes", href: "/remisiones", hidden: true }
    ]
  },
  {
    title: "Caracterización",
    roles: ["admin", "estudiante"],
    items: [
      { id: "caracterizacion", name: "Formulario Caracterización (Instrumento)", icon: "fa-list-check", href: "/caracterizacion" }
    ]
  },

  {
    title: "Informes & SNIES",
    roles: ["admin", "profesional", "directivo", "reporte_actividades"],
    items: [{ id: "reportes", name: "Reportes y Exportación", icon: "fa-file-arrow-down", href: "/reportes" }]
  },
  {
    title: "Administración",
    roles: ["admin"],
    items: [{ id: "administracion", name: "Usuarios y Parámetros", icon: "fa-sliders", href: "/administracion" }]
  }
];

// { idModulo: [roles] } por defecto (mismo formato que /api/menu/permisos).
export const DEFAULT_MODULE_ROLES = Object.fromEntries(
  MENU_CONFIG.flatMap((section) => section.items.map((item) => [item.id, section.roles]))
);

// Para el RBAC de rutas (ProtectedRoute): mira TODOS los items, también los
// `hidden` - ocultar un módulo del sidebar no cambia quién puede usarlo.
export function moduleRoles(moduleId, mapa = null) {
  const fuente = mapa || DEFAULT_MODULE_ROLES;
  return fuente[moduleId] || [];
}

// Para pintar el sidebar: por cada sección, los items (no `hidden`) a los
// que el rol tiene acceso; se omiten las secciones que queden vacías.
export function menuForRole(rol, mapa = null) {
  return MENU_CONFIG.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.hidden && moduleRoles(item.id, mapa).includes(rol))
  })).filter((section) => section.items.length > 0);
}
