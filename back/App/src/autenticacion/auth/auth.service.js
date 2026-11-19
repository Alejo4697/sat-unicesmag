import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { query } from "../../../../database/pool.js";
import { MOCK_DATA } from "../../shared/menu/mockData.js";
import { enviarCorreoRecuperacionPassword } from "../../shared/correo/notificacion.correo.js";

export function normalizarRol(rol) {
  if (!rol) return "sin_rol";
  const r = String(rol).toLowerCase().trim();
  if (r === "administrador" || r === "coordinador" || r === "admin") return "admin";
  if (r === "docente" || r === "docente_permanencia") return "directivo";
  if (r === "profesional_asistencial") return "profesional";
  return r;
}

export async function listarUsuarios() {
  try {
    const { rows } = await query(`
      SELECT 
        u.id_usuarios AS id,
        CONCAT(u.nombres, ' ', u.apellidos) AS nombre,
        u.nombres,
        u.apellidos,
        u.correo_institucional AS email,
        COALESCE(LOWER(r.nombre), 'admin') AS rol,
        COALESCE(u.cargo, 'Funcionario Institucional') AS cargo,
        d.nombre AS dependencia,
        p.nombre AS programa,
        u.debe_cambiar_password AS "debeCambiarPassword"
      FROM sat.usuarios u
      LEFT JOIN sat.usuarios_roles ur ON u.id_usuarios = ur.id_usuarios
      LEFT JOIN sat.roles r ON ur.id_roles = r.id_roles
      LEFT JOIN sat.usuarios_dependencias ud ON u.id_usuarios = ud.id_usuarios
      LEFT JOIN sat.dependencias d ON ud.id_dependencias = d.id_dependencias
      LEFT JOIN sat.usuarios_programas up ON u.id_usuarios = up.id_usuarios
      LEFT JOIN sat.programas_academicos p ON up.id_programas_academicos = p.id_programas_academicos
      WHERE u.activo = true
        AND (r.nombre IS NULL OR LOWER(r.nombre) NOT IN ('estudiante'))
        AND u.correo_institucional NOT IN ('sofia.rosero@unicesmag.edu.co', 'estudianteprueba@unicesmag.edu.co')
      ORDER BY u.nombres ASC
    `);

    if (rows.length > 0) {
      const mapaUsuarios = new Map();
      for (const row of rows) {
        if (!mapaUsuarios.has(row.id)) {
          mapaUsuarios.set(row.id, {
            ...row,
            rol: normalizarRol(row.rol),
            dependencias: row.dependencia ? [row.dependencia] : [],
            programas: row.programa ? [row.programa] : []
          });
        } else {
          const u = mapaUsuarios.get(row.id);
          if (row.dependencia && !u.dependencias.includes(row.dependencia)) {
            u.dependencias.push(row.dependencia);
          }
          if (row.programa && !u.programas.includes(row.programa)) {
            u.programas.push(row.programa);
          }
        }
      }
      return Array.from(mapaUsuarios.values());
    }
  } catch (err) {
    console.warn("Fallo al consultar usuarios en PostgreSQL:", err.message);
  }

  return MOCK_DATA.usuarios.map(({ id, nombre, rol, cargo, programa, email }) => ({
    id,
    nombre,
    rol: normalizarRol(rol),
    cargo,
    programa,
    email,
    dependencias: [],
    programas: programa ? [programa] : []
  }));
}

export async function login(credentials, ip, userAgent) {
  const { email, correo, documento, identificacion, usuario: usuarioInput, password } = credentials;
  const targetRaw = (email || correo || documento || identificacion || usuarioInput || "").trim();
  const targetLower = targetRaw.toLowerCase();
  const targetCleanDoc = targetRaw.replace(/[^0-9a-zA-Z]/g, "");
  const usernameOnly = targetLower.includes("@") ? targetLower.split("@")[0].trim() : targetLower;

  if (!targetRaw || !password) {
    const error = new Error("Debe ingresar el correo institucional o documento y la contraseña.");
    error.status = 400;
    throw error;
  }

  let { rows } = await query(`
    SELECT 
      u.id_usuarios,
      u.nombres,
      u.apellidos,
      u.correo_institucional,
      u.numero_documento,
      u.password_hash,
      COALESCE(u.cargo, doc_u.tipo_vinculo) AS cargo,
      u.intentos_fallidos,
      u.bloqueado_hasta,
      u.debe_cambiar_password,
      u.activo,
      COALESCE(
        LOWER(r.nombre),
        CASE WHEN doc_u.id_docentes IS NOT NULL THEN 'profesional' ELSE 'admin' END
      ) AS rol,
      d.nombre AS dependencia,
      COALESCE(p.nombre, p_doc.nombre) AS programa
    FROM sat.usuarios u
    LEFT JOIN sat.usuarios_roles ur ON u.id_usuarios = ur.id_usuarios
    LEFT JOIN sat.roles r ON ur.id_roles = r.id_roles
    LEFT JOIN sat.usuarios_dependencias ud ON u.id_usuarios = ud.id_usuarios
    LEFT JOIN sat.dependencias d ON ud.id_dependencias = d.id_dependencias
    LEFT JOIN sat.usuarios_programas up ON u.id_usuarios = up.id_usuarios
    LEFT JOIN sat.programas_academicos p ON up.id_programas_academicos = p.id_programas_academicos
    LEFT JOIN sat.docentes doc_u ON (doc_u.id_usuarios = u.id_usuarios OR (doc_u.numero_documento = u.numero_documento AND u.numero_documento IS NOT NULL))
    LEFT JOIN sat.programas_academicos p_doc ON doc_u.id_programas_academicos = p_doc.id_programas_academicos
    WHERE LOWER(TRIM(u.correo_institucional)) = $1
       OR LOWER(TRIM(u.correo_institucional)) = LOWER($2 || '@unicesmag.edu.co')
       OR LOWER(TRIM(u.correo_institucional)) = LOWER($2 || '@cesmag.edu.co')
       OR SPLIT_PART(LOWER(TRIM(u.correo_institucional)), '@', 1) = $2
       OR u.numero_documento = $3
       OR ($4 <> '' AND REGEXP_REPLACE(u.numero_documento, '[^0-9a-zA-Z]', '', 'g') = $4)
       OR LOWER(TRIM(u.nombres || ' ' || u.apellidos)) = $1
       OR EXISTS (
          SELECT 1 FROM sat.docentes doc 
          WHERE (doc.id_usuarios = u.id_usuarios OR doc.numero_documento = u.numero_documento)
            AND (
              doc.numero_documento = $3
              OR ($4 <> '' AND REGEXP_REPLACE(doc.numero_documento, '[^0-9a-zA-Z]', '', 'g') = $4)
              OR doc.codigo_externo = $3
              OR LOWER(TRIM(doc.correo_institucional)) = $1
              OR SPLIT_PART(LOWER(TRIM(doc.correo_institucional)), '@', 1) = $2
            )
       )
    LIMIT 1
  `, [targetLower, usernameOnly, targetRaw, targetCleanDoc]);

  if (rows.length === 0) {
    const docRes = await query(`
      SELECT d.id_usuarios, d.correo_institucional, d.numero_documento, d.codigo_externo
      FROM sat.docentes d
      WHERE d.numero_documento = $1
         OR ($2 <> '' AND REGEXP_REPLACE(d.numero_documento, '[^0-9a-zA-Z]', '', 'g') = $2)
         OR d.codigo_externo = $1
         OR LOWER(TRIM(d.correo_institucional)) = $3
         OR SPLIT_PART(LOWER(TRIM(d.correo_institucional)), '@', 1) = $4
      LIMIT 1
    `, [targetRaw, targetCleanDoc, targetLower, usernameOnly]);

    if (docRes.rows.length > 0) {
      const docEncontrado = docRes.rows[0];
      const emailBuscar = (docEncontrado.correo_institucional || "").toLowerCase();
      const docBuscar = docEncontrado.numero_documento;

      const retry = await query(`
        SELECT 
          u.id_usuarios, u.nombres, u.apellidos, u.correo_institucional, u.numero_documento,
          u.password_hash, u.cargo, u.intentos_fallidos, u.bloqueado_hasta, u.debe_cambiar_password,
          u.activo, COALESCE(LOWER(r.nombre), 'profesional') AS rol, d.nombre AS dependencia, p.nombre AS programa
        FROM sat.usuarios u
        LEFT JOIN sat.usuarios_roles ur ON u.id_usuarios = ur.id_usuarios
        LEFT JOIN sat.roles r ON ur.id_roles = r.id_roles
        LEFT JOIN sat.usuarios_dependencias ud ON u.id_usuarios = ud.id_usuarios
        LEFT JOIN sat.dependencias d ON ud.id_dependencias = d.id_dependencias
        LEFT JOIN sat.usuarios_programas up ON u.id_usuarios = up.id_usuarios
        LEFT JOIN sat.programas_academicos p ON up.id_programas_academicos = p.id_programas_academicos
        WHERE LOWER(TRIM(u.correo_institucional)) = $1
           OR u.numero_documento = $2
           OR ($3 <> '' AND REGEXP_REPLACE(u.numero_documento, '[^0-9a-zA-Z]', '', 'g') = $3)
        LIMIT 1
      `, [emailBuscar, docBuscar, targetCleanDoc]);

      if (retry.rows.length > 0) {
        rows = retry.rows;
      }
    }
  }

  if (rows.length === 0) {
    const error = new Error("Credenciales inválidas. Verifique su correo o documento y contraseña.");
    error.status = 401;
    throw error;
  }

  const dbUser = rows[0];

  if (!dbUser.activo) {
    const error = new Error("Este usuario se encuentra inactivo. Comuníquese con la administración.");
    error.status = 403;
    throw error;
  }

  if (normalizarRol(dbUser.rol) === "estudiante") {
    const error = new Error("Los estudiantes no tienen un perfil en este módulo. Deben ingresar a través del portal 'Estudiantes (OTP)' con su código estudiantil.");
    error.status = 403;
    throw error;
  }

  if (dbUser.bloqueado_hasta && new Date(dbUser.bloqueado_hasta) > new Date()) {
    const minutosRestantes = Math.ceil((new Date(dbUser.bloqueado_hasta) - new Date()) / 60000);
    const error = new Error(`Cuenta temporalmente bloqueada por seguridad tras múltiples intentos fallidos. Intente nuevamente en ${minutosRestantes} minuto(s).`);
    error.status = 403;
    throw error;
  }

  const passRaw = String(password || "");
  const passTrim = passRaw.trim();
  let passwordValida = false;

  if (dbUser.password_hash) {
    passwordValida = (await bcrypt.compare(passRaw, dbUser.password_hash)) ||
                     (await bcrypt.compare(passTrim, dbUser.password_hash));

    if (!passwordValida) {
      const esDefaultEnBD = await bcrypt.compare("cesmag2026*", dbUser.password_hash);
      if (esDefaultEnBD) {
        const variantesValidas = ["cesmag2026*", "cesmag2026", "Cesmag2026*", "Cesmag2026", "CESMAG2026*", "CESMAG2026"];
        if (variantesValidas.includes(passTrim)) {
          passwordValida = true;
        }
      }
    }
  }

  if (!passwordValida) {
    const nuevosIntentos = (dbUser.intentos_fallidos || 0) + 1;
    let bloquearHasta = null;

    if (nuevosIntentos >= 5) {
      bloquearHasta = new Date(Date.now() + 15 * 60 * 1000);
    }

    await query(`
      UPDATE sat.usuarios
      SET intentos_fallidos = $1,
          bloqueado_hasta = $2
      WHERE id_usuarios = $3
    `, [nuevosIntentos, bloquearHasta, dbUser.id_usuarios]);

    if (nuevosIntentos >= 5) {
      const error = new Error("Has superado el límite de 5 intentos fallidos. Tu cuenta ha sido bloqueada por 15 minutos.");
      error.status = 403;
      throw error;
    }

    const error = new Error(`Credenciales inválidas. Intentos restantes: ${5 - nuevosIntentos}.`);
    error.status = 401;
    throw error;
  }

  await query(`
    UPDATE sat.usuarios
    SET intentos_fallidos = 0,
        bloqueado_hasta = NULL
    WHERE id_usuarios = $1
  `, [dbUser.id_usuarios]);

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiraEn = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await query(`
    INSERT INTO sat.sesiones (
      id_usuarios,
      token_sesion,
      ip_origen,
      user_agent,
      iniciada_en,
      expirada_en,
      ultimo_acceso_en
    ) VALUES ($1, $2, $3, $4, NOW(), $5, NOW())
  `, [
    dbUser.id_usuarios,
    tokenHash,
    (ip === "::1" || ip === "127.0.0.1") ? "127.0.0.1" : (ip ? ip.split(",")[0].trim() : null),
    userAgent,
    expiraEn
  ]);

  const usuarioRespuesta = {
    id: dbUser.id_usuarios,
    nombre: `${dbUser.nombres} ${dbUser.apellidos}`.trim(),
    nombres: dbUser.nombres,
    apellidos: dbUser.apellidos,
    email: dbUser.correo_institucional,
    rol: normalizarRol(dbUser.rol),
    cargo: dbUser.cargo || "Funcionario Institucional",
    dependencia: dbUser.dependencia || null,
    programa: dbUser.programa || null,
    debeCambiarPassword: !!dbUser.debe_cambiar_password
  };

  return {
    token: rawToken,
    user: usuarioRespuesta
  };
}

export async function logout(authHeader) {
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const rawToken = authHeader.slice(7).trim();
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    try {
      await query(`
        UPDATE sat.sesiones
        SET cerrada_en = NOW()
        WHERE (token_sesion = $1 OR token_sesion = $2) AND cerrada_en IS NULL
      `, [tokenHash, rawToken]);
    } catch (e) {
      console.warn("Fallo al cerrar sesión en BD:", e.message);
    }
  }
  return { ok: true, message: "Sesión cerrada exitosamente." };
}

export async function cambiarPassword(user, passwordActual, nuevoPassword) {
  if (!passwordActual) {
    const error = new Error("Debe ingresar su contraseña actual para confirmar su identidad.");
    error.status = 400;
    throw error;
  }

  if (!nuevoPassword || String(nuevoPassword).length < 8) {
    const error = new Error("La nueva contraseña debe tener al menos 8 caracteres.");
    error.status = 400;
    throw error;
  }

  if (passwordActual === nuevoPassword) {
    const error = new Error("La nueva contraseña debe ser diferente a la contraseña actual.");
    error.status = 400;
    throw error;
  }

  const { rows } = await query(`
    SELECT id_usuarios, password_hash
    FROM sat.usuarios
    WHERE id_usuarios::text = $1 OR LOWER(correo_institucional) = LOWER($2)
    LIMIT 1
  `, [String(user.id || ""), String(user.email || "")]);

  if (rows.length === 0) {
    const error = new Error("Usuario no encontrado en la base de datos.");
    error.status = 404;
    throw error;
  }

  const u = rows[0];
  if (u.password_hash && u.password_hash.startsWith("$2")) {
    const match = await bcrypt.compare(passwordActual, u.password_hash);
    if (!match) {
      const error = new Error("La contraseña actual ingresada no es correcta.");
      error.status = 400;
      throw error;
    }
  }

  const nuevoHash = await bcrypt.hash(nuevoPassword, 10);
  await query(`
    UPDATE sat.usuarios
    SET password_hash = $1,
        debe_cambiar_password = false,
        intentos_fallidos = 0,
        bloqueado_hasta = NULL
    WHERE id_usuarios = $2
  `, [nuevoHash, u.id_usuarios]);

  return { ok: true, message: "Contraseña actualizada exitosamente." };
}

export async function solicitarRecuperacion(email) {
  const emailRaw = String(email || "").trim().toLowerCase();

  if (!emailRaw) {
    const error = new Error("Por favor ingrese su correo institucional.");
    error.status = 400;
    throw error;
  }

  const { rows: usuarios } = await query(`
    SELECT id_usuarios, nombres, apellidos, correo_institucional, activo
    FROM sat.usuarios
    WHERE LOWER(correo_institucional) = $1 AND activo = true
    LIMIT 1
  `, [emailRaw]);

  if (usuarios.length === 0) {
    const error = new Error("No existe ninguna cuenta institucional activa asociada a ese correo electrónico.");
    error.status = 404;
    throw error;
  }

  const usuario = usuarios[0];
  const nombreCompleto = `${usuario.nombres} ${usuario.apellidos}`.trim();
  const codigoRecuperacion = Math.floor(100000 + Math.random() * 900000).toString();
  const tokenHash = crypto.createHash("sha256").update(codigoRecuperacion).digest("hex");
  const expiraMinutos = 15;

  await query(`
    UPDATE sat.tokens_recuperacion
    SET usado_en = NOW()
    WHERE id_usuarios = $1 AND usado_en IS NULL
  `, [usuario.id_usuarios]);

  await query(`
    INSERT INTO sat.tokens_recuperacion
      (id_tokens_recuperacion, id_usuarios, token_hash, expira_en, creado_en)
    VALUES
      (gen_random_uuid(), $1, $2, NOW() + INTERVAL '15 minutes', NOW())
  `, [usuario.id_usuarios, tokenHash]);

  const resEnvio = await enviarCorreoRecuperacionPassword({
    correo: usuario.correo_institucional,
    nombre: nombreCompleto,
    codigoRecuperacion,
    expiraMinutos
  });

  return {
    ok: true,
    message: `Hemos enviado un código de recuperación de 6 dígitos a su correo institucional (${usuario.correo_institucional}).`,
    email: usuario.correo_institucional,
    expiraMinutos,
    envioRealizado: resEnvio.envioRealizado
  };
}

export async function restablecerPassword(email, codigo, nuevoPassword) {
  const emailRaw = String(email || "").trim().toLowerCase();
  const codigoRaw = String(codigo || "").trim();

  if (!emailRaw || !codigoRaw || !nuevoPassword) {
    const error = new Error("Debe suministrar el correo, el código de recuperación y la nueva contraseña.");
    error.status = 400;
    throw error;
  }

  if (String(nuevoPassword).length < 8) {
    const error = new Error("La nueva contraseña debe tener al menos 8 caracteres.");
    error.status = 400;
    throw error;
  }

  const { rows: usuarios } = await query(`
    SELECT id_usuarios, nombres, apellidos, correo_institucional
    FROM sat.usuarios
    WHERE LOWER(correo_institucional) = $1 AND activo = true
    LIMIT 1
  `, [emailRaw]);

  if (usuarios.length === 0) {
    const error = new Error("Usuario no encontrado en el sistema.");
    error.status = 404;
    throw error;
  }

  const usuario = usuarios[0];
  const tokenHash = crypto.createHash("sha256").update(codigoRaw).digest("hex");

  const { rows: tokens } = await query(`
    SELECT id_tokens_recuperacion, expira_en, usado_en
    FROM sat.tokens_recuperacion
    WHERE id_usuarios = $1 AND token_hash = $2 AND usado_en IS NULL
    ORDER BY creado_en DESC
    LIMIT 1
  `, [usuario.id_usuarios, tokenHash]);

  if (tokens.length === 0) {
    const error = new Error("El código de recuperación ingresado es inválido o ya fue utilizado.");
    error.status = 400;
    throw error;
  }

  const tokenRow = tokens[0];
  if (new Date(tokenRow.expira_en).getTime() < Date.now()) {
    const error = new Error("El código de recuperación ha expirado. Por favor solicite uno nuevo.");
    error.status = 400;
    throw error;
  }

  const nuevoHash = await bcrypt.hash(nuevoPassword, 10);

  await query(`
    UPDATE sat.usuarios
    SET password_hash = $1,
        debe_cambiar_password = false,
        intentos_fallidos = 0,
        bloqueado_hasta = NULL,
        actualizado_en = NOW()
    WHERE id_usuarios = $2
  `, [nuevoHash, usuario.id_usuarios]);

  await query(`
    UPDATE sat.tokens_recuperacion
    SET usado_en = NOW()
    WHERE id_tokens_recuperacion = $1
  `, [tokenRow.id_tokens_recuperacion]);

  return {
    ok: true,
    message: "¡Contraseña actualizada exitosamente en la base de datos! Ya puede iniciar sesión con su nueva clave."
  };
}
