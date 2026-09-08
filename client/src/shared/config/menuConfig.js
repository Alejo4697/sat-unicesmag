/* ==========================================================================
   SAT-UNICESMAG - Menú Dinámico por Rol (RQF03) - espejo del cliente
   Debe reflejar EXACTAMENTE server/src/data/menuConfig.js (mismos ids,
   roles y orden). Se usa para pintar el sidebar sin esperar la respuesta
   de /api/menu; el backend igual vuelve a validar cada request.
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
      { id: "intervenciones", name: "Intervenciones", icon: "fa-clipboard-check", href: "/intervenciones" },
      { id: "remisiones", name: "Remisiones", icon: "fa-share-nodes", href: "/remisiones" }
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

export function menuForRole(rol) {
  return MENU_CONFIG.filter((section) => section.roles.includes(rol));
}

export function moduleRoles(moduleId) {
  const section = MENU_CONFIG.find((s) => s.items.some((i) => i.id === moduleId));
  return section ? section.roles : [];
}
