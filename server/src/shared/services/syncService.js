/* ==========================================================================
   SAT-UNICESMAG - Servicio de Sincronización Institucional
   ==========================================================================
   Sincroniza los datos desde la base de datos institucional remota (prod18sep2)
   hacia la base de datos local del SAT (DataBasePractica en schema sat).

   Tablas y vistas involucradas:
   - prod18sep2.public.vista_informacion_estudiantes -> sat.personas, sat.estudiantes, sat.matriculas
   - prod18sep2.public.vista_informacion_academica   -> sat.asignaturas, sat.grupos_asignatura, sat.matriculas_asignaturas
   - prod18sep2.public.vista_informacion_financiera  -> sat.apoyos_financieros
   - sat.cargas_sincronizacion                       -> Auditoría y trazabilidad
   ========================================================================== */

import "dotenv/config";
import pg from "pg";
import { pool } from "../db/pool.js";

const { Client } = pg;

const PROGRAM_NAMES_FALLBACK = {
  '0': 'COTERMINALIDAD - ESPECIALIZACIONES',
  '2': 'LICENCIATURA EN EDUCACION FISICA',
  '6': 'DERECHO',
  'BD': 'ESPECIALIZACIÓN EN BIG DATA',
  'C': 'ESPECIALIZACIÓN EN GERENCIA DE PROYECTOS',
  'CM': 'COTERMINALIDAD - (Esp. en Marketing Digital)',
  'CS': 'COTERMINALIDAD - (Esp. en Seguridad / SST)',
  'D': 'ESPECIALIZACIÓN EN GERENCIA DE PROYECTOS',
  'E': 'DISEÑO GRÁFICO',
  'EM': 'ESPECIALIZACIÓN EN MARKETING DIGITAL',
  'ES': 'ESPECIALIZACIÓN EN SEGURIDAD INFORMÁTICA',
  'I': 'INGENIERÍA DE SISTEMAS',
  'IF': 'INGENIERÍA FINANCIERA',
  'II': 'INGENIERÍA INDUSTRIAL',
  'K': 'LICENCIATURA EN EDUCACIÓN INFANTIL',
  'L': 'ARQUITECTURA',
  'MD': 'TECNOLOGÍA EN MARKETING DIGITAL',
  'MG': 'MAESTRÍA EN GERENCIA DE PROYECTOS',
  'N': 'CONTADURÍA PÚBLICA',
  'O': 'INGENIERÍA ELECTRÓNICA',
  'Q': 'ADMINISTRACIÓN DE EMPRESAS',
  'R': 'PSICOLOGÍA',
  'S': 'PROFESIONALIZACIÓN EN ADMINISTRACIÓN DE EMPRESAS',
  'SS': 'ESPECIALIZACIÓN EN GERENCIA DE LA SEGURIDAD Y SALUD EN EL TRABAJO',
  'ST': 'FISIOTERAPIA',
  'TF': 'INGENIERÍA FINANCIERA TRANSFERENCIA',
  'V': 'PROFESIONALIZACIÓN EN CONTADURÍA PÚBLICA',
  'X': 'LICENCIATURA EN QUIMICA',
  'Y': 'Inglés y Lenguas Extranjeras'
};

export async function ejecutarSincronizacion() {
  const tInicio = Date.now();
  console.log("================================================================");
  console.log("INICIANDO SINCRONIZACIÓN INSTITUCIONAL prod18sep2 -> DataBasePractica");
  console.log("================================================================");

  if (!process.env.ACADEMIC_DB_HOST || !process.env.ACADEMIC_DB_USER || !process.env.ACADEMIC_DB_PASSWORD) {
    throw new Error("Credenciales de la base de datos institucional no configuradas en variables de entorno (ACADEMIC_DB_*).");
  }

  const academicClient = new Client({
    host: process.env.ACADEMIC_DB_HOST,
    port: Number(process.env.ACADEMIC_DB_PORT) || 5432,
    database: process.env.ACADEMIC_DB_NAME || "prod18sep2",
    user: process.env.ACADEMIC_DB_USER,
    password: process.env.ACADEMIC_DB_PASSWORD
  });

  const localClient = await pool.connect();
  let idCarga = null;

  try {
    await academicClient.connect();
    console.log("[OK] Conectado a la base de datos institucional prod18sep2");

    // 1. Preparar infraestructura previa en local
    // Asegurar índice único en sat.asignaturas(codigo_externo)
    await localClient.query(`
      DROP INDEX IF EXISTS sat.uq_asignaturas_codigo_externo;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_asignaturas_codigo_externo 
      ON sat.asignaturas (codigo_externo);
    `);

    // Asegurar fuente de sincronización (tipo: BATCH, API, o WEBHOOK)
    const fuenteRes = await localClient.query(`
      INSERT INTO sat.fuentes_sincronizacion (nombre, tipo, activo)
      VALUES ('PROD18SEP2_UNICESMAG', 'BATCH', true)
      ON CONFLICT DO NOTHING
      RETURNING id_fuentes_sincronizacion;
    `);
    let idFuente;
    if (fuenteRes.rows.length > 0) {
      idFuente = fuenteRes.rows[0].id_fuentes_sincronizacion;
    } else {
      const f = await localClient.query(`SELECT id_fuentes_sincronizacion FROM sat.fuentes_sincronizacion LIMIT 1;`);
      idFuente = f.rows[0]?.id_fuentes_sincronizacion;
    }

    // Registrar inicio de carga
    const cargaRes = await localClient.query(`
      INSERT INTO sat.cargas_sincronizacion (id_fuentes_sincronizacion, tipo_dato, estado, iniciada_en)
      VALUES ($1, 'SINCRONIZACION_INTEGRAL', 'EN_PROCESO', NOW())
      RETURNING id_cargas_sincronizacion;
    `, [idFuente]);
    idCarga = cargaRes.rows[0].id_cargas_sincronizacion;

    // Obtener periodo académico activo y sede principal
    const periodoRes = await localClient.query(`
      SELECT id_periodos_academicos FROM sat.periodos_academicos WHERE activo = true LIMIT 1;
    `);
    const idPeriodo = periodoRes.rows[0]?.id_periodos_academicos;

    const sedeRes = await localClient.query(`
      SELECT id_sedes FROM sat.sedes LIMIT 1;
    `);
    const idSede = sedeRes.rows[0]?.id_sedes;

    // -------------------------------------------------------------
    // DETECCIÓN DINÁMICA DE VISTAS EN PROD18SEP2
    // -------------------------------------------------------------
    console.log("\n Detectando vistas disponibles en prod18sep2...");
    const vistasRes = await academicClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'VIEW';
    `);
    const vistasDisponibles = new Set(vistasRes.rows.map((r) => r.table_name.toLowerCase()));
    console.log(`Vistas detectadas en prod18sep2 (${vistasDisponibles.size}):`, [...vistasDisponibles].join(", "));

    // -------------------------------------------------------------
    // PASO 1: Sincronización de Facultades (sat.facultades)
    // -------------------------------------------------------------
    let facultadesSincronizadas = 0;
    const facultadMap = new Map(); // NOMBRE_MAYUSCULA -> id_facultades

    if (vistasDisponibles.has("vista_facultades")) {
      console.log("\n PASO 1: Sincronizando vista_facultades a sat.facultades...");
      const facProd = await academicClient.query(`SELECT * FROM public.vista_facultades;`);
      
      for (const row of facProd.rows) {
        const nombreFac = String(row.facultad || "").trim();
        if (!nombreFac) continue;
        const activoFac = row.activado !== false;

        const resFac = await localClient.query(`
          INSERT INTO sat.facultades (nombre, activo)
          VALUES ($1, $2)
          ON CONFLICT (nombre) DO UPDATE SET activo = EXCLUDED.activo
          RETURNING id_facultades;
        `, [nombreFac, activoFac]);

        const idFac = resFac.rows[0].id_facultades;
        facultadMap.set(nombreFac.toUpperCase(), idFac);
        facultadesSincronizadas++;
      }
      console.log(`[OK] ${facultadesSincronizadas} facultades sincronizadas en sat.facultades.`);
    }

    // -------------------------------------------------------------
    // PASO 2: Sincronización de Programas Académicos (sat.programas_academicos)
    // -------------------------------------------------------------
    console.log("\n PASO 2: Sincronizando Programas Académicos desde vista_programas...");

    // Cargar facultades disponibles para mapeo exacto
    const facDbRes = await localClient.query(`SELECT id_facultades, UPPER(TRIM(nombre)) as nombre FROM sat.facultades;`);
    for (const f of facDbRes.rows) {
      facultadMap.set(f.nombre, f.id_facultades);
    }

    // Cargar SNIES únicos por CODIGO_PROGRAMA si vista_estudiantes_matriculados está disponible
    const sniesMap = new Map();
    if (vistasDisponibles.has("vista_estudiantes_matriculados")) {
      const sniesRes = await academicClient.query(`
        SELECT "CODIGO_PROGRAMA" as codigo, "CODIGO_PROGRAMA_2" as snies
        FROM public.vista_estudiantes_matriculados
        WHERE "CODIGO_PROGRAMA" IS NOT NULL AND "CODIGO_PROGRAMA_2" IS NOT NULL
        GROUP BY "CODIGO_PROGRAMA", "CODIGO_PROGRAMA_2";
      `);
      const sniesCount = new Map();
      for (const r of sniesRes.rows) {
        const s = String(r.snies).trim();
        sniesCount.set(s, (sniesCount.get(s) || 0) + 1);
      }
      for (const r of sniesRes.rows) {
        const c = String(r.codigo).trim();
        const s = String(r.snies).trim();
        if (sniesCount.get(s) === 1 && !sniesMap.has(c)) {
          sniesMap.set(c, s);
        }
      }
    }

    // Mapear programas existentes en sat.programas_academicos
    // (Preservamos estrictamente id_programas_academicos para no romper FKs ni alterar cardinalidad)
    const progMap = new Map(); // codigo_externo -> id_programas_academicos
    const progMapByName = new Map();
    const progsExistentes = await localClient.query(`
      SELECT id_programas_academicos, codigo_externo, nombre, id_facultades, codigo_snies
      FROM sat.programas_academicos;
    `);
    for (const p of progsExistentes.rows) {
      if (p.codigo_externo) {
        const c = String(p.codigo_externo).trim();
        if (!progMap.has(c)) {
          progMap.set(c, p.id_programas_academicos);
        }
      }
      if (p.nombre) {
        progMapByName.set(String(p.nombre).trim().toUpperCase(), p.id_programas_academicos);
      }
    }

    const PRIORITY_NAMES = {
      "BD": "ESPECIALIZACIÓN EN BIG DATA",
      "C": "ESPECIALIZACIÓN EN GERENCIA DE PROYECTOS",
      "CS": "ESPECIALIZACIÓN EN GERENCIA DE LA SEGURIDAD Y SALUD EN EL TRABAJO",
      "0": "COTERMINALIDAD - ESPECIALIZACIONES"
    };

    let programasActualizados = 0;
    let programasNuevos = 0;

    if (vistasDisponibles.has("vista_programas")) {
      const progProd = await academicClient.query(`
        SELECT DISTINCT nombre_programa, codigo, nombre_facultad
        FROM public.vista_programas
        ORDER BY codigo, nombre_programa;
      `);

      for (const r of progProd.rows) {
        const code = String(r.codigo || "").trim();
        const nombreProg = String(r.nombre_programa || "").trim();
        const nombreFac = String(r.nombre_facultad || "").trim().toUpperCase();
        const idFac = facultadMap.get(nombreFac) || null;
        const snies = sniesMap.get(code) || null;

        if (!code || !nombreProg) continue;

        if (progMap.has(code)) {
          const idProg = progMap.get(code);
          const targetName = PRIORITY_NAMES[code] || nombreProg;

          await localClient.query(`
            UPDATE sat.programas_academicos
            SET 
              nombre = $1,
              id_facultades = COALESCE($2, id_facultades),
              codigo_snies = COALESCE($3, codigo_snies),
              activo = true,
              actualizado_en = NOW()
            WHERE id_programas_academicos = $4;
          `, [targetName, idFac, snies, idProg]);
          programasActualizados++;

          // Registrar especializaciones con código '0' como programas independientes en el catálogo
          if (code === '0' && nombreProg.toUpperCase().startsWith('ESPECIALIZACIÓN')) {
            const uName = nombreProg.toUpperCase();
            if (!progMapByName.has(uName)) {
              const insEsp = await localClient.query(`
                INSERT INTO sat.programas_academicos (
                  codigo_externo, nombre, id_facultades, id_sedes, spadies, activo, actualizado_en
                ) VALUES ($1, $2, $3, $4, true, true, NOW())
                RETURNING id_programas_academicos;
              `, [null, nombreProg, idFac, idSede]);
              progMapByName.set(uName, insEsp.rows[0].id_programas_academicos);
              programasNuevos++;
            }
          }
        } else {
          const targetName = PRIORITY_NAMES[code] || nombreProg;
          const uName = targetName.toUpperCase();
          if (!progMapByName.has(uName)) {
            const insRes = await localClient.query(`
              INSERT INTO sat.programas_academicos (
                codigo_externo, nombre, id_facultades, id_sedes, codigo_snies, spadies, activo, actualizado_en
              ) VALUES ($1, $2, $3, $4, $5, true, true, NOW())
              RETURNING id_programas_academicos;
            `, [code, targetName, idFac, idSede, snies]);

            progMap.set(code, insRes.rows[0].id_programas_academicos);
            progMapByName.set(uName, insRes.rows[0].id_programas_academicos);
            programasNuevos++;
          }
        }
      }
    }

    // Asegurar que cualquier programa referenciado por estudiantes en vista_informacion_estudiantes esté mapeado
    const progsEstProd = await academicClient.query(`
      SELECT DISTINCT "CODIGO_PROGRAMA" 
      FROM public.vista_informacion_estudiantes 
      WHERE "CODIGO_PROGRAMA" IS NOT NULL;
    `);

    for (const r of progsEstProd.rows) {
      const code = String(r.CODIGO_PROGRAMA).trim();
      if (!progMap.has(code)) {
        const nombreProg = PROGRAM_NAMES_FALLBACK[code] || `Programa ${code}`;
        const insProg = await localClient.query(`
          INSERT INTO sat.programas_academicos (codigo_externo, nombre, id_sedes, spadies, activo, actualizado_en)
          VALUES ($1, $2, $3, true, true, NOW())
          RETURNING id_programas_academicos;
        `, [code, nombreProg, idSede]);
        progMap.set(code, insProg.rows[0].id_programas_academicos);
        programasNuevos++;
      }
    }

    const defaultProgId = progMap.values().next().value;
    console.log(`[OK] Programas académicos sincronizados (${programasActualizados} actualizados in-place, ${programasNuevos} nuevos registrados, ${progMap.size} activos).`);

    // -------------------------------------------------------------
    // PASO 3: Sincronización de Personas (sat.personas)
    // -------------------------------------------------------------
    console.log("\n PASO 3: Leyendo vista_informacion_estudiantes de prod18sep2...");
    const estProd = await academicClient.query(`
      SELECT 
        "CODIGO",
        "CODIGO_PROGRAMA",
        "JORNADA",
        "CORTE_INGRESO",
        "PRIMER_APELLIDO",
        "SEGUNDO_APELLIDO",
        "PRIMER_NOMBRE",
        "SEGUNDO_NOMBRE",
        "TIPO_DOCUMENTO",
        "DOCUMENTO",
        "FECHA_NACIMIENTO",
        "GENERO",
        "TELEFONO_FIJO",
        "TELEFONO_CEL",
        "EMAIL_PERSONAL",
        "EMAIL_INSTITUCIONAL",
        "DIRECCION",
        "id_estado_estudiante",
        "SEMESTRE_MATRICULA"
      FROM public.vista_informacion_estudiantes;
    `);
    console.log(`   Total filas recibidas: ${estProd.rows.length}`);

    // Extraer personas únicas por DOCUMENTO
    const personasMap = new Map();
    for (const row of estProd.rows) {
      const doc = String(row.DOCUMENTO || "").trim();
      if (!doc || personasMap.has(doc)) continue;
      personasMap.set(doc, row);
    }
    console.log(`   Personas únicas a sincronizar: ${personasMap.size}`);

    // Batch UPSERT en sat.personas
    const personaIdMap = new Map(); // documento -> id_personas
    const personasArray = Array.from(personasMap.values());
    const batchSize = 500;

    for (let i = 0; i < personasArray.length; i += batchSize) {
      const batch = personasArray.slice(i, i + batchSize);
      for (const p of batch) {
        const doc = String(p.DOCUMENTO).trim();
        const pNombre = (p.PRIMER_NOMBRE || "").trim() || "SIN_NOMBRE";
        const sNombre = (p.SEGUNDO_NOMBRE || "").trim() || null;
        const pApellido = (p.PRIMER_APELLIDO || "").trim() || "SIN_APELLIDO";
        const sApellido = (p.SEGUNDO_APELLIDO || "").trim() || null;
        const gen = (p.GENERO || "").trim() || null;
        const fNac = p.FECHA_NACIMIENTO ? new Date(p.FECHA_NACIMIENTO) : null;
        const emailP = (p.EMAIL_PERSONAL || "").trim() || null;
        const emailI = (p.EMAIL_INSTITUCIONAL || "").trim() || null;
        const cel = (p.TELEFONO_CEL || "").trim() || null;
        const tel = (p.TELEFONO_FIJO || "").trim() || null;
        const dir = (p.DIRECCION || "").trim() || null;

        const res = await localClient.query(`
          INSERT INTO sat.personas (
            numero_identificacion, primer_nombre, segundo_nombre,
            primer_apellido, segundo_apellido, genero, fecha_nacimiento,
            correo_electronico, correo_institucional, celular, telefono, direccion
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (numero_identificacion) DO UPDATE SET
            primer_nombre = EXCLUDED.primer_nombre,
            segundo_nombre = EXCLUDED.segundo_nombre,
            primer_apellido = EXCLUDED.primer_apellido,
            segundo_apellido = EXCLUDED.segundo_apellido,
            genero = EXCLUDED.genero,
            fecha_nacimiento = COALESCE(EXCLUDED.fecha_nacimiento, sat.personas.fecha_nacimiento),
            correo_electronico = COALESCE(EXCLUDED.correo_electronico, sat.personas.correo_electronico),
            correo_institucional = COALESCE(EXCLUDED.correo_institucional, sat.personas.correo_institucional),
            celular = COALESCE(EXCLUDED.celular, sat.personas.celular),
            telefono = COALESCE(EXCLUDED.telefono, sat.personas.telefono),
            direccion = COALESCE(EXCLUDED.direccion, sat.personas.direccion)
          RETURNING id;
        `, [doc, pNombre, sNombre, pApellido, sApellido, gen, fNac, emailP, emailI, cel, tel, dir]);

        personaIdMap.set(doc, res.rows[0].id);
      }
    }
    console.log(`[OK] ${personaIdMap.size} personas sincronizadas en sat.personas.`);

    // -------------------------------------------------------------
    // PASO 3: Sincronización de Estudiantes (sat.estudiantes)
    // -------------------------------------------------------------
    console.log("\n PASO 3: Sincronizando sat.estudiantes...");
    const studentIdMap = new Map(); // codigo_estudiante -> id_estudiantes

    for (let i = 0; i < personasArray.length; i += batchSize) {
      const batch = personasArray.slice(i, i + batchSize);
      for (const e of batch) {
        const doc = String(e.DOCUMENTO).trim();
        const cod = String(e.CODIGO || "").trim() || doc;
        const idPersona = personaIdMap.get(doc);
        const codeProg = String(e.CODIGO_PROGRAMA || "").trim();
        const idProg = progMap.get(codeProg) || defaultProgId;
        const tipoDoc = (e.TIPO_DOCUMENTO || "CC").trim();
        const nombres = [e.PRIMER_NOMBRE, e.SEGUNDO_NOMBRE].filter(Boolean).join(" ").trim() || "SIN_NOMBRE";
        const apellidos = [e.PRIMER_APELLIDO, e.SEGUNDO_APELLIDO].filter(Boolean).join(" ").trim() || "SIN_APELLIDO";
        const emailI = (e.EMAIL_INSTITUCIONAL || "").trim() || null;
        const emailP = (e.EMAIL_PERSONAL || "").trim() || null;
        const cel = (e.TELEFONO_CEL || "").trim() || null;
        const telFijo = (e.TELEFONO_FIJO || "").trim() || null;
        const dir = (e.DIRECCION || "").trim() || null;
        const fNac = e.FECHA_NACIMIENTO ? new Date(e.FECHA_NACIMIENTO) : null;
        const gen = (e.GENERO || "").trim() || null;
        const sem = parseInt(e.SEMESTRE_MATRICULA, 10) || 1;
        const estadoMat = (String(e.id_estado_estudiante) === "3" || String(e.id_estado_estudiante) === "1") ? "MATRICULADO" : "INACTIVO";
        const corte = (e.CORTE_INGRESO || "").trim() || null;

        const res = await localClient.query(`
          INSERT INTO sat.estudiantes (
            codigo_externo, tipo_documento, numero_documento, nombres, apellidos,
            correo_institucional, correo_personal, telefono, telefono_fijo, direccion,
            fecha_nacimiento, genero, id_sedes, id_programas_academicos, semestre_actual,
            estado_matricula, corte_ingreso, id_cargas_sincronizacion, sincronizado_en, id_personas
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), $19)
          ON CONFLICT (numero_documento) DO UPDATE SET
            codigo_externo = EXCLUDED.codigo_externo,
            tipo_documento = EXCLUDED.tipo_documento,
            nombres = EXCLUDED.nombres,
            apellidos = EXCLUDED.apellidos,
            correo_institucional = EXCLUDED.correo_institucional,
            correo_personal = EXCLUDED.correo_personal,
            telefono = EXCLUDED.telefono,
            telefono_fijo = EXCLUDED.telefono_fijo,
            direccion = EXCLUDED.direccion,
            id_sedes = EXCLUDED.id_sedes,
            id_programas_academicos = EXCLUDED.id_programas_academicos,
            semestre_actual = EXCLUDED.semestre_actual,
            estado_matricula = EXCLUDED.estado_matricula,
            corte_ingreso = EXCLUDED.corte_ingreso,
            id_cargas_sincronizacion = EXCLUDED.id_cargas_sincronizacion,
            sincronizado_en = NOW(),
            id_personas = EXCLUDED.id_personas
          RETURNING id_estudiantes;
        `, [
          cod, tipoDoc, doc, nombres, apellidos,
          emailI, emailP, cel, telFijo, dir,
          fNac, gen, idSede, idProg, sem,
          estadoMat, corte, idCarga, idPersona
        ]);

        studentIdMap.set(cod, res.rows[0].id_estudiantes);
        studentIdMap.set(doc, res.rows[0].id_estudiantes);
      }
    }

    // Vincular todos los códigos secundarios o múltiples de los estudiantes (pregrado y posgrado)
    for (const row of estProd.rows) {
      const doc = String(row.DOCUMENTO || "").trim();
      const cod = String(row.CODIGO || "").trim();
      const idEst = studentIdMap.get(doc) || studentIdMap.get(cod);
      if (idEst && cod) {
        studentIdMap.set(cod, idEst);
      }
    }
    console.log(`[OK] ${studentIdMap.size} códigos/documentos mapeados a sat.estudiantes.`);

    // -------------------------------------------------------------
    // PASO 4: Sincronización de Matrículas (sat.matriculas)
    // -------------------------------------------------------------
    console.log("\n PASO 4: Sincronizando sat.matriculas (soporte Pregrado + Posgrado)...");
    await localClient.query(`
      ALTER TABLE sat.matriculas DROP CONSTRAINT IF EXISTS uq_matricula_estudiante_periodo;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_matricula_estudiante_programa_periodo 
      ON sat.matriculas (id_estudiantes, id_programas_academicos, id_periodos_academicos);
    `);

    const matriculaIdMap = new Map(); // id_estudiantes -> id_matriculas
    const matriculaCodMap = new Map(); // codigo_estudiante -> id_matriculas

    for (const row of estProd.rows) {
      const doc = String(row.DOCUMENTO || "").trim();
      const cod = String(row.CODIGO || "").trim() || doc;
      const idEst = studentIdMap.get(cod) || studentIdMap.get(doc);
      if (!idEst) continue;

      const codeProg = String(row.CODIGO_PROGRAMA || "").trim();
      const idProg = progMap.get(codeProg) || defaultProgId;
      const sem = parseInt(row.SEMESTRE_MATRICULA, 10) || 1;
      const jornada = (row.JORNADA || "DIURNA").trim();

      const res = await localClient.query(`
        INSERT INTO sat.matriculas (
          id_estudiantes, id_programas_academicos, id_periodos_academicos,
          semestre, jornada, estado, codigo_externo, id_cargas_sincronizacion
        ) VALUES ($1, $2, $3, $4, $5, 'ACTIVA', $6, $7)
        ON CONFLICT (id_estudiantes, id_programas_academicos, id_periodos_academicos) DO UPDATE SET
          semestre = EXCLUDED.semestre,
          jornada = EXCLUDED.jornada,
          estado = 'ACTIVA',
          codigo_externo = EXCLUDED.codigo_externo,
          id_cargas_sincronizacion = EXCLUDED.id_cargas_sincronizacion
        RETURNING id_matriculas;
      `, [idEst, idProg, idPeriodo, sem, jornada, cod, idCarga]);

      const idMat = res.rows[0].id_matriculas;
      matriculaIdMap.set(idEst, idMat);
      matriculaCodMap.set(cod, idMat);
    }
    console.log(`[OK] ${matriculaCodMap.size} matrículas activas (Pregrado y Posgrado) registradas/actualizadas.`);

    // -------------------------------------------------------------
    // PASO 5: Asignaturas y Grupos (sat.asignaturas, sat.grupos_asignatura)
    // -------------------------------------------------------------
    console.log("\n PASO 5: Leyendo vista_informacion_academica de prod18sep2...");
    const acadProd = await academicClient.query(`
      SELECT 
        "CODIGO_ESTUDIANTE",
        "NOMBRE_MATERIA",
        "CODIGO_MATERIA",
        "NOTA_CORTE_1",
        "NOTA_CORTE_2",
        "NOTA_CORTE_3",
        "NOTA_FINAL",
        "INASISTENCIA_CORTE_1",
        "INASISTENCIA_CORTE_2",
        "INASISTENCIA_CORTE_3",
        "VECESVISTALAMATERIA"
      FROM public.vista_informacion_academica;
    `);
    console.log(`   Total registros académicos recibidos: ${acadProd.rows.length}`);

    // Extraer materias distintas
    const materiasMap = new Map();
    for (const r of acadProd.rows) {
      const codMat = String(r.CODIGO_MATERIA || "").trim();
      const nomMat = String(r.NOMBRE_MATERIA || "").trim() || `Asignatura ${codMat}`;
      if (!codMat || materiasMap.has(codMat)) continue;
      materiasMap.set(codMat, nomMat);
    }
    console.log(`   Asignaturas únicas encontradas: ${materiasMap.size}`);

    const asignaturaIdMap = new Map(); // codigo_materia -> id_asignaturas
    const grupoIdMap = new Map();      // codigo_materia -> id_grupos_asignatura

    for (const [codMat, nomMat] of materiasMap.entries()) {
      const resAsig = await localClient.query(`
        INSERT INTO sat.asignaturas (codigo_externo, codigo, nombre, id_programas_academicos, activo)
        VALUES ($1, $1, $2, $3, true)
        ON CONFLICT (codigo_externo) DO UPDATE SET
          nombre = EXCLUDED.nombre,
          activo = true
        RETURNING id_asignaturas;
      `, [codMat, nomMat, defaultProgId]);

      const idAsig = resAsig.rows[0].id_asignaturas;
      asignaturaIdMap.set(codMat, idAsig);

      // Asegurar grupo por defecto '01'
      const resGrp = await localClient.query(`
        INSERT INTO sat.grupos_asignatura (id_asignaturas, id_periodos_academicos, codigo_grupo, id_cargas_sincronizacion)
        VALUES ($1, $2, '01', $3)
        ON CONFLICT (id_asignaturas, id_periodos_academicos, codigo_grupo) DO UPDATE SET
          id_cargas_sincronizacion = EXCLUDED.id_cargas_sincronizacion
        RETURNING id_grupos_asignatura;
      `, [idAsig, idPeriodo, idCarga]);

      grupoIdMap.set(codMat, resGrp.rows[0].id_grupos_asignatura);
    }
    console.log(`[OK] ${asignaturaIdMap.size} asignaturas y grupos asegurados.`);

    // -------------------------------------------------------------
    // PASO 6: Calificaciones y Asistencias (sat.matriculas_asignaturas)
    // -------------------------------------------------------------
    console.log("\n PASO 6: Sincronizando notas e inasistencias en sat.matriculas_asignaturas...");
    let notasSincronizadas = 0;
    const acadBatchSize = 1000;

    for (let i = 0; i < acadProd.rows.length; i += acadBatchSize) {
      const batch = acadProd.rows.slice(i, i + acadBatchSize);
      for (const r of batch) {
        const codEst = String(r.CODIGO_ESTUDIANTE || "").trim();
        const codMat = String(r.CODIGO_MATERIA || "").trim();

        const idEst = studentIdMap.get(codEst);
        if (!idEst) continue;
        const idMatricula = matriculaCodMap.get(codEst) || matriculaIdMap.get(idEst);
        if (!idMatricula) continue;
        const idGrupo = grupoIdMap.get(codMat);
        if (!idGrupo) continue;

        const c1 = r.NOTA_CORTE_1 ? parseFloat(r.NOTA_CORTE_1) : null;
        const c2 = r.NOTA_CORTE_2 ? parseFloat(r.NOTA_CORTE_2) : null;
        const c3 = r.NOTA_CORTE_3 ? parseFloat(r.NOTA_CORTE_3) : null;
        const f = r.NOTA_FINAL ? parseFloat(r.NOTA_FINAL) : null;

        const inas1 = parseInt(r.INASISTENCIA_CORTE_1, 10) || 0;
        const inas2 = parseInt(r.INASISTENCIA_CORTE_2, 10) || 0;
        const inas3 = parseInt(r.INASISTENCIA_CORTE_3, 10) || 0;
        const veces = parseInt(r.VECESVISTALAMATERIA, 10) || 1;

        let estadoMateria = "CURSANDO";
        if (f !== null) {
          estadoMateria = f >= 3.0 ? "APROBADA" : "REPROBADA";
        }

        await localClient.query(`
          INSERT INTO sat.matriculas_asignaturas (
            id_matriculas, id_grupos_asignatura, nota_corte_1, nota_corte_2, nota_corte_3,
            nota_final, inasistencias_corte_1, inasistencias_corte_2, inasistencias_corte_3,
            veces_cursada, estado, id_cargas_sincronizacion, actualizado_en
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          ON CONFLICT (id_matriculas, id_grupos_asignatura) DO UPDATE SET
            nota_corte_1 = EXCLUDED.nota_corte_1,
            nota_corte_2 = EXCLUDED.nota_corte_2,
            nota_corte_3 = EXCLUDED.nota_corte_3,
            nota_final = EXCLUDED.nota_final,
            inasistencias_corte_1 = EXCLUDED.inasistencias_corte_1,
            inasistencias_corte_2 = EXCLUDED.inasistencias_corte_2,
            inasistencias_corte_3 = EXCLUDED.inasistencias_corte_3,
            veces_cursada = EXCLUDED.veces_cursada,
            estado = EXCLUDED.estado,
            id_cargas_sincronizacion = EXCLUDED.id_cargas_sincronizacion,
            actualizado_en = NOW();
        `, [
          idMatricula, idGrupo, c1, c2, c3,
          f, inas1, inas2, inas3, veces,
          estadoMateria, idCarga
        ]);

        notasSincronizadas++;
      }
      process.stdout.write(`   Procesados ${Math.min(i + acadBatchSize, acadProd.rows.length)} / ${acadProd.rows.length} registros...\r`);
    }
    console.log(`\n[OK] ${notasSincronizadas} registros académicos sincronizados en sat.matriculas_asignaturas.`);

    // -------------------------------------------------------------
    // PASO 7: Información Financiera (sat.apoyos_financieros)
    // -------------------------------------------------------------
    console.log("\n PASO 7: Sincronizando vista_informacion_financiera...");
    const finProd = await academicClient.query(`
      SELECT 
        "DOCUMENTO_ESTUDIANTE",
        "CODIGO_ESTUDIANTE",
        "PERIODO_DESCUENTO",
        "CONCEPTO_DESCUENTO",
        "NOMBRE_CONCEPTO_DESCUENTO",
        "PORCENTAJE_DESCUENTO",
        "VALOR_DESCUENTO"
      FROM public.vista_informacion_financiera;
    `);

    let apoyosSincronizados = 0;
    for (const f of finProd.rows) {
      const codEst = String(f.CODIGO_ESTUDIANTE || "").trim();
      const docEst = String(f.DOCUMENTO_ESTUDIANTE || "").trim();
      const idEst = studentIdMap.get(codEst) || (await localClient.query(`SELECT id_estudiantes FROM sat.estudiantes WHERE numero_documento = $1`, [docEst])).rows[0]?.id_estudiantes;

      if (!idEst) continue;

      const concepto = (f.CONCEPTO_DESCUENTO || "DESCUENTO").trim();
      const nombre = (f.NOMBRE_CONCEPTO_DESCUENTO || "APOYO MATRÍCULA").trim();
      const pct = f.PORCENTAJE_DESCUENTO ? parseFloat(f.PORCENTAJE_DESCUENTO) : 0;
      const val = f.VALOR_DESCUENTO ? parseFloat(f.VALOR_DESCUENTO) : null;

      await localClient.query(`
        INSERT INTO sat.apoyos_financieros (
          id_estudiantes, id_periodos_academicos, concepto_descuento,
          nombre_descuento, porcentaje_descuento, valor_descuento, creado_en
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW());
      `, [idEst, idPeriodo, concepto, nombre, pct, val]);
      apoyosSincronizados++;
    }
    console.log(`[OK] ${apoyosSincronizados} apoyos financieros registrados en sat.apoyos_financieros.`);

    // -------------------------------------------------------------
    // PASO 8: Sincronización de Docentes (sat.docentes y sat.personas)
    // -------------------------------------------------------------
    let docentesSincronizados = 0;
    if (vistasDisponibles.has("vista_docentes")) {
      console.log("\n‍ PASO 8: Sincronizando vista_docentes a sat.docentes y sat.personas...");
      const docProd = await academicClient.query(`SELECT * FROM public.vista_docentes;`);
      
      const progsDb = await localClient.query(`SELECT id_programas_academicos, nombre FROM sat.programas_academicos;`);
      const progNombreMap = new Map();
      for (const p of progsDb.rows) {
        progNombreMap.set(p.nombre.toUpperCase().trim(), p.id_programas_academicos);
      }

      for (const d of docProd.rows) {
        const numDoc = String(d.numero_identificacion || "").trim();
        if (!numDoc) continue;

        const pNom = String(d.PRIMER_NOMBRE || "").trim() || "SIN_NOMBRE";
        const sNom = String(d.SEGUNDO_NOMBRE || "").trim() || null;
        const pApe = String(d.PRIMER_APELLIDO || "").trim() || "SIN_APELLIDO";
        const sApe = String(d.SEGUNDO_APELLIDO || "").trim() || null;
        const tipoVinc = (d.tipo_vinculacion || d.abreviatura_vinculacion || "DOCENTE").trim();
        const nomProg = (d.nombre_programa || "").toUpperCase().trim();
        const activoDoc = d.estado !== false;
        const correoInst = String(d.correo_institucional || "").trim().toLowerCase() || null;

        // 1. Asegurar en sat.personas
        const resPersona = await localClient.query(`
          INSERT INTO sat.personas (
            numero_identificacion, primer_nombre, segundo_nombre,
            primer_apellido, segundo_apellido, cargo, correo_institucional
          ) VALUES ($1, $2, $3, $4, $5, 'Docente', $6)
          ON CONFLICT (numero_identificacion) DO UPDATE SET
            primer_nombre = COALESCE(EXCLUDED.primer_nombre, sat.personas.primer_nombre),
            segundo_nombre = COALESCE(EXCLUDED.segundo_nombre, sat.personas.segundo_nombre),
            primer_apellido = COALESCE(EXCLUDED.primer_apellido, sat.personas.primer_apellido),
            segundo_apellido = COALESCE(EXCLUDED.segundo_apellido, sat.personas.segundo_apellido),
            cargo = COALESCE(sat.personas.cargo, 'Docente'),
            correo_institucional = COALESCE(EXCLUDED.correo_institucional, sat.personas.correo_institucional)
          RETURNING id;
        `, [numDoc, pNom, sNom, pApe, sApe, correoInst]);
        const idPersona = resPersona.rows[0].id;

        // 2. Resolver id_programas_academicos si existe
        let idProgDoc = progNombreMap.get(nomProg) || null;
        if (!idProgDoc && nomProg) {
          for (const [pNomDb, pIdDb] of progNombreMap.entries()) {
            if (pNomDb.includes(nomProg) || nomProg.includes(pNomDb)) {
              idProgDoc = pIdDb;
              break;
            }
          }
        }

        const nomCompleto = [pNom, sNom].filter(Boolean).join(" ");
        const apeCompleto = [pApe, sApe].filter(Boolean).join(" ");

        // 3. Upsert en sat.docentes
        await localClient.query(`
          INSERT INTO sat.docentes (
            numero_documento, nombres, apellidos, tipo_vinculo,
            id_programas_academicos, activo, id_personas, correo_institucional
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (numero_documento) DO UPDATE SET
            nombres = EXCLUDED.nombres,
            apellidos = EXCLUDED.apellidos,
            tipo_vinculo = EXCLUDED.tipo_vinculo,
            id_programas_academicos = COALESCE(EXCLUDED.id_programas_academicos, sat.docentes.id_programas_academicos),
            activo = EXCLUDED.activo,
            id_personas = EXCLUDED.id_personas,
            correo_institucional = COALESCE(EXCLUDED.correo_institucional, sat.docentes.correo_institucional);
        `, [numDoc, nomCompleto, apeCompleto, tipoVinc, idProgDoc, activoDoc, idPersona, correoInst]);

        docentesSincronizados++;
      }
      console.log(`[OK] ${docentesSincronizados} docentes sincronizados en sat.docentes y sat.personas.`);
    } else {
      console.warn("\n[AVISO] PASO 8 omitido: vista_docentes no es visible para el usuario ACADEMIC_DB_USER (¿falta GRANT SELECT?). No se sincronizaron docentes ni correo_institucional.");
    }

    // -------------------------------------------------------------
    // PASO 9: Finalizar Auditoría
    // -------------------------------------------------------------
    const totalProcesados = personaIdMap.size + notasSincronizadas + apoyosSincronizados + facultadesSincronizadas + docentesSincronizados;
    await localClient.query(`
      UPDATE sat.cargas_sincronizacion
      SET estado = 'COMPLETADA',
          finalizada_en = NOW(),
          registros_procesados = $1,
          registros_error = 0
      WHERE id_cargas_sincronizacion = $2;
    `, [totalProcesados, idCarga]);

    const duracion = ((Date.now() - tInicio) / 1000).toFixed(1);
    console.log("\n================================================================");
    console.log(`[OK] SINCRONIZACIÓN EXITOSA en ${duracion} segundos`);
    console.log(`   - Facultades sincronizadas:        ${facultadesSincronizadas}`);
    console.log(`   - Docentes sincronizados:          ${docentesSincronizados}`);
    console.log(`   - Personas sincronizadas:          ${personaIdMap.size}`);
    console.log(`   - Estudiantes sincronizados:       ${studentIdMap.size}`);
    console.log(`   - Matrículas activas:              ${matriculaIdMap.size}`);
    console.log(`   - Asignaturas aseguradas:          ${asignaturaIdMap.size}`);
    console.log(`   - Notas e Inasistencias migradas:  ${notasSincronizadas}`);
    console.log(`   - Apoyos Financieros:              ${apoyosSincronizados}`);
    console.log(`   - Total registros procesados:      ${totalProcesados}`);
    console.log("================================================================");

    return {
      ok: true,
      duracionSegundos: duracion,
      personas: personaIdMap.size,
      estudiantes: studentIdMap.size,
      matriculas: matriculaIdMap.size,
      asignaturas: asignaturaIdMap.size,
      calificaciones: notasSincronizadas,
      apoyos: apoyosSincronizados,
      facultades: facultadesSincronizadas,
      docentes: docentesSincronizados,
      totalProcesados
    };

  } catch (err) {
    console.error("[ERROR] ERROR EN LA SINCRONIZACIÓN:", err);
    if (idCarga) {
      await localClient.query(`
        UPDATE sat.cargas_sincronizacion
        SET estado = 'ERROR',
            finalizada_en = NOW(),
            detalle_error = $1
        WHERE id_cargas_sincronizacion = $2;
      `, [JSON.stringify({ mensaje: err.message, stack: err.stack }), idCarga]).catch(() => {});
    }
    throw err;
  } finally {
    await academicClient.end().catch(() => {});
    localClient.release();
  }
}

// Ejecución directa por CLI: node src/shared/services/syncService.js
if (process.argv[1]?.includes("syncService.js")) {
  ejecutarSincronizacion()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
