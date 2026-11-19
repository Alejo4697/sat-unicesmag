const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '../../../../database/database_sat_schema.sql'), 'utf16le');
const lines = content.split(/\r?\n/);

const tables = {};
let currentTable = null;
let inTable = false;
let tableLines = [];

for (const line of lines) {
  const createMatch = line.match(/^CREATE TABLE (?:sat\.)?([a-zA-Z0-9_]+)\s*\(/i);
  if (createMatch) {
    currentTable = createMatch[1];
    inTable = true;
    tableLines = [];
    continue;
  }
  if (inTable) {
    if (line.startsWith(');')) {
      tables[currentTable] = { columns: [...tableLines], pk: [], fks: [] };
      inTable = false;
      currentTable = null;
    } else {
      let colLine = line.trim();
      if (colLine) {
        if (colLine.endsWith(',')) colLine = colLine.slice(0, -1).trim();
        colLine = colLine.replace(/::character varying/g, '');
        colLine = colLine.replace(/::text/g, '');
        tableLines.push(colLine);
      }
    }
  }
}

let activeAlterTable = null;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const alterMatch = line.match(/^ALTER TABLE ONLY (?:sat\.)?([a-zA-Z0-9_]+)/i);
  if (alterMatch) {
    activeAlterTable = alterMatch[1];
  }
  if (activeAlterTable) {
    const pkMatch = line.match(/ADD CONSTRAINT \S+ PRIMARY KEY \(([^)]+)\)/i);
    if (pkMatch) {
      if (tables[activeAlterTable]) {
        tables[activeAlterTable].pk = pkMatch[1].split(',').map(c => c.trim());
      }
      activeAlterTable = null;
    }
    const fkMatch = line.match(/ADD CONSTRAINT \S+ FOREIGN KEY \(([^)]+)\) REFERENCES (?:sat\.)?([a-zA-Z0-9_]+)\(([^)]+)\)/i);
    if (fkMatch) {
      if (tables[activeAlterTable]) {
        tables[activeAlterTable].fks.push({
          col: fkMatch[1].trim(),
          foreignTable: fkMatch[2].trim(),
          foreignCol: fkMatch[3].trim()
        });
      }
      activeAlterTable = null;
    }
    if (line.includes(';')) {
      activeAlterTable = null;
    }
  }
}

const MODULES = [
  {
    name: 'MÓDULO 1: SEGURIDAD, AUTENTICACIÓN Y ROLES (RBAC)',
    description: 'Gestión de usuarios institucionales, roles, permisos y sesiones seguras',
    tables: ['usuarios', 'roles', 'permisos', 'usuarios_roles', 'roles_permisos', 'modulos', 'sesiones', 'tokens_recuperacion', 'otp_codigos']
  },
  {
    name: 'MÓDULO 2: ESTRUCTURA INSTITUCIONAL Y PROGRAMAS ACADÉMICOS',
    description: 'Sedes, facultades, dependencias y programas académicos de la UNICESMAG',
    tables: ['sedes', 'facultades', 'programas_academicos', 'periodos_academicos', 'dependencias', 'usuarios_dependencias', 'usuarios_programas']
  },
  {
    name: 'MÓDULO 3: POBLACIÓN UNIVERSITARIA (ESTUDIANTES, DOCENTES Y PERSONAL)',
    description: 'Personas, estudiantes, docentes, acudientes y colaboradores',
    tables: ['personas', 'estudiantes', 'docentes', 'colaboradores', 'acudientes', 'egresados', 'externos']
  },
  {
    name: 'MÓDULO 4: ASIGNATURAS, GRUPOS Y MATRÍCULAS',
    description: 'Asignaturas, grupos académicos y registros de matrícula institucional',
    tables: ['asignaturas', 'grupos_asignatura', 'matriculas', 'matriculas_asignaturas']
  },
  {
    name: 'MÓDULO 5: ENCUESTA DE CARACTERIZACIÓN Y MOTOR DE RIESGO DE PERMANENCIA',
    description: 'Encuesta psicopedagógica, preguntas, opciones, respuestas, calificaciones y umbrales por etapa formativa',
    tables: ['encuestas_caracterizacion', 'preguntas_caracterizacion', 'opciones_pregunta', 'respuestas_caracterizacion', 'respuestas_detalle', 'calificaciones_riesgo', 'umbrales_permanencia', 'rangos_riesgo', 'criterios_riesgo_automatico']
  },
  {
    name: 'MÓDULO 6: ALERTAS TEMPRANAS, CASOS Y SEGUIMIENTO ESTUDIANTIL',
    description: 'Detección temprana de alertas, radicación de casos y notas de seguimiento',
    tables: ['tipos_alerta', 'alertas', 'estados_caso', 'casos', 'notas_aclaratorias', 'borradores']
  },
  {
    name: 'MÓDULO 7: REMISIONES E INTERVENCIONES',
    description: 'Rutas de remisión a áreas de apoyo, flujo de estados e intervenciones profesionales',
    tables: ['rutas_remision', 'estados_remision', 'remisiones', 'remisiones_historial_estados', 'tipos_intervencion', 'intervenciones', 'intervenciones_soportes']
  },
  {
    name: 'MÓDULO 8: ACTIVIDADES VEC Y BIENESTAR INSTITUCIONAL',
    description: 'Gestión de actividades de la Vicerrectoría para la Evangelización de las Culturas, asistencias y apoyos',
    tables: ['componentes_bienestar', 'lineas_accion', 'programas_bienestar', 'catalogo_bienestar_actividades', 'catalogo_actividades_vec', 'actividades_vec', 'actividades_vec_modalidades', 'actividades_vec_participantes', 'actividades_vec_auditoria', 'actividades_vec_participantes_auditoria', 'participantes_vec', 'tipos_apoyo', 'apoyos_financieros', 'apoyos_actividades_vec']
  },
  {
    name: 'MÓDULO 9: AUDITORÍA, SINCRONIZACIÓN Y NOTIFICACIONES',
    description: 'Trazabilidad, sincronización académica externa, reportes SNIES y log de auditoría',
    tables: ['fuentes_sincronizacion', 'cargas_sincronizacion', 'exportaciones_snies', 'log_auditoria', 'log_auditoria_default', 'notificaciones', 'notificaciones_default']
  }
];

let out = '';
out += '-- ============================================================================\n';
out += '-- SAT-UNICESMAG (DataBasePractica): DDL PARA DIAGRAMA ENTIDAD-RELACION EN DRAW.IO\n';
out += '-- Compatible con: Draw.io / diagrams.net -> Insertar (Insert) > Avanzado (Advanced) > SQL...\n';
out += '-- ============================================================================\n\n';
out += '/* INSTRUCCIONES DE USO EN DRAW.IO:\n';
out += '   1. Abre Draw.io (o https://app.diagrams.net).\n';
out += '   2. En la barra superior haz clic en: "+" o "Organizar" (Arrange) > "Insertar" (Insert) > "Avanzado" (Advanced) > "SQL...".\n';
out += '   3. Copia y pega el código de este archivo (puedes pegar todo el archivo o modulo por modulo).\n';
out += '   4. Haz clic en "Insertar" (Insert).\n';
out += '   5. ¡Listo! Draw.io generará automaticamente todas las tablas con sus columnas, llaves primarias y lineas de relacion (FK).\n';
out += '*/\n\n';

for (const mod of MODULES) {
  out += '-- ' + '='.repeat(76) + '\n';
  out += `-- ${mod.name}\n`;
  out += `-- Descripcion: ${mod.description}\n`;
  out += '-- ' + '='.repeat(76) + '\n\n';

  for (const tblName of mod.tables) {
    const t = tables[tblName];
    if (!t) continue;

    out += `CREATE TABLE ${tblName} (\n`;
    const colDefs = [];

    // Columns
    for (const col of t.columns) {
      colDefs.push(`    ${col}`);
    }

    // Primary Key
    if (t.pk && t.pk.length > 0) {
      colDefs.push(`    PRIMARY KEY (${t.pk.join(', ')})`);
    }

    // Foreign Keys
    for (const fk of t.fks) {
      colDefs.push(`    FOREIGN KEY (${fk.col}) REFERENCES ${fk.foreignTable}(${fk.foreignCol})`);
    }

    out += colDefs.join(',\n') + '\n);\n\n';
  }
}

// Write to files in UTF-8
const destDesktop = path.join(process.env.USERPROFILE || 'C:\\Users\\Practicante', 'Desktop', 'diagrama_er_drawio_databasepractica.sql');
const destRepo = path.join(__dirname, '../../../../database/diagrama_er_drawio_databasepractica.sql');

fs.writeFileSync(destDesktop, out, 'utf8');
fs.writeFileSync(destRepo, out, 'utf8');

console.log('Successfully generated SQL for Draw.io!');
console.log('Desktop file:', destDesktop, 'Size:', fs.statSync(destDesktop).size);
console.log('Repo file:', destRepo, 'Size:', fs.statSync(destRepo).size);
