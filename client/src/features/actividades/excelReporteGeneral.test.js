import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generarLibroReporteActividades } from "./excelReporteGeneral.js";

const template = await readFile(
  new URL("../../../public/plantillas/actividad_bienestar.xlsx", import.meta.url),
);

function actividadFixture(overrides = {}) {
  return {
    id: "activity-1",
    actividad: "Taller de ejemplo",
    descripcion: "Descripción de ejemplo",
    periodo: "2026-1",
    programaAcademico: "Ingeniería de Sistemas",
    programaBienestar: "Programa de Bienestar",
    tipoActividad: "Otros",
    fechaInicio: "2026-01-15",
    fechaFinalizacion: "2026-01-16",
    modalidad: "Presencial",
    dependencia: "Bienestar Universitario",
    lineaAccion: "Desarrollo Humano y Salud",
    programasAcademicos: ["Psicología", "Derecho"],
    componenteBienestarReal: "Componente seleccionado",
    componenteBienestar: "Componente de catálogo",
    tipoApoyoPrograma: "Apoyo 3: Apoyo psicosocial",
    apoyosModalidades: [],
    estrategiaPoliticaBienestar: "Estrategia de Bienestar de la actividad",
    estrategiaPoliticaPermanencia: "Estrategia de Permanencia que no debe exportarse",
    estrategiaPoliticaEducacionInclusiva: "Estrategia Inclusiva que no debe exportarse",
    participantesEstudiantes: 4,
    participantesDocentes: 2,
    participantesAdministrativos: 1,
    participantesEgresados: 1,
    participantesPadresFamilia: 1,
    responsable: "Responsable de ejemplo",
    tipoDocumentoResponsable: "CC",
    identificacionResponsable: "123456789",
    creadoPor: "Usuario creador",
    ...overrides,
  };
}

test("genera el informe institucional en una única hoja", async () => {
  const buffer = await generarLibroReporteActividades(
    [actividadFixture()],
    template,
  );
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const report = workbook.getWorksheet("ACTIVIDAD_BIENESTAR");
  assert.ok(report);
  assert.deepEqual(
    workbook.worksheets.map((worksheet) => worksheet.name),
    ["ACTIVIDAD_BIENESTAR"],
  );
  assert.equal(report.getCell("C1").value, "REPORTE INFORMACIÓN ESTADÍSTICA, DE GESTIÓN Y SNIES - ACTIVIDADES DE BIENESTAR");
  assert.equal(report.getCell("A6").value, "LÍNEA DE ACCIÓN QUE ORGANIZA LA ACTIVIDAD");
  assert.equal(report.getCell("C6").value, "TITULO DE LA ACTIVIDAD");
  assert.equal(report.getRow(6).actualCellCount, 19);
  assert.equal(report.getRow(6).values.includes("ACTIVIDAD BIENESTAR"), false);
  assert.equal(report.getCell("G6").value, "ID_TIPO_ACTIVIDAD_BIENESTAR (APOYOS)");
  assert.equal(report.getCell("A7").value, "Desarrollo Humano y Salud");
  assert.equal(report.getCell("B7").value, "Ingeniería de Sistemas");
  assert.equal(report.getCell("C7").value, "Taller de ejemplo");
  assert.equal(report.getCell("E7").value, "Componente seleccionado");
  assert.equal(report.getCell("F7").value, "Estrategia de Bienestar de la actividad");
  assert.equal(report.getCell("G7").value, "Apoyo 3: Apoyo psicosocial");
  assert.notEqual(report.getCell("E7").dataValidation.type, "list");
  assert.equal(report.getCell("H7").numFmt, "dd/mm/yyyy");
  assert.equal(report.getCell("H7").value.toISOString(), "2026-01-15T00:00:00.000Z");
  assert.equal(report.getCell("J7").value, "CC");
  assert.equal(report.getCell("K7").value, "123456789");
  assert.equal(report.getCell("L7").value.result, "Estudiantes, Docentes, Administrativos, Egresados, Padres de familia");
  assert.equal(report.getCell("M7").value.result, 9);
  assert.equal(report.getCell("S7").value, "Presencial");
  assert.equal(report.autoFilter, "A6:S7");
  assert.equal(report.views[0].ySplit, 6);

});

test("exporta los apoyos asignados a las modalidades antes del apoyo de catálogo", async () => {
  const buffer = await generarLibroReporteActividades(
    [
      actividadFixture({
        apoyosModalidades: [
          { tipoApoyo: "Apoyo 2: Apoyos académicos" },
          { tipoApoyo: "Apoyo 3: Apoyo psicosocial" },
        ],
      }),
    ],
    template,
  );
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const report = workbook.getWorksheet("ACTIVIDAD_BIENESTAR");
  assert.equal(report.getCell("E7").value, "Componente seleccionado");
  assert.equal(
    report.getCell("G7").value,
    "Apoyo 2: Apoyos académicos · Apoyo 3: Apoyo psicosocial",
  );
});

test("muestra Sin especificar si la actividad no tiene programa académico", async () => {
  const buffer = await generarLibroReporteActividades(
    [
      actividadFixture({
        programaAcademico: "",
        programasAcademicos: ["Psicología", "Derecho"],
      }),
    ],
    template,
  );
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  assert.equal(
    workbook.getWorksheet("ACTIVIDAD_BIENESTAR").getCell("B7").value,
    "Sin especificar",
  );
});

test("exporta el conteo numérico de cada rol, incluidos los ceros", async () => {
  const buffer = await generarLibroReporteActividades(
    [
      actividadFixture({
        participantesEstudiantes: 10,
        participantesDocentes: 0,
        participantesAdministrativos: 0,
        participantesEgresados: 5,
        participantesPadresFamilia: 0,
      }),
    ],
    template,
  );
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const report = workbook.getWorksheet("ACTIVIDAD_BIENESTAR");

  assert.equal(report.getCell("N7").value, 10);
  assert.equal(report.getCell("O7").value, 0);
  assert.equal(report.getCell("Q7").value, 5);
  assert.equal(report.getCell("R7").value, 0);
  assert.equal(report.getCell("M7").value.result, 15);
});

test("extiende el formato y las fórmulas si se superan las filas de la plantilla", async () => {
  const activities = Array.from({ length: 645 }, (_, index) =>
    actividadFixture({ id: `activity-${index + 1}` }),
  );
  const buffer = await generarLibroReporteActividades(activities, template);
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const report = workbook.getWorksheet("ACTIVIDAD_BIENESTAR");
  assert.equal(report.getCell("C651").value, "Taller de ejemplo");
  assert.match(report.getCell("L651").value.formula, /N651:R651/);
  assert.notEqual(report.getCell("E651").dataValidation.type, "list");
  assert.deepEqual(report.getCell("E651").fill, report.getCell("E7").fill);
  assert.equal(report.autoFilter, "A6:S651");
});
