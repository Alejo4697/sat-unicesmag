/* ==========================================================================
   SAT-UNICESMAG - Menú Dinámico por Rol
   Catálogo de módulos (id, nombre, ícono, ruta, sección).
   ========================================================================== */

export const MENU_CONFIG = [
  {
    title: "Monitoreo",
    roles: ["admin", "profesional", "directivo", "reporte_actividades"],
    items: [
      {
        id: "dashboard",
        name: "Tablero General",
        icon: "fa-chart-pie",
        href: "dashboard",
      },
    ],
  },
  {
    title: "Permanencia & Casos",
    roles: ["admin", "profesional", "directivo"],
    items: [
      {
        id: "ficha",
        name: "Ficha 360° Estudiante",
        icon: "fa-address-card",
        href: "ficha-estudiante",
      },
      {
        id: "alertas",
        name: "Alertas Manuales",
        icon: "fa-bell",
        href: "alertas",
      },
      {
        id: "remisiones",
        name: "Remisiones y Casos",
        icon: "fa-share-nodes",
        href: "remisiones",
      },
      {
        id: "intervenciones",
        name: "Intervenciones",
        icon: "fa-clipboard-check",
        href: "intervenciones",
        hidden: true,
      },
    ],
  },
  {
    title: "Caracterización",
    roles: ["admin", "estudiante"],
    items: [
      {
        id: "caracterizacion",
        name: "Formulario Caracterización (Instrumento)",
        icon: "fa-list-check",
        href: "caracterizacion",
      },
    ],
  },
  {
    title: "Actividades VEC",
    roles: ["admin", "reporte_actividades"],
    items: [
      {
        id: "actividades",
        name: "Registro de Actividades",
        icon: "fa-calendar-check",
        href: "actividades",
      },
    ],
  },
  {
    title: "Informes & SNIES",
    roles: ["admin", "profesional", "directivo", "reporte_actividades"],
    items: [
      {
        id: "reportes",
        name: "Reportes y Exportación",
        icon: "fa-file-arrow-down",
        href: "reportes",
      },
    ],
  },
  {
    title: "Administración",
    roles: ["admin"],
    items: [
      {
        id: "administracion",
        name: "Usuarios y Parámetros",
        icon: "fa-sliders",
        href: "administracion",
      },
    ],
  },
];

export const MODULE_ROLES = Object.fromEntries(
  MENU_CONFIG.flatMap((section) =>
    section.items.map((item) => [item.id, section.roles]),
  ),
);

export function rolesForModule(moduleId) {
  return MODULE_ROLES[moduleId] || [];
}
