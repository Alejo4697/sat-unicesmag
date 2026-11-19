import { pool, createAcademicClient } from "../../../../database/pool.js";

function clean(value, maxLength = 1000) {
  const text = String(value ?? "").trim();
  if (text.length > maxLength) {
    throw new Error(
      `Un dato de la vista institucional supera el límite de ${maxLength} caracteres.`,
    );
  }
  return text;
}

function combineDistinct(values, maxLength = 250) {
  const combined = [...new Set(values.map((value) => clean(value)).filter(Boolean))]
    .join(" · ");
  if (combined.length > maxLength) {
    throw new Error("Los cargos o dependencias de un administrativo superan el límite permitido.");
  }
  return combined || null;
}

export function agruparAdministrativos(rows) {
  const grouped = new Map();
  let sinIdentificacion = 0;

  for (const row of rows) {
    const identificacion = clean(row.identificacion, 64);
    if (!identificacion) {
      sinIdentificacion += 1;
      continue;
    }

    if (!/^[\p{L}\p{N}._-]{1,64}$/u.test(identificacion)) {
      throw new Error("La vista de administrativos contiene una identificación no válida.");
    }

    let administrative = grouped.get(identificacion);
    if (!administrative) {
      administrative = {
        identificacion,
        nombres: clean(row.primerNombre, 30),
        segundoNombre: clean(row.segundoNombre, 30),
        primerApellido: clean(row.primerApellido, 30),
        segundoApellido: clean(row.segundoApellido, 30),
        correo: clean(row.correo, 254).toLowerCase(),
        cargos: new Set(),
        dependencias: new Set(),
      };
      grouped.set(identificacion, administrative);
    }

    const cargo = clean(row.cargo, 250);
    const vinculacion = clean(row.vinculacion, 150);
    if (cargo || vinculacion) {
      administrative.cargos.add(
        cargo && vinculacion ? `${cargo} (${vinculacion})` : cargo || vinculacion,
      );
    }
    const dependencia = clean(row.dependencia, 250);
    if (dependencia) administrative.dependencias.add(dependencia);
    administrative.correo ||= clean(row.correo, 254).toLowerCase();
  }

  return {
    sinIdentificacion,
    administrativos: [...grouped.values()].map((administrative) => {
      if (!administrative.nombres && !administrative.segundoNombre) {
        throw new Error(
          `El administrativo ${administrative.identificacion} no tiene nombres en la vista institucional.`,
        );
      }
      return {
        identificacion: administrative.identificacion,
        nombrePartes: {
          primero: administrative.nombres || "SIN_NOMBRE",
          segundo: administrative.segundoNombre || null,
        },
        apellidos: [
          administrative.primerApellido,
          administrative.segundoApellido,
        ].filter(Boolean).join(" "),
        correo: administrative.correo || null,
        cargo: combineDistinct([...administrative.cargos]),
        dependencia: combineDistinct([...administrative.dependencias]),
      };
    }),
  };
}

export async function sincronizarAdministrativosInstitucionales(guardarPerfil) {
  if (typeof guardarPerfil !== "function") {
    throw new TypeError("Se requiere la función de guardado de perfiles VEC.");
  }
  const academicClient = createAcademicClient();
  let localClient;

  try {
    await academicClient.connect();
    const { rows } = await academicClient.query(`
      SELECT
        NULLIF(BTRIM(source.numero_identificacion), '') AS identificacion,
        person.primer_nombre AS "primerNombre",
        person.segundo_nombre AS "segundoNombre",
        person.primer_apellido AS "primerApellido",
        person.segundo_apellido AS "segundoApellido",
        source.correo_electronico AS correo,
        source.dependencia,
        source.cargo,
        source.vinculacion
      FROM public.vista_administrativos source
      JOIN public.personas person
        ON person.numero_identificacion = source.numero_identificacion
      ORDER BY BTRIM(source.numero_identificacion), source.dependencia, source.cargo;
    `);
    const { administrativos, sinIdentificacion } = agruparAdministrativos(rows);
    if (!administrativos.length) {
      throw new Error(
        "La vista public.vista_administrativos no devolvió administrativos con identificación válida.",
      );
    }

    localClient = await pool.connect();
    await localClient.query("BEGIN");
    const { rows: existingProfiles } = await localClient.query(
      `SELECT DISTINCT persona.numero_identificacion AS identificacion
       FROM sat.participantes_vec profile
       JOIN sat.personas persona ON persona.id = profile.id_personas
       WHERE profile.tipo_participante = 'ADMINISTRATIVO'
         AND persona.numero_identificacion = ANY($1::text[])`,
      [administrativos.map((administrative) => administrative.identificacion)],
    );
    const existingIds = new Set(
      existingProfiles.map((profile) => profile.identificacion),
    );
    let perfilesCreados = 0;
    let perfilesYaExistentes = 0;
    let personasNuevas = 0;
    let conflictosExternos = 0;

    for (const administrative of administrativos) {
      await localClient.query("SAVEPOINT sync_administrativo");
      try {
        const profile = await guardarPerfil(localClient, {
          identificacion: administrative.identificacion,
          nombres: [
            administrative.nombrePartes.primero,
            administrative.nombrePartes.segundo,
          ].filter(Boolean).join(" "),
          nombrePartes: administrative.nombrePartes,
          apellidos: administrative.apellidos,
          correo: administrative.correo,
          cargo: administrative.cargo,
          dependencia: administrative.dependencia,
          tipo: "ADMINISTRATIVO",
          detalleTipoParticipante: "Administrativo",
        });
        if (profile.tipoParticipante === "ADMINISTRATIVO") {
          await localClient.query(
            `UPDATE sat.participantes_vec
             SET cargo = COALESCE(NULLIF($2, ''), NULLIF(cargo, '')),
                 dependencia = COALESCE(NULLIF($3, ''), NULLIF(dependencia, '')),
                 actualizado_en = NOW()
             WHERE id_participantes_vec = $1
               AND tipo_participante = 'ADMINISTRATIVO'`,
            [
              profile.idParticipante,
              administrative.cargo,
              administrative.dependencia,
            ],
          );
        }
        await localClient.query("RELEASE SAVEPOINT sync_administrativo");
        if (existingIds.has(administrative.identificacion)) {
          perfilesYaExistentes += 1;
        } else {
          perfilesCreados += 1;
        }
        if (profile.personaNueva) personasNuevas += 1;
      } catch (error) {
        if (error.status !== 409 || !/rol Externo/i.test(error.message)) {
          throw error;
        }
        await localClient.query("ROLLBACK TO SAVEPOINT sync_administrativo");
        await localClient.query("RELEASE SAVEPOINT sync_administrativo");
        conflictosExternos += 1;
      }
    }

    await localClient.query("COMMIT");
    return {
      registrosOrigen: rows.length,
      administrativosUnicos: administrativos.length,
      personasNuevas,
      perfilesCreados,
      perfilesYaExistentes,
      conflictosExternos,
      sinIdentificacion,
      filasRepetidas: Math.max(
        rows.length - administrativos.length - sinIdentificacion,
        0,
      ),
    };
  } catch (error) {
    if (localClient) await localClient.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await academicClient.end().catch(() => {});
    localClient?.release();
  }
}
