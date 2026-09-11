/* ==========================================================================
   Instrumento oficial de Caracterización de Permanencia (34 ítems)
   Portado 1:1 desde INSTRUMENTO_ITEMS en assets/js/caracterizacion.js.
   Dato del dominio de esta feature (no shared: solo caracterización lo usa).
   ========================================================================== */

export const INSTRUMENTO_ITEMS = [
  // 1. DIMENSIÓN INDIVIDUAL (IND - 8 ítems)
  { id: 1, dim: "IND", dimNombre: "Nivel Individual", texto: "Me siento motivado a participar en actividades de mi universidad.", tipo: "likert" },
  { id: 2, dim: "IND", dimNombre: "Nivel Individual", texto: "Intento asistir a todas las clases que se han designado en mi horario.", tipo: "likert" },
  { id: 3, dim: "IND", dimNombre: "Nivel Individual", texto: "El estar en la universidad me resulta satisfactorio y cómodo.", tipo: "likert" },
  { id: 4, dim: "IND", dimNombre: "Nivel Individual", texto: "El llegar a tener mi título universitario me motiva todos los días a participar más.", tipo: "likert" },
  { id: 5, dim: "IND", dimNombre: "Nivel Individual", texto: "Tengo buenas relaciones dentro de la universidad con amigos y/o profesores.", tipo: "likert" },
  { id: 6, dim: "IND", dimNombre: "Nivel Individual", texto: "Soy capaz de cumplir con mis actividades y deberes de la universidad.", tipo: "likert" },
  { id: 7, dim: "IND", dimNombre: "Nivel Individual", texto: "Ingresar a la universidad ha sido una de las mejores decisiones que he tomado.", tipo: "likert" },
  { id: 8, dim: "IND", dimNombre: "Nivel Individual", texto: "Cuento con el tiempo necesario para atender las actividades y requerimientos de la universidad.", tipo: "likert" },

  // 2. DIMENSIÓN INSTITUCIONAL (INS - 7 ítems)
  { id: 9, dim: "INS", dimNombre: "Nivel Institucional", texto: "Los funcionarios y administrativos de la universidad son accesibles y empáticos.", tipo: "likert" },
  { id: 10, dim: "INS", dimNombre: "Nivel Institucional", texto: "Los espacios físicos que ofrece la universidad son de mi agrado.", tipo: "likert" },
  { id: 11, dim: "INS", dimNombre: "Nivel Institucional", texto: "Las aulas de clases son cómodas para recibir clases por horarios extensos.", tipo: "likert" },
  { id: 12, dim: "INS", dimNombre: "Nivel Institucional", texto: "Tenemos acceso a programas de bienestar universitario que apoyan al estudiante.", tipo: "likert" },
  { id: 13, dim: "INS", dimNombre: "Nivel Institucional", texto: "La universidad tiene en cuenta programas dirigidos a grupos étnicos o de comunidad LGTBQ+.", tipo: "likert" },
  { id: 14, dim: "INS", dimNombre: "Nivel Institucional", texto: "La universidad tiene en cuenta a los más vulnerables para asegurar su permanencia en la universidad.", tipo: "likert" },
  { id: 15, dim: "INS", dimNombre: "Nivel Institucional", texto: "Se realizan actividades enfocadas al bienestar del estudiante con frecuencia.", tipo: "likert" },

  // 3. DIMENSIÓN ACADÉMICA (ACA - 10 ítems)
  { id: 16, dim: "ACA", dimNombre: "Nivel Académico", texto: "Recibí orientación vocacional para elegir adecuadamente mi carrera.", tipo: "likert" },
  { id: 17, dim: "ACA", dimNombre: "Nivel Académico", texto: "La malla curricular me resulta agradable e interesante.", tipo: "likert" },
  { id: 18, dim: "ACA", dimNombre: "Nivel Académico", texto: "El programa que elegí cumple con mis expectativas.", tipo: "likert" },
  { id: 19, dim: "ACA", dimNombre: "Nivel Académico", texto: "Por norma general logro entender la mayoría de las temáticas que explican mis profesores.", tipo: "likert" },
  { id: 20, dim: "ACA", dimNombre: "Nivel Académico", texto: "Investigué mucho antes de seleccionar mi carrera.", tipo: "likert" },
  { id: 21, dim: "ACA", dimNombre: "Nivel Académico", texto: "La metodología de los docentes para explicar las clases es adecuada y dinámica.", tipo: "likert" },
  { id: 22, dim: "ACA", dimNombre: "Nivel Académico", texto: "Los métodos de estudio que empleo son eficaces para aprender y estudiar.", tipo: "likert" },
  { id: 23, dim: "ACA", dimNombre: "Nivel Académico", texto: "Las evaluaciones que se realizan en mi carrera son acordes a las temáticas abordadas.", tipo: "likert" },
  { id: 24, dim: "ACA", dimNombre: "Nivel Académico", texto: "Siento satisfacción con mis resultados académicos obtenidos hasta ahora.", tipo: "likert" },
  { id: 25, dim: "ACA", dimNombre: "Nivel Académico", texto: "Tengo que leer varias veces el material que brindan los profesores para poder comprenderlo.", tipo: "likert_inverso" },

  // 4. DIMENSIÓN SOCIOECONÓMICA (SOC - 5 ítems)
  { id: 26, dim: "SOC", dimNombre: "Nivel Socioeconómico", texto: "Cuento con los recursos económicos para poder cursar todos los semestres.", tipo: "likert" },
  { id: 27, dim: "SOC", dimNombre: "Nivel Socioeconómico", texto: "Me resulta fácil acceder a un crédito financiero para educación.", tipo: "likert" },
  { id: 28, dim: "SOC", dimNombre: "Nivel Socioeconómico", texto: "Puedo costear mis alimentos cuando debo quedarme en horarios extensos de la universidad.", tipo: "likert" },
  { id: 29, dim: "SOC", dimNombre: "Nivel Socioeconómico", texto: "He podido acceder a ayudas económicas por parte de la universidad.", tipo: "likert" },
  { id: 30, dim: "SOC", dimNombre: "Nivel Socioeconómico", texto: "El costo de la matrícula está fuera de mis capacidades económicas.", tipo: "likert_inverso" },

  // 5. DIMENSIÓN GESTIÓN DE PERMANENCIA DEL PROGRAMA (GEST PROG - 4 ítems)
  { id: 31, dim: "GEST_PROG", dimNombre: "Gestión de Permanencia del Programa", texto: "Considera que hay gestión por parte del programa académico para la permanencia estudiantil.", tipo: "likert" },
  { id: 32, dim: "GEST_PROG", dimNombre: "Gestión de Permanencia del Programa", texto: "Su programa académico realiza seguimiento de permanencia estudiantil.", tipo: "likert" },
  { id: 33, dim: "GEST_PROG", dimNombre: "Gestión de Permanencia del Programa", texto: "Conoce las estrategias de permanencia propias de su programa académico.", tipo: "sino" },
  { id: 34, dim: "GEST_PROG", dimNombre: "Gestión de Permanencia del Programa", texto: "Con las estrategias de permanencia implementadas por su programa académico ha logrado superar sus dificultades.", tipo: "likert" }
];

export const DIMENSIONES = ["IND", "INS", "ACA", "SOC", "GEST_PROG"];

export const DIM_NOMBRES = {
  IND: "Nivel Individual",
  INS: "Nivel Institucional",
  ACA: "Nivel Académico",
  SOC: "Nivel Socioeconómico",
  GEST_PROG: "Gestión de Permanencia del Programa",
  "GEST PROG": "Gestión de Permanencia del Programa"
};

export const DIM_LABELS_SHORT = {
  IND: "Individual (IND)",
  INS: "Institucional (INS)",
  ACA: "Académico (ACA)",
  SOC: "Socioeconómico (SOC)",
  GEST_PROG: "Gestión Programa (GEST PROG)"
};

// Matriz de conceptos diagnósticos por dimensión y nivel de permanencia
export const CONCEPTOS_DIAGNOSTICO = {
  Baja: {
    IND: "El estudiante presenta dificultades respecto a sus relaciones con otros, identificación de su rol personal en la Universidad y conductas disruptivas dentro de la misma.",
    INS: "El estudiante no está satisfecho con la infraestructura, normativas, profesores, grado de compromiso, calidad de los programas, ubicación de la sede, administración y apoyo de la universidad.",
    ACA: "El estudiante no se encuentra satisfecho con el programa, la carrera, la carga académica y su rendimiento académico.",
    SOC: "El estudiante presenta problemas respecto a los recursos económicos y/o el estrato social de la universidad.",
    GEST_PROG: "El estudiante percibe escaso acompañamiento o desconoce las estrategias de permanencia de su programa académico."
  },
  Media: {
    IND: "El estudiante manifiesta un nivel de adaptación moderado, con aspectos positivos en sus relaciones interpersonales pero con áreas de mejora en motivación y gestión de su rol universitario.",
    INS: "El estudiante percibe favorablemente aspectos generales de la institución, aunque sugiere fortalecer canales de comunicación, espacios físicos y programas de bienestar.",
    ACA: "El estudiante mantiene un desempeño y satisfacción académica aceptables, requiriendo afianzar métodos de estudio y orientación vocacional.",
    SOC: "El estudiante dispone de recursos básicos para su sostenimiento, aunque experimenta dificultades económicas puntuales que requieren seguimiento.",
    GEST_PROG: "El estudiante identifica algunas acciones de permanencia en su programa, aunque requiere mayor articulación con las mismas."
  },
  Alta: {
    IND: "El estudiante demuestra una alta motivación, sentido de pertenencia y excelentes habilidades de relacionamiento y adaptación universitaria.",
    INS: "El estudiante expresa plena satisfacción con la infraestructura, cuerpo docente, normativas y programas de bienestar institucional.",
    ACA: "El estudiante presenta gran satisfacción con su programa académico, alta eficacia en sus métodos de estudio y óptimo rendimiento.",
    SOC: "El estudiante cuenta con solvencia y estabilidad socioeconómica que favorecen su continuidad y permanencia sin contratiempos.",
    GEST_PROG: "El estudiante reconoce y aprovecha activamente las estrategias de permanencia y acompañamiento de su programa académico."
  }
};

export const MENSAJES_PERMANENCIA = {
  Baja: {
    titulo: "¡INFORMACIÓN IMPORTANTE!",
    subtitulo: "Tu nivel de permanencia en la universidad es BAJO.",
    parrafo1: "Identificamos que actualmente enfrentas algunos desafíos que podrían impactar en tu continuidad académica. Sabemos que cada situación es única y que diversos factores pueden influir en tu proceso formativo.",
    parrafo2: "Queremos acompañarte y ofrecerte estrategias para superar estos retos. Por ello, te invitamos a acercarte a nuestro equipo de acompañamiento, donde encontrarás apoyo personalizado para fortalecer tu permanencia en la universidad. Estamos aquí para escucharte y trabajar juntos en soluciones que favorezcan tu bienestar y desarrollo.",
    parrafo3: "Si deseas conversar sobre tu resultado o recibir orientación, no dudes en contactarnos. Nuestro compromiso es acompañarte en este camino y asegurarnos de que cuentes con las herramientas necesarias para alcanzar tus metas."
  },
  Media: {
    titulo: "¡INFORMACIÓN IMPORTANTE!",
    subtitulo: "Tu nivel de permanencia en la universidad es MEDIO.",
    parrafo1: "Tu proceso universitario avanza con bases sólidas, aunque existen áreas específicas donde un acompañamiento oportuno puede potenciar aún más tu desempeño y bienestar integral.",
    parrafo2: "Te invitamos a conocer las actividades de tutoría académica, talleres de habilidades de estudio y programas de bienestar que la Universidad CESMAG tiene diseñados para ti.",
    parrafo3: "Recuerda que nuestro equipo docente y de permanencia está disponible para orientarte ante cualquier inquietud o reto académico y personal."
  },
  Alta: {
    titulo: "¡FELICITACIONES!",
    subtitulo: "Tu nivel de permanencia en la universidad es ALTO.",
    parrafo1: "Tus respuestas reflejan una excelente adaptación a la vida universitaria, alto sentido de pertenencia y adecuada articulación con tu proceso formativo.",
    parrafo2: "Te animamos a continuar con este gran entusiasmo y a participar en las oportunidades de liderazgo, semilleros de investigación y actividades extracurriculares de la institución.",
    parrafo3: "Continuamos a tu disposición para respaldar tu trayectoria hasta la obtención de tu título profesional."
  }
};

// Motor de riesgo dinámico
export function evaluarInstrumento(respuestas, items = INSTRUMENTO_ITEMS) {
  const puntajes = {};
  const conteos = {};

  items.forEach((item) => {
    const rawDim = item.dim || item.categoria || "IND";
    const dim = rawDim === "GEST PROG" ? "GEST_PROG" : rawDim;
    if (!puntajes[dim]) {
      puntajes[dim] = 0;
      conteos[dim] = 0;
    }
    conteos[dim]++;

    const key = item.dbId ? `item_${item.dbId}` : `item_${item.id}`;
    let valor = respuestas[key] ?? respuestas[`item_${item.id}`] ?? respuestas[`item_${item.orden}`] ?? 2;
    if (typeof valor === "string") valor = Number(valor) || 2;
    
    if (item.tipo === "likert_inverso" || item.tipo_respuesta === "LIKERT_INVERSO") {
      valor = 5 - valor; // 4->1, 3->2, 2->3, 1->4
    }
    puntajes[dim] += valor;
  });

  const evalDim = {};
  let sumaPromedios = 0;
  const dims = Object.keys(puntajes).length > 0 ? Object.keys(puntajes) : DIMENSIONES;

  dims.forEach((dim) => {
    const totalEnDim = conteos[dim] || 1;
    const promedio = puntajes[dim] ? puntajes[dim] / totalEnDim : 3.0;
    const nivelDim = promedio < 2.3 ? "Baja" : promedio < 3.0 ? "Media" : "Alta";
    evalDim[dim] = {
      promedio: Number(promedio.toFixed(2)),
      suma: puntajes[dim],
      totalItems: totalEnDim,
      riesgo: promedio < 2.3 ? "Alto" : promedio < 3.0 ? "Medio" : "Bajo",
      nivelPermanencia: nivelDim,
      conceptoDiagnostico: CONCEPTOS_DIAGNOSTICO[nivelDim]?.[dim] || ""
    };
    sumaPromedios += promedio;
  });

  const promedioGlobal = dims.length ? Number((sumaPromedios / dims.length).toFixed(2)) : 3.0;
  const riesgoGlobal = promedioGlobal < 2.3 ? "Alto" : promedioGlobal < 3.0 ? "Medio" : "Bajo";
  const nivelPermanenciaGlobal = promedioGlobal < 2.3 ? "Baja" : promedioGlobal < 3.0 ? "Media" : "Alta";

  return {
    porDimension: evalDim,
    promedioGlobal,
    riesgoGlobal,
    nivelPermanencia: nivelPermanenciaGlobal,
    mensajePermanencia: MENSAJES_PERMANENCIA[nivelPermanenciaGlobal] || MENSAJES_PERMANENCIA.Baja,
    conceptosPorDimension: {
      IND: evalDim.IND?.conceptoDiagnostico || CONCEPTOS_DIAGNOSTICO[nivelPermanenciaGlobal].IND,
      INS: evalDim.INS?.conceptoDiagnostico || CONCEPTOS_DIAGNOSTICO[nivelPermanenciaGlobal].INS,
      ACA: evalDim.ACA?.conceptoDiagnostico || CONCEPTOS_DIAGNOSTICO[nivelPermanenciaGlobal].ACA,
      SOC: evalDim.SOC?.conceptoDiagnostico || CONCEPTOS_DIAGNOSTICO[nivelPermanenciaGlobal].SOC
    }
  };
}

