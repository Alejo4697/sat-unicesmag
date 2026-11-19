import { pool, createAcademicClient } from "../../../../database/pool.js";

function clean(value, maxLength = 1000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function splitPersonNames(value) {
  const fullName = String(value ?? "").trim();
  if (fullName.length > 60) {
    throw new Error("El nombre de un egresado supera el límite total de sat.personas.");
  }
  const words = fullName.split(/\s+/).filter(Boolean);
  const firstNames = [];
  const secondNames = [];
  let secondNamesStarted = false;

  for (const word of words) {
    if (word.length > 30) {
      throw new Error("Un nombre de egresado supera el límite de 30 caracteres por campo.");
    }

    const target = secondNamesStarted ? secondNames : firstNames;
    const currentLength = target.join(" ").length;
    if (currentLength + (currentLength ? 1 : 0) + word.length <= 30) {
      target.push(word);
    } else if (!secondNamesStarted) {
      secondNamesStarted = true;
      secondNames.push(word);
    } else {
      throw new Error("El nombre de un egresado no cabe en los campos de nombres de sat.personas.");
    }
  }

  return {
    primero: firstNames.join(" ") || "SIN_NOMBRE",
    segundo: secondNames.join(" ") || null,
  };
}

function groupGraduates(rows) {
  const grouped = new Map();
  let sinIdentificacion = 0;

  for (const row of rows) {
    const identificacion = clean(row.identificacion, 64);
    if (!identificacion) {
      sinIdentificacion++;
      continue;
    }

    let graduate = grouped.get(identificacion);
    if (!graduate) {
      graduate = {
        identificacion,
        nombres: clean(row.nombres, 240) || "SIN_NOMBRE",
        correo: clean(row.correo, 254).toLowerCase(),
        correoInstitucional: clean(row.correoInstitucional, 254).toLowerCase(),
        celular: clean(row.celular, 40),
        direccion: clean(row.direccion, 250),
        codigos: new Set(),
        programas: new Set(),
      };
      grouped.set(identificacion, graduate);
    }

    const codigo = clean(row.codigo, 100);
    const programa = clean(row.programa, 250);
    if (codigo) graduate.codigos.add(codigo);
    if (programa) graduate.programas.add(programa);
    graduate.correo ||= clean(row.correo, 254).toLowerCase();
    graduate.correoInstitucional ||= clean(row.correoInstitucional, 254).toLowerCase();
    graduate.celular ||= clean(row.celular, 40);
    graduate.direccion ||= clean(row.direccion, 250);
  }

  return {
    sinIdentificacion,
    graduates: [...grouped.values()].map((graduate) => ({
      identificacion: graduate.identificacion,
      nombrePartes: splitPersonNames(graduate.nombres),
      correo: graduate.correo || null,
      correoInstitucional: graduate.correoInstitucional || null,
      celular: graduate.celular || null,
      direccion: graduate.direccion || null,
      codigo: [...graduate.codigos].join(", ").slice(0, 100) || null,
      programaAcademico: [...graduate.programas].join(" · ").slice(0, 250) || null,
    })),
  };
}

export async function sincronizarEgresadosInstitucionales(guardarPerfil) {
  if (typeof guardarPerfil !== "function") {
    throw new TypeError("Se requiere la función de guardado de perfiles VEC.");
  }
  const academicClient = createAcademicClient();
  let localClient;

  try {
    await academicClient.connect();
    const { rows } = await academicClient.query(`
      SELECT
        "ID" AS identificacion,
        "CODIGO" AS codigo,
        "PROGRAMA" AS programa,
        "NOMBRES" AS nombres,
        "correo electronico" AS correo,
        "correo institucional" AS "correoInstitucional",
        "CELULAR" AS celular,
        "DIRECCIÓN" AS direccion
    FROM public.vista_egresados
    ORDER BY BTRIM("ID"), "ULTIMA MATRICULA" DESC NULLS LAST;
    `);
    const { graduates, sinIdentificacion } = groupGraduates(rows);
    if (!graduates.length) {
      throw new Error("La vista public.vista_egresados no devolvió egresados con identificación válida.");
    }

    localClient = await pool.connect();
    await localClient.query("BEGIN");
    const { rows: existingProfiles } = await localClient.query(
      `SELECT DISTINCT persona.numero_identificacion AS identificacion
       FROM sat.participantes_vec profile
       JOIN sat.personas persona ON persona.id = profile.id_personas
       WHERE profile.tipo_participante = 'EGRESADO'
         AND persona.numero_identificacion = ANY($1::text[])`,
      [graduates.map((graduate) => graduate.identificacion)],
    );
    const existingIds = new Set(
      existingProfiles.map((profile) => profile.identificacion),
    );
    let perfilesCreados = 0;
    let perfilesYaExistentes = 0;
    let personasNuevas = 0;
    let conflictosExternos = 0;

    for (const graduate of graduates) {
      await localClient.query("SAVEPOINT sync_egresado");
      try {
        const profile = await guardarPerfil(localClient, {
          identificacion: graduate.identificacion,
          nombres: graduate.nombrePartes.primero,
          nombrePartes: graduate.nombrePartes,
          apellidos: "",
          correo: graduate.correo,
          correoInstitucional: graduate.correoInstitucional,
          celular: graduate.celular,
          direccion: graduate.direccion,
          codigo: graduate.codigo,
          programaAcademico: graduate.programaAcademico,
          tipo: "EGRESADO",
          detalleTipoParticipante: "Egresado",
        });
        if (profile.tipoParticipante === "EGRESADO") {
          await localClient.query(
            `UPDATE sat.participantes_vec
             SET codigo = COALESCE(NULLIF(codigo, ''), $2),
                 programa_academico = COALESCE(NULLIF(programa_academico, ''), $3),
                 actualizado_en = NOW()
             WHERE id_participantes_vec = $1
               AND tipo_participante = 'EGRESADO'`,
            [profile.idParticipante, graduate.codigo, graduate.programaAcademico],
          );
        }
        await localClient.query("RELEASE SAVEPOINT sync_egresado");
        if (existingIds.has(graduate.identificacion)) perfilesYaExistentes++;
        else perfilesCreados++;
        if (profile.personaNueva) personasNuevas++;
      } catch (error) {
        if (error.status !== 409 || !/rol Externo/i.test(error.message)) {
          throw error;
        }
        await localClient.query("ROLLBACK TO SAVEPOINT sync_egresado");
        await localClient.query("RELEASE SAVEPOINT sync_egresado");
        conflictosExternos++;
      }
    }

    await localClient.query("COMMIT");
    return {
      registrosOrigen: rows.length,
      egresadosUnicos: graduates.length,
      personasNuevas,
      perfilesCreados,
      perfilesYaExistentes,
      conflictosExternos,
      sinIdentificacion,
      filasRepetidas: Math.max(rows.length - graduates.length - sinIdentificacion, 0),
    };
  } catch (error) {
    if (localClient) await localClient.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await academicClient.end().catch(() => {});
    localClient?.release();
  }
}
