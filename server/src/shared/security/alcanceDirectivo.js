/* ==========================================================================
   Alcance de datos institucionales por perfil y programa académico
   ==========================================================================
   Control de acceso RBAC por programa académico:
   - Rol "admin" o coordinadores institucionales: alcance total sin restricciones.
   - Rol "directivo" (Director de Programa, Decano, Docente de Permanencia):
     Solo interactúa con información de SU PROPIO programa académico.
   - Perfiles docentes con programa específico asignado:
     Se restringen a la información de su programa académico (salvo casos
     donde sean remitentes o profesionales asignados).
   ========================================================================== */

export function normalizarTexto(txt) {
  return String(txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function coincidePrograma(progA, progB) {
  const a = normalizarTexto(progA);
  const b = normalizarTexto(progB);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export function esUsuarioRestringidoAPrograma(user) {
  if (!user) return false;
  if (user.rol === "admin") return false;

  const cargo = normalizarTexto(user.cargo);
  if (
    cargo.includes("coordinador de acompanamiento") ||
    cargo.includes("coordinadora de acompanamiento") ||
    cargo.includes("administrador") ||
    cargo.includes("vicerrector")
  ) {
    return false;
  }

  const prog = normalizarTexto(user.programa);
  const tieneProg =
    Boolean(prog) &&
    prog !== "todos" &&
    prog !== "no asignado" &&
    prog !== "programa institucional" &&
    prog !== "null" &&
    prog !== "undefined";

  if (!tieneProg) return false;

  // Directivo siempre está restringido a su programa académico
  if (user.rol === "directivo") return true;

  // Docentes con programa asignado
  if (cargo.includes("docente") || cargo.includes("director") || cargo.includes("permanencia")) {
    return true;
  }

  return false;
}

export function directivoPuedeVerEstudiante(user, estudiante) {
  if (!user) return false;
  if (user.rol !== "directivo") return true;
  if (!estudiante) return false;

  const progEst = estudiante.programa || estudiante.programaEstudiante;
  const coincide = coincidePrograma(progEst, user.programa);
  if (!coincide) return false;

  if (estudiante.riesgoGlobal) {
    return estudiante.riesgoGlobal !== "Bajo";
  }
  return true;
}
