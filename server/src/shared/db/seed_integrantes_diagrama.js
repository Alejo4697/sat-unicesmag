import bcrypt from "bcryptjs";
import { query } from "./pool.js";

async function poblarUsuariosCompletos() {
  console.log("Iniciando verificación y poblado de usuarios reales según diagrama...");

  const passwordHash = await bcrypt.hash("cesmag2026*", 10);

  // 1. Desvincular estudiantes de sat.usuarios_roles para que NUNCA aparezcan como funcionarios
  await query(`
    DELETE FROM sat.usuarios_roles
    WHERE id_usuarios IN (
      SELECT id_usuarios FROM sat.usuarios 
      WHERE correo_institucional IN ('sofia.rosero@unicesmag.edu.co', 'estudianteprueba@unicesmag.edu.co')
    );
  `);
  console.log("[OK] Cuentas de estudiantes desvinculadas de roles de funcionario.");

  // 2. Asegurar que Sergio Cabrera tenga su cargo institucional configurado
  await query(`
    UPDATE sat.usuarios
    SET cargo = 'Administrador de Sistema SAT',
        activo = true,
        password_hash = $1,
        debe_cambiar_password = false
    WHERE correo_institucional = 'scabrera.7043@unicesmag.edu.co';
  `, [passwordHash]);

  // Asegurar rol 'admin' para Sergio Cabrera
  await query(`
    INSERT INTO sat.usuarios_roles (id_usuarios, id_roles)
    SELECT u.id_usuarios, r.id_roles
    FROM sat.usuarios u, sat.roles r
    WHERE u.correo_institucional = 'scabrera.7043@unicesmag.edu.co'
      AND r.nombre = 'admin'
    ON CONFLICT DO NOTHING;
  `);

  // 3. Lista completa de integrantes según la imagen manuscrita
  const usuariosPorCrear = [
    // Rol: Profesionales
    {
      documento: "1085000021",
      nombres: "Lic. María del Carmen",
      apellidos: "Daza",
      correo: "pazyconvivencia@unicesmag.edu.co",
      cargo: "Coordinador de Paz y Convivencia",
      rol: "profesional",
      dependencia: "Área de Salud y Acompañamiento"
    },
    {
      documento: "1085000022",
      nombres: "Dra. Claudia",
      apellidos: "Navarro",
      correo: "salud.mariagoretti@unicesmag.edu.co",
      cargo: "Área de Salud María Goretti",
      rol: "profesional",
      dependencia: "Área de Salud y Acompañamiento"
    },
    {
      documento: "1085000023",
      nombres: "Docente Asistencial",
      apellidos: "Servicios Psicológicos",
      correo: "docente.asistencial.usp@unicesmag.edu.co",
      cargo: "Docente Asistencial Unidad Servicios Psicológicos",
      rol: "profesional",
      dependencia: "Docentes Asistenciales Unidad Servicios Psicológicos"
    },
    {
      documento: "1085000024",
      nombres: "Dra. Elizabeth",
      apellidos: "Riascos",
      correo: "servicios.psicologicos@unicesmag.edu.co",
      cargo: "Unidad de Servicios Psicológicos (USP)",
      rol: "profesional",
      dependencia: "Unidad de Servicios Psicológicos (USP)"
    },
    {
      documento: "1085000025",
      nombres: "Dr. Roberto",
      apellidos: "Salazar",
      correo: "coordinador.usp@unicesmag.edu.co",
      cargo: "Coordinador de Servicios Psicológicos",
      rol: "profesional",
      dependencia: "Coordinador de Servicios Psicológicos"
    },
    {
      documento: "1085000026",
      nombres: "Mag. Fernando",
      apellidos: "Burbano",
      correo: "docente.tutor@unicesmag.edu.co",
      cargo: "Docente Tutor",
      rol: "profesional",
      dependencia: "Docentes Tutor"
    },

    // Rol: Directivos
    {
      documento: "1085000027",
      nombres: "Dr. Javier",
      apellidos: "Pantoja",
      correo: "director.derecho@unicesmag.edu.co",
      cargo: "Director Programa de Derecho",
      rol: "directivo",
      dependencia: "Dirección de Programas Académicos",
      programa: "Derecho"
    },
    {
      documento: "1085000028",
      nombres: "Mag. Sandra",
      apellidos: "Villota",
      correo: "coordinador.especializaciones@unicesmag.edu.co",
      cargo: "Coordinador de Especializaciones",
      rol: "directivo",
      dependencia: "Coordinación de Especializaciones"
    },
    {
      documento: "1085000029",
      nombres: "Ing. Mauricio",
      apellidos: "Chaves",
      correo: "coordinador.sistemas@unicesmag.edu.co",
      cargo: "Coordinador Académico (Sistemas)",
      rol: "directivo",
      dependencia: "Coordinación Académica",
      programa: "Ingeniería de Sistemas"
    },
    {
      documento: "1085000030",
      nombres: "Mag. Lucía",
      apellidos: "Cárdenas",
      correo: "docente.acompanante@unicesmag.edu.co",
      cargo: "Docente Acompañante",
      rol: "profesional",
      dependencia: "Docentes Acompañantes"
    }
  ];

  for (const item of usuariosPorCrear) {
    // 3.1 Insertar o actualizar usuario
    const insRes = await query(`
      INSERT INTO sat.usuarios (
        tipo_documento,
        numero_documento,
        nombres,
        apellidos,
        correo_institucional,
        password_hash,
        cargo,
        debe_cambiar_password,
        activo,
        intentos_fallidos
      ) VALUES ('CC', $1, $2, $3, $4, $5, $6, true, true, 0)
      ON CONFLICT (correo_institucional) 
      DO UPDATE SET 
        nombres = EXCLUDED.nombres,
        apellidos = EXCLUDED.apellidos,
        cargo = EXCLUDED.cargo,
        password_hash = EXCLUDED.password_hash,
        activo = true
      RETURNING id_usuarios;
    `, [item.documento, item.nombres, item.apellidos, item.correo, passwordHash, item.cargo]);

    const idUsuario = insRes.rows[0].id_usuarios;

    // 3.2 Asignar Rol
    await query(`
      INSERT INTO sat.usuarios_roles (id_usuarios, id_roles)
      SELECT $1, id_roles FROM sat.roles WHERE nombre = $2
      ON CONFLICT DO NOTHING;
    `, [idUsuario, item.rol]);

    // 3.3 Asignar Dependencia
    if (item.dependencia) {
      await query(`
        INSERT INTO sat.usuarios_dependencias (id_usuarios, id_dependencias, es_responsable)
        SELECT $1, id_dependencias, true
        FROM sat.dependencias
        WHERE nombre = $2 OR nombre ILIKE '%' || $2 || '%'
        LIMIT 1
        ON CONFLICT DO NOTHING;
      `, [idUsuario, item.dependencia]);
    }

    // 3.4 Asignar Programa Académico si aplica
    if (item.programa) {
      await query(`
        INSERT INTO sat.usuarios_programas (id_usuarios, id_programas_academicos, rol_en_programa)
        SELECT DISTINCT ON (p.nombre) $1, p.id_programas_academicos, 'DIRECTIVO_PROGRAMA'
        FROM sat.programas_academicos p
        WHERE p.nombre ILIKE '%' || $2 || '%'
        LIMIT 1
        ON CONFLICT DO NOTHING;
      `, [idUsuario, item.programa]);
    }
  }

  console.log(`[OK] Todos los perfiles del diagrama han sido registrados exitosamente en sat.usuarios.`);
  process.exit(0);
}

poblarUsuariosCompletos().catch(e => {
  console.error("Error al poblar usuarios:", e);
  process.exit(1);
});
