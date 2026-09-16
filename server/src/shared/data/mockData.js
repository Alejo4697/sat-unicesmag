/* ==========================================================================
   SAT-UNICESMAG - Base de Datos Simulada (Mock Data)
   Portado 1:1 desde assets/js/mock-data.js del mockup estático.
   Cuando haya una base de datos real, este archivo se reemplaza por
   consultas (Mongoose/Prisma/lo que se elija) sin tocar las rutas.
   ========================================================================== */

export const MOCK_DATA = {
  // Roles del Sistema (Matriz RBAC) - fuente: mock-data.js
  roles: [
    {
      id: "admin",
      nombre: "Rol Administrativo",
      integrantes: ["Coordinador de Acompañamiento", "Vicerrectora de Evangelización de Culturas"],
      permisos: ["hacer_intervenciones", "hacer_remisiones", "hacer_reportes", "ver_todo", "editar_todo", "exportar_todo", "crud_usuarios", "parametrizacion"]
    },
    {
      id: "profesional",
      nombre: "Rol Profesionales",
      integrantes: ["Coordinador Paz y Convivencia", "Enfermera San Damián", "Coordinador Pastoral", "Área de Salud María Goretti", "Docentes Asistenciales USP", "Psicólogos de Área", "Trabajo Social", "Unidad de Servicios Psicológicos (USP)", "Coordinador USP", "Consultorios Jurídicos", "Docentes Tutor"],
      permisos: ["hacer_reportes", "ver_reportes", "editar_reportes", "exportar_reportes", "hacer_intervenciones_area", "atender_remisiones"]
    },
    {
      id: "directivo",
      nombre: "Rol Directivos",
      integrantes: ["Directores de Programa", "Coordinadores Especializaciones", "Coordinadores Académicos (Psicología, Sistemas)", "Docentes Acompañantes"],
      permisos: ["hacer_reportes_programa", "ver_reportes_programa", "editar_reportes_programa", "exportar_reportes_programa", "crear_alertas"]
    },
    {
      id: "reporte_actividades",
      nombre: "Rol Reporte Actividades",
      integrantes: ["Secretarios", "Deporte y Cultura", "Paz y Convivencia"],
      permisos: ["registrar_actividades_general", "ver_actividades_general"]
    },
    {
      id: "estudiante",
      nombre: "Rol Estudiante",
      integrantes: ["Estudiantes activos semestres 1, 4, 7"],
      permisos: ["responder_encuesta_caracterizacion"]
    }
  ],

  usuarios: [
    { id: "usr_001", nombre: "Dra. Carolina Martínez", email: "carolina.martinez@unicesmag.edu.co", rol: "admin", cargo: "Coordinadora de Acompañamiento", programa: "Todos" },
    { id: "usr_002", nombre: "Dr. Juan Manuel Botina", email: "juan.botina@unicesmag.edu.co", rol: "profesional", cargo: "Psicólogo de Área - USP", programa: "Psicología" },
    { id: "usr_003", nombre: "Dra. María Elena Villota", email: "maria.villota@unicesmag.edu.co", rol: "profesional", cargo: "Coordinadora Consultorios Jurídicos", programa: "Derecho" },
    { id: "usr_004", nombre: "Ing. Carlos Alberto Rosero", email: "carlos.rosero@unicesmag.edu.co", rol: "directivo", cargo: "Director Programa Ingeniería de Sistemas", programa: "Ingeniería de Sistemas" },
    { id: "usr_005", nombre: "Lic. Sandra Patricia Melo", email: "sandra.melo@unicesmag.edu.co", rol: "reporte_actividades", cargo: "Secretaria de Bienestar Institucional", programa: "Deporte y Cultura" },
    // codigoEstudiante enlaza este usuario con su registro en `estudiantes` -
    // no existía en el mockup original (cada .html traía el código
    // "quemado"); acá hace falta un enlace real para que Caracterización y
    // Ficha 360° sepan qué estudiante corresponde a la sesión activa.
    { id: "usr_006", nombre: "Santiago Narváez Jojoa", email: "santiago.narvaez@est.unicesmag.edu.co", rol: "estudiante", cargo: "Estudiante 1° Semestre", programa: "Ingeniería de Sistemas", codigoEstudiante: "202510045" }
  ],

  estudiantes: [
    {
      codigo: "202510045", documento: "1085324901", nombres: "Santiago Narváez", apellidos: "Jojoa Bastidas",
      programa: "Ingeniería de Sistemas", semestre: 1, periodo: "2025 II",
      email: "santiago.narvaez@est.unicesmag.edu.co", telefono: "3165432109",
      promedioAcademico: 3.2, inasistenciasAcumuladas: 14, riesgoGlobal: "Alto", puntajeRiesgo: 12.4,
      puntajesCampo: { individual: "Alto", asistencial: "Medio", academico: "Alto", socioeconomico: "Alto" },
      encuestaRespondida: true,
      acudiente: { nombre: "Carmen Bastidas", telefono: "3187654321", parentesco: "Madre" }
    },
    {
      codigo: "202410098", documento: "1085443211", nombres: "Valeria Alejandra", apellidos: "Guerrero España",
      programa: "Psicología", semestre: 4, periodo: "2025 II",
      email: "valeria.guerrero@est.unicesmag.edu.co", telefono: "3209876543",
      promedioAcademico: 4.3, inasistenciasAcumuladas: 2, riesgoGlobal: "Bajo", puntajeRiesgo: 3.1,
      puntajesCampo: { individual: "Bajo", asistencial: "Bajo", academico: "Bajo", socioeconomico: "Bajo" },
      encuestaRespondida: true,
      acudiente: { nombre: "Roberto Guerrero", telefono: "3154321098", parentesco: "Padre" }
    },
    {
      codigo: "202220112", documento: "1085223344", nombres: "Mateo Fernando", apellidos: "Solarte Cabrera",
      programa: "Derecho", semestre: 7, periodo: "2025 II",
      email: "mateo.solarte@est.unicesmag.edu.co", telefono: "3123456789",
      promedioAcademico: 3.6, inasistenciasAcumuladas: 8, riesgoGlobal: "Medio", puntajeRiesgo: 7.8,
      puntajesCampo: { individual: "Alto", asistencial: "Medio", academico: "Bajo", socioeconomico: "Medio" },
      encuestaRespondida: true,
      acudiente: { nombre: "Elena Cabrera", telefono: "3119876543", parentesco: "Madre" }
    },
    {
      codigo: "202510201", documento: "1085998877", nombres: "Camila Andrea", apellidos: "Muñoz Portilla",
      programa: "Arquitectura", semestre: 1, periodo: "2025 II",
      email: "camila.munoz@est.unicesmag.edu.co", telefono: "3178889900",
      promedioAcademico: 3.9, inasistenciasAcumuladas: 5, riesgoGlobal: "Bajo", puntajeRiesgo: 2.5,
      puntajesCampo: { individual: "Bajo", asistencial: "Bajo", academico: "Medio", socioeconomico: "Bajo" },
      encuestaRespondida: false,
      acudiente: { nombre: "Jorge Muñoz", telefono: "3167778899", parentesco: "Padre" }
    }
  ],

  alertas: [
    { id: "ALT-2025-001", codigoEstudiante: "202510045", nombreEstudiante: "Santiago Narváez Jojoa", programa: "Ingeniería de Sistemas", tipo: "Académica / Asistencia", categoria: "Automática", nivelRiesgo: "Alto", descripcion: "Acumulación de 14 inasistencias en Algoritmos I y nota parcial de 2.1.", fechaCreacion: "2025-08-20T09:30:00", creador: "Sistema Académico (Sincronización)", estado: "Abierta" },
    { id: "ALT-2025-002", codigoEstudiante: "202220112", nombreEstudiante: "Mateo Fernando Solarte Cabrera", programa: "Derecho", tipo: "Violencia Basada en Género (VBG)", categoria: "Manual", nivelRiesgo: "Alto", descripcion: "Solicitud de orientación confidencial por presunto acoso de pareja exterior.", fechaCreacion: "2025-08-22T14:15:00", creador: "Dra. María Elena Villota (Consultorios Jurídicos)", estado: "En Atención", esVBG: true },
    { id: "ALT-2025-003", codigoEstudiante: "202510201", nombreEstudiante: "Camila Andrea Muñoz Portilla", programa: "Arquitectura", tipo: "Socioeconómica", categoria: "Manual", nivelRiesgo: "Medio", descripcion: "Dificultad de movilidad y transporte desde municipio foráneo.", fechaCreacion: "2025-08-25T11:00:00", creador: "Ing. Carlos Alberto Rosero", estado: "Cerrada" }
  ],

  intervenciones: [
    {
      id: "INT-2025-089", codigoEstudiante: "202510045", atendidoPor: "Dr. Juan Manuel Botina", cargoAtendio: "Psicólogo de Área - USP",
      idUsuarioAtendio: "usr_002",
      fecha: "2025-08-24T10:30:00", fechaRegistro: "2025-08-24T11:05:00", tipoIntervencion: "Orientación psicológica individual",
      motivo: "Seguimiento por bajo rendimiento y ansiedad ante exámenes.",
      resumenAcuerdo: "Se acuerda compromiso de tutoría académica y técnica de regulación emocional.",
      adjuntos: [{ nombre: "Acta_Compromiso_Firmada.pdf", tamano: "1.4 MB", url: "#" }],
      esSensibleVBG: false, cerrado: true,
      notasAclaratorias: [{ fecha: "2025-08-26T08:15:00", autor: "Dr. Juan Manuel Botina", nota: "El estudiante asistió a la primera tutoría de matemáticas avanzadas." }]
    },
    {
      id: "INT-2025-092", codigoEstudiante: "202220112", atendidoPor: "Dra. María Elena Villota", cargoAtendio: "Consultorios Jurídicos",
      idUsuarioAtendio: "usr_003",
      fecha: "2025-08-23T15:45:00", fechaRegistro: "2025-08-23T16:20:00", tipoIntervencion: "Asesoría jurídica",
      motivo: "Asesoría confidencial VBG y medidas de protección psicosocial.",
      resumenAcuerdo: "Canalización prioritaria a USP y registro de bitácora de protección.",
      adjuntos: [{ nombre: "Acta_Consultorio_Juridico_VBG.pdf", tamano: "2.1 MB", url: "#" }],
      esSensibleVBG: true, cerrado: false, notasAclaratorias: []
    }
  ],

  remisiones: [
    {
      id: "REM-2025-034", codigoEstudiante: "202510045", remitidoPor: "Ing. Carlos Alberto Rosero (Director)",
      areaDestino: "Unidad de Servicios Psicológicos (USP)", profesionalAsignado: "Dr. Juan Manuel Botina", nivelRiesgo: "Alto",
      motivoRemision: "Riesgo de deserción por acumulación de inasistencias y problemas de adaptación.",
      fechaRemision: "2025-08-21T08:00:00", estado: "En Atención", escalado48h: false,
      recomendacionesAula: "Se sugiere flexibilizar entregas mientras completa proceso de orientación psicosocial."
    },
    {
      id: "REM-2025-039", codigoEstudiante: "202220112", remitidoPor: "Dra. Carolina Martínez",
      areaDestino: "Consultorios Jurídicos", profesionalAsignado: "Dra. María Elena Villota", nivelRiesgo: "Muy Alto",
      motivoRemision: "Atención prioritaria caso VBG y apoyo en medidas cautelares.",
      fechaRemision: "2025-08-22T10:00:00", estado: "Atendida", escalado48h: true,
      recomendacionesAula: "Mantener reserva absoluta del caso."
    }
  ],

  // Envíos ya procesados del instrumento de caracterización (34 ítems).
  // No existía en el mockup (el motor de riesgo corría solo en el
  // navegador y no se guardaba); acá sí se persiste cada envío real.
  caracterizaciones: [],

  // Umbrales de semaforización de riesgo (RQF11) - editables desde
  // Administración. En el mockup el botón "Actualizar Umbrales" solo
  // mostraba un toast; acá sí se guarda el valor.
  umbralesRiesgo: { alto: 10, medio: 6 },

  dashboardStats: {
    periodoActual: "2025 II",
    totalEstudiantesMatriculados: 4850,
    totalEncuestadosCaracterizacion: 3240,
    totalFaltantesCaracterizacion: 1610,
    distribucionRiesgo: { bajo: 2150, medio: 840, alto: 250 },
    porSemestre: {
      semestre1: { total: 1400, encuestados: 1100, faltantes: 300, riesgoAlto: 110 },
      semestre4: { total: 1150, encuestados: 950, faltantes: 200, riesgoAlto: 75 },
      semestre7: { total: 980, encuestados: 820, faltantes: 160, riesgoAlto: 45 }
    }
  }
};

// Regla de Secreto Profesional & Confidencialidad (RNF01) - portada de state.js
export function puedeVerDetalleVBG(userRole, userCargo = "") {
  if (userRole === "admin") return true;
  if (userCargo.includes("Consultorios Jurídicos") || userCargo.includes("USP") || userCargo.includes("Servicios Psicológicos")) {
    return true;
  }
  return false;
}
