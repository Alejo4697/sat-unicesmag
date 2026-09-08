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
const CONTEO_POR_DIMENSION = { IND: 8, INS: 7, ACA: 10, SOC: 5, GEST_PROG: 4 };

// Motor de riesgo - portado 1:1 desde evaluarInstrumentoPermanencia() de
// assets/js/caracterizacion.js. En el mockup corría solo en el navegador y
// nunca se guardaba; acá corre en el servidor (es la fuente de verdad) y sí
// se persiste (ver MOCK_DATA.caracterizaciones).
export function evaluarInstrumento(respuestas) {
  const puntajes = Object.fromEntries(DIMENSIONES.map((d) => [d, 0]));

  INSTRUMENTO_ITEMS.forEach((item) => {
    let valor = respuestas[`item_${item.id}`] ?? 2;
    if (item.tipo === "likert_inverso") {
      valor = 5 - valor; // 4->1, 3->2, 2->3, 1->4
    }
    puntajes[item.dim] += valor;
  });

  const evalDim = {};
  let sumaPromedios = 0;

  DIMENSIONES.forEach((dim) => {
    const promedio = puntajes[dim] / CONTEO_POR_DIMENSION[dim];
    evalDim[dim] = {
      promedio: Number(promedio.toFixed(2)),
      riesgo: promedio < 2.3 ? "Alto" : promedio < 3.0 ? "Medio" : "Bajo"
    };
    sumaPromedios += promedio;
  });

  const promedioGlobal = Number((sumaPromedios / DIMENSIONES.length).toFixed(2));
  const riesgoGlobal = promedioGlobal < 2.3 ? "Alto" : promedioGlobal < 3.0 ? "Medio" : "Bajo";

  return { porDimension: evalDim, promedioGlobal, riesgoGlobal };
}
