-- ==========================================================================
--  SAT-UNICESMAG - Matriz de Bienestar para remisiones (schema `sat`)
-- ==========================================================================
--  Origen: "Sistema de bienestar para intervenciones y remisiones.xlsx".
--  Cada fila útil del Excel es una RUTA DE REMISIÓN:
--
--    Línea de acción  ->  Componente  ->  Programa  ->  Proyecto/servicio (ruta)
--                                                        + Tipo de apoyo (1..5)
--                                                        + Oficina (sat.dependencias)
--                                                        + Profesional responsable
--
--  Al remitir, el usuario elige Tipo de apoyo + Proyecto y el backend deduce
--  la oficina (areaDestino) y el profesional (profesionalAsignado).
--
--  Filas del Excel que NO se cargan: 23-25 ("no incluir") y 34 (solo trae
--  el componente, duplicado de Enfermería). Las filas con datos incompletos
--  llevan la suposición en `observaciones` -> validar con Bienestar.
--
--  Idempotente.  Ejecutar:  npm run db:matriz  (desde server/)
--  Requiere PostgreSQL 13+ (gen_random_uuid()).
-- ==========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS sat.tipos_apoyo (
  id_tipos_apoyo  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero          smallint     NOT NULL UNIQUE,
  nombre          varchar(120) NOT NULL,
  activo          boolean      NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS sat.lineas_accion (
  id_lineas_accion uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           varchar(150) NOT NULL UNIQUE,
  activo           boolean      NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS sat.componentes_bienestar (
  id_componentes_bienestar uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                   varchar(150) NOT NULL UNIQUE,
  id_lineas_accion         uuid NOT NULL REFERENCES sat.lineas_accion (id_lineas_accion),
  activo                   boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS sat.programas_bienestar (
  id_programas_bienestar   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                   varchar(200) NOT NULL UNIQUE,
  id_componentes_bienestar uuid NOT NULL REFERENCES sat.componentes_bienestar (id_componentes_bienestar),
  activo                   boolean NOT NULL DEFAULT true
);

-- La ruta (columna "Proyecto" del Excel). Tipo de apoyo, oficina y
-- profesional viven aquí y no en el programa porque el Excel los define
-- por fila. id_usuarios_responsable queda listo para cuando los
-- profesionales existan en sat.usuarios (hoy el Excel solo trae el nombre).
CREATE TABLE IF NOT EXISTS sat.rutas_remision (
  id_rutas_remision       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                  varchar(200) NOT NULL,
  id_programas_bienestar  uuid NOT NULL REFERENCES sat.programas_bienestar (id_programas_bienestar),
  id_tipos_apoyo          uuid REFERENCES sat.tipos_apoyo (id_tipos_apoyo),
  id_dependencias         uuid REFERENCES sat.dependencias (id_dependencias),
  profesional_responsable varchar(150),
  id_usuarios_responsable uuid REFERENCES sat.usuarios (id_usuarios),
  observaciones           text,
  activo                  boolean NOT NULL DEFAULT true,
  UNIQUE (nombre, id_programas_bienestar)
);


-- 1) Tipos de apoyo
INSERT INTO sat.tipos_apoyo (numero, nombre) VALUES
  (1, 'Beneficios económicos'),
  (2, 'Apoyos académicos'),
  (3, 'Apoyo psicosocial'),
  (4, 'Atención clínica en psicología'),
  (5, 'Atención en salud física')
ON CONFLICT (numero) DO NOTHING;

-- 2) Líneas de acción
INSERT INTO sat.lineas_accion (nombre) VALUES
  ('Pastoral franciscano - capuchina'),
  ('Acompañamiento'),
  ('Desarrollo Humano y Salud'),
  ('Deporte Recreación y Actividad Física'),
  ('Paz y Convivencia')
ON CONFLICT (nombre) DO NOTHING;

-- 3) Componentes
INSERT INTO sat.componentes_bienestar (nombre, id_lineas_accion)
SELECT v.nombre, l.id_lineas_accion
FROM (VALUES
  ('Espiritualidad y formación franciscana', 'Pastoral franciscano - capuchina'),
  ('Inclusión y diversidad', 'Acompañamiento'),
  ('Compromiso con el núcleo familiar', 'Acompañamiento'),
  ('Gestión de apoyos financieros', 'Acompañamiento'),
  ('Permanencia y graduación exitosa', 'Acompañamiento'),
  ('Proyección a la educación superior', 'Acompañamiento'),
  ('Atención promoción de la salud y prevención de la enfermedad', 'Desarrollo Humano y Salud'),
  ('Atención promoción y prevención en salud mental', 'Desarrollo Humano y Salud'),
  ('Orientación general (Deporte y Cultura)', 'Deporte Recreación y Actividad Física'),
  ('Cultura pacificadora', 'Paz y Convivencia')
) AS v(nombre, linea)
JOIN sat.lineas_accion l ON l.nombre = v.linea
ON CONFLICT (nombre) DO NOTHING;

-- 4) Programas
INSERT INTO sat.programas_bienestar (nombre, id_componentes_bienestar)
SELECT v.nombre, c.id_componentes_bienestar
FROM (VALUES
  ('Orientación espiritual', 'Espiritualidad y formación franciscana'),
  ('Acompañamiento a estudiantes con discapacidad', 'Inclusión y diversidad'),
  ('Universidad para familias', 'Compromiso con el núcleo familiar'),
  ('Plan Padrino', 'Gestión de apoyos financieros'),
  ('Becas, incentivos, beneficios y subsidios', 'Gestión de apoyos financieros'),
  ('Descuentos', 'Gestión de apoyos financieros'),
  ('Poliza estudiantil', 'Gestión de apoyos financieros'),
  ('Apoyos adicionales', 'Gestión de apoyos financieros'),
  ('Docentes acompañantes', 'Permanencia y graduación exitosa'),
  ('Tutorías académicas', 'Permanencia y graduación exitosa'),
  ('Primer paso+', 'Permanencia y graduación exitosa'),
  ('Centro de desarrollo y aprendizaje María Goretti', 'Permanencia y graduación exitosa'),
  ('Orientación general para la permanencia', 'Permanencia y graduación exitosa'),
  ('Orientación vocacional', 'Proyección a la educación superior'),
  ('Programa de atención en salud', 'Atención promoción de la salud y prevención de la enfermedad'),
  ('Enfermería Campus San Damían', 'Atención promoción de la salud y prevención de la enfermedad'),
  ('Programa de promoción y prevención en la salud mental - Consejería', 'Atención promoción y prevención en salud mental'),
  ('Programa atención integral para la salud mental CLINICA', 'Atención promoción y prevención en salud mental'),
  ('Orientación general (Deporte y Cultura)', 'Orientación general (Deporte y Cultura)'),
  ('Programa bienestar interior', 'Cultura pacificadora'),
  ('Acompañamiento a grupos poblacionales', 'Inclusión y diversidad')
) AS v(nombre, componente)
JOIN sat.componentes_bienestar c ON c.nombre = v.componente
ON CONFLICT (nombre) DO NOTHING;

-- 5) Oficinas que no existían en sat.dependencias
INSERT INTO sat.dependencias (nombre, tipo, es_confidencialidad_especial, activo) VALUES
  ('Deporte y Cultura', 'AREA_ATENCION', false, true)
ON CONFLICT (nombre) DO NOTHING;

-- 6) Rutas de remisión (una por fila útil del Excel)
--    LEFT JOIN a dependencias/tipos: si un nombre no cuadra, la fila entra con NULL
--    y el SELECT de verificación del final lo muestra.
INSERT INTO sat.rutas_remision
  (nombre, id_programas_bienestar, id_tipos_apoyo, id_dependencias, profesional_responsable, activo, observaciones)
SELECT v.nombre, p.id_programas_bienestar, t.id_tipos_apoyo, d.id_dependencias, v.profesional, v.activo, v.obs
FROM (VALUES
  -- fila 2 del Excel
  ('Acompañamiento espiritual', 'Orientación espiritual', 3, 'Pastoral Universitaria', 'Danny Rodriguez', true, NULL),
  -- fila 3 del Excel
  ('REDA Red apoyo para la diversidad en el aula', 'Acompañamiento a estudiantes con discapacidad', 2, 'Inclusión', 'Sofia Martinez', true, NULL),
  -- fila 4 del Excel
  ('UNIFAMILIAS', 'Universidad para familias', 3, 'Trabajo Social', 'Rossy Bolaños', true, 'Excel marca "(revisar matriz)"'),
  -- fila 5 del Excel
  ('Matriculas', 'Plan Padrino', 1, 'Trabajo Social', 'Rossy Bolaños', true, NULL),
  -- fila 6 del Excel
  ('Tiquetera', 'Plan Padrino', 1, 'Trabajo Social', 'Rossy Bolaños', true, NULL),
  -- fila 7 del Excel
  ('Otros apoyos', 'Plan Padrino', 1, 'Trabajo Social', 'Rossy Bolaños', true, NULL),
  -- fila 8 del Excel
  ('Becas', 'Becas, incentivos, beneficios y subsidios', 1, 'Trabajo Social', 'Rossy Bolaños', true, NULL),
  -- fila 9 del Excel
  ('Incentivos', 'Becas, incentivos, beneficios y subsidios', 1, 'Trabajo Social', 'Rossy Bolaños', true, NULL),
  -- fila 10 del Excel
  ('Beneficios', 'Becas, incentivos, beneficios y subsidios', 1, 'Trabajo Social', 'Rossy Bolaños', true, NULL),
  -- fila 11 del Excel
  ('Subsidios', 'Becas, incentivos, beneficios y subsidios', 1, 'Trabajo Social', 'Rossy Bolaños', true, NULL),
  -- fila 12 del Excel
  ('Descuentos', 'Descuentos', 1, 'Trabajo Social', 'Rossy Bolaños', true, NULL),
  -- fila 13 del Excel
  ('Poliza estudiantil', 'Poliza estudiantil', 1, 'Trabajo Social', 'Rossy Bolaños', true, NULL),
  -- fila 14 del Excel
  ('Donación', 'Apoyos adicionales', 1, 'Trabajo Social', 'Rossy Bolaños', true, NULL),
  -- fila 15 del Excel
  ('Apoyos excepcionales', 'Apoyos adicionales', 1, 'Trabajo Social', 'Rossy Bolaños', true, NULL),
  -- fila 16 del Excel
  ('Descuento especial por rectoría', 'Apoyos adicionales', 1, 'Trabajo Social', 'Rossy Bolaños', true, NULL),
  -- fila 17 del Excel
  ('Otros descuentos', 'Apoyos adicionales', 1, 'Trabajo Social', 'Rossy Bolaños', true, NULL),
  -- fila 18 del Excel
  ('Acompañamiento continuo', 'Docentes acompañantes', 3, 'Acompañamiento', 'Jose Luis/Docentes acompañantes', true, NULL),
  -- fila 19 del Excel
  ('Acompañamiento ocasional', 'Docentes acompañantes', 3, 'Acompañamiento', 'Jose Luis/Docentes acompañantes', true, NULL),
  -- fila 20 del Excel
  ('Tutorías académicas - departamento', 'Tutorías académicas', 2, 'Tutoría Académica Docente', 'Docentes tutores', true, 'oficina vacía en Excel; se asume Tutoría Académica Docente'),
  -- fila 21 del Excel
  ('Nivelación primer paso + - departamento', 'Primer paso+', 2, 'Tutoría Académica Docente', 'Docentes tutores', true, 'oficina vacía en Excel; se asume Tutoría Académica Docente'),
  -- fila 22 del Excel
  ('Centro de desarrollo y aprendizaje', 'Centro de desarrollo y aprendizaje María Goretti', 2, 'Acompañamiento', 'Jose Luis Moreno', true, NULL),
  -- fila 26 del Excel
  ('Permanencia y graduacion exitosa', 'Orientación general para la permanencia', 3, 'Trabajo Social', NULL, true, 'Excel lista varias oficinas (Trabajo social / Inclusión y diversidad / VEC, coordinación); se asume Trabajo Social'),
  -- fila 27 del Excel
  ('Orientación vocacional', 'Orientación vocacional', 2, 'Acompañamiento', 'Jose Luis Moreno', true, NULL),
  -- fila 28 del Excel
  ('Atención, promoción y prevencion de la salud fisica', 'Programa de atención en salud', 5, 'Área de Salud María Goretti', 'Diana Montenegro', true, NULL),
  -- fila 29 del Excel
  ('Atención, promoción y prevencion de la salud fisica', 'Enfermería Campus San Damían', 5, 'Enfermería San Damián', 'Yesenia Zuñiga', true, NULL),
  -- fila 30 del Excel
  ('Centro de escucha', 'Programa de promoción y prevención en la salud mental - Consejería', 3, 'Unidad de Servicios Psicológicos (USP)', 'Yesenia Zuñiga', true, NULL),
  -- fila 31 del Excel
  ('Atención clinica en psicología USP - USMG', 'Programa atención integral para la salud mental CLINICA', 4, 'Unidad de Servicios Psicológicos (USP)', NULL, true, 'oficina vacía en Excel (USP - USMG); se asume USP'),
  -- fila 32 del Excel
  ('Orientación general (Deporte y Cultura)', 'Orientación general (Deporte y Cultura)', 3, 'Deporte y Cultura', 'German', true, NULL),
  -- fila 33 del Excel
  ('Consejería', 'Programa bienestar interior', 3, 'Paz y Convivencia', 'Javier Rodriguez', true, NULL),
  -- fila 35 del Excel
  ('UNIDIVERSIDAD', 'Acompañamiento a grupos poblacionales', NULL::smallint, 'Diversidad', NULL, false, 'Excel sin tipo de apoyo ni profesional: queda INACTIVA hasta completarla')
) AS v(nombre, programa, apoyo, oficina, profesional, activo, obs)
JOIN sat.programas_bienestar p ON p.nombre = v.programa
LEFT JOIN sat.tipos_apoyo t ON t.numero = v.apoyo
LEFT JOIN sat.dependencias d ON d.nombre = v.oficina AND d.tipo = 'AREA_ATENCION'
ON CONFLICT (nombre, id_programas_bienestar) DO NOTHING;

COMMIT;

-- Verificación (correr a mano): rutas activas sin oficina o sin tipo de apoyo
-- SELECT nombre FROM sat.rutas_remision
--  WHERE activo AND (id_dependencias IS NULL OR id_tipos_apoyo IS NULL);
