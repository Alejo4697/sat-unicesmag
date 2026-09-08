/* ==========================================================================
   SAT-UNICESMAG - Menú Dinámico por Rol (RQF03)
   Portado 1:1 desde assets/js/menu.js del mockup estático.
   Es la ÚNICA fuente de verdad de "qué rol ve/usa qué módulo": tanto
   client/src/config/menuConfig.js (para pintar el sidebar) como
   server/src/middleware/requireRole.js (para proteger cada endpoint) deben
   reflejar exactamente este mismo mapa. Si cambia el acceso de un rol,
   se cambia aquí primero y se replica en el cliente.
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
      { id: "intervenciones", name: "Intervenciones", icon: "fa-clipboard-check", href: "intervenciones" },
      { id: "remisiones", name: "Remisiones", icon: "fa-share-nodes", href: "remisiones" }
    ]
  },
  {
    title: "Caracterización",
    roles: ["admin", "profesional", "directivo", "estudiante"],
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

// { dashboard: [...roles], ficha: [...roles], ... } - búsqueda O(1) por módulo
export const MODULE_ROLES = Object.fromEntries(
  MENU_CONFIG.flatMap((section) => section.items.map((item) => [item.id, section.roles]))
);

export function rolesForModule(moduleId) {
  return MODULE_ROLES[moduleId] || [];
}
