/* ==========================================================================
   SAT-UNICESMAG - Menú Dinámico por Rol (RQF03) - espejo del cliente
   Debe reflejar EXACTAMENTE server/src/data/menuConfig.js (mismos ids,
   roles, orden y flags `hidden`). Se usa para pintar el sidebar sin esperar
   la respuesta de /api/menu; el backend igual vuelve a validar cada request.

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
    roles: ["admin", "profesional", "directivo", "estudiante"],
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

// Para pintar el sidebar: secciones del rol, sin los items `hidden` y sin
// secciones que queden vacías.
export function menuForRole(rol) {
  return MENU_CONFIG.filter((section) => section.roles.includes(rol))
    .map((section) => ({ ...section, items: section.items.filter((item) => !item.hidden) }))
    .filter((section) => section.items.length > 0);
}

// Para el RBAC de rutas (ProtectedRoute): mira TODOS los items, también los
// `hidden` - ocultar un módulo del sidebar no cambia quién puede usarlo.
export function moduleRoles(moduleId) {
  const section = MENU_CONFIG.find((s) => s.items.some((i) => i.id === moduleId));
  return section ? section.roles : [];
}
