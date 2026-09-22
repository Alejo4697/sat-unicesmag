-- ==========================================================================
--  SAT-UNICESMAG - codigo_externo en sat.matriculas (múltiples matrículas
--  por persona, ej. pregrado + posgrado simultáneos)
-- ==========================================================================
--  Antes, el código estudiantil vivía solo en sat.estudiantes.codigo_externo
--  (una fila = una persona = un código). Esta migración mueve la fuente de
--  verdad del código HACIA ADELANTE a sat.matriculas, para que una persona
--  (sat.estudiantes, numero_documento UNIQUE) pueda tener varias matrículas
--  con código propio cada una. sat.estudiantes.codigo_externo NO se toca:
--  sigue funcionando como código "legado" para filas sin matrícula.
--
--    1) Agrega sat.matriculas.codigo_externo + índice único.
--    2) Backfill: una matrícula por cada estudiante existente que ya tenga
--       código y programa (para no dejar sin ficha a nadie que dependa del
--       nuevo camino de búsqueda por matrícula).
--    3) Reemplaza uq_matricula_estudiante_periodo (que solo permitía UNA
--       matrícula por persona por periodo) por
--       uq_matricula_estudiante_periodo_programa (permite varias matrículas
--       simultáneas si son de programas distintos; sigue evitando una
--       matrícula duplicada exacta).
--
--  Idempotente y SEGURO de repetir:
--    - Columna/índice: IF NOT EXISTS.
--    - Backfill: WHERE NOT EXISTS (no depende de qué constraint esté activa
--      en ese momento, a diferencia de un ON CONFLICT ON CONSTRAINT).
--    - Constraint: DROP CONSTRAINT IF EXISTS + bloque DO con IF NOT EXISTS
--      (Postgres no soporta ADD CONSTRAINT IF NOT EXISTS de forma nativa).
--
--  Ejecutar:  npm run db:matriculas-codigo   (desde server/)
-- ==========================================================================

BEGIN;

-- 1) Columna nueva + índice único (múltiples NULL permitidos)
ALTER TABLE sat.matriculas ADD COLUMN IF NOT EXISTS codigo_externo varchar;

CREATE UNIQUE INDEX IF NOT EXISTS uq_matriculas_codigo_externo
  ON sat.matriculas (codigo_externo);

-- 2) Backfill: una matrícula por cada estudiante existente que ya tenga
--    código y programa, usando el periodo activo vigente.
--    Los estudiantes sin codigo_externo/programa quedan fuera a propósito
--    (siguen resolviéndose por sat.estudiantes.codigo_externo, el legado).
INSERT INTO sat.matriculas
  (id_estudiantes, id_programas_academicos, id_periodos_academicos,
   semestre, estado, codigo_externo)
SELECT
  e.id_estudiantes,
  e.id_programas_academicos,
  (SELECT id_periodos_academicos FROM sat.periodos_academicos WHERE activo = true LIMIT 1),
  e.semestre_actual,
  'ACTIVO',
  e.codigo_externo
FROM sat.estudiantes e
WHERE e.codigo_externo IS NOT NULL
  AND e.id_programas_academicos IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sat.matriculas m
    WHERE m.id_estudiantes = e.id_estudiantes
      AND m.codigo_externo = e.codigo_externo
  );

-- 3) uq_matricula_estudiante_periodo solo permitía UNA matrícula por
--    persona por periodo - bloquea el caso real que motiva este cambio
--    (dos programas simultáneos, mismo periodo). Se reemplaza por una
--    versión que agrega el programa: sigue evitando una matrícula
--    duplicada exacta, pero permite varias si son de programas distintos.
ALTER TABLE sat.matriculas DROP CONSTRAINT IF EXISTS uq_matricula_estudiante_periodo;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_matricula_estudiante_periodo_programa'
  ) THEN
    ALTER TABLE sat.matriculas
      ADD CONSTRAINT uq_matricula_estudiante_periodo_programa
      UNIQUE (id_estudiantes, id_periodos_academicos, id_programas_academicos);
  END IF;
END $$;

COMMIT;

-- Verificación (correr a mano en el Query Tool):
-- SELECT e.numero_documento, e.nombres, m.codigo_externo, p.nombre AS programa, pa.nombre AS periodo
-- FROM sat.matriculas m
-- JOIN sat.estudiantes e ON e.id_estudiantes = m.id_estudiantes
-- LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos = m.id_programas_academicos
-- LEFT JOIN sat.periodos_academicos pa ON pa.id_periodos_academicos = m.id_periodos_academicos
-- ORDER BY e.numero_documento;
