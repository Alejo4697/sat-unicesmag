/* ==========================================================================
   Alcance de datos de estudiantes para el rol "directivo" (Director de
   Programa): solo puede ver/interactuar con estudiantes de SU PROPIO
   programa Y que estén en riesgo (riesgoGlobal !== "Bajo").
   Cualquier otro rol no se restringe acá - siempre true.
   ========================================================================== */
export function directivoPuedeVerEstudiante(user, estudiante) {
  if (user.rol !== "directivo") return true;
  return estudiante.programa === user.programa && estudiante.riesgoGlobal !== "Bajo";
}
