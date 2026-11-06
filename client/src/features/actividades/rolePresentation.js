const ROLE_LABELS = {
  admin: "Admin (admin)",
  ADMINISTRADOR: "Administrador",
  COORDINADOR: "Coordinador",
  directivo: "Directivo",
  DOCENTE_PERMANENCIA: "Docente de permanencia",
  estudiante: "Estudiante (estudiante)",
  ESTUDIANTE: "Estudiante",
  profesional: "Profesional",
  reporte_actividades: "Reporte de actividades",
};

export function etiquetaRolInstitucional(role) {
  const value = String(role || "").trim();
  return ROLE_LABELS[value] || value;
}

export function claseRolInstitucional(role) {
  const value = String(role || "").trim().toLocaleLowerCase("es");
  if (["admin", "administrador"].includes(value)) return "administrativo";
  if (["directivo", "coordinador"].includes(value)) return "directivo";
  if (["docente_permanencia", "profesional"].includes(value)) return "colaborador";
  if (["estudiante"].includes(value)) return "estudiante";
  if (["reporte_actividades"].includes(value)) return "reporte-actividades";
  return "institucional";
}
