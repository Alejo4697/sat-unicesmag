BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'sat.participantes_vec'::regclass
      AND conname = 'participantes_vec_id_tipo_unique'
  ) THEN
    ALTER TABLE sat.participantes_vec
      ADD CONSTRAINT participantes_vec_id_tipo_unique
      UNIQUE (id_participantes_vec, tipo_participante);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sat.externos (
  id_participantes_vec uuid PRIMARY KEY,
  tipo_participante varchar(20) NOT NULL DEFAULT 'EXTERNO'
    CHECK (tipo_participante = 'EXTERNO'),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT externos_participante_tipo_fkey
    FOREIGN KEY (id_participantes_vec, tipo_participante)
    REFERENCES sat.participantes_vec(id_participantes_vec, tipo_participante)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sat.colaboradores (
  id_participantes_vec uuid PRIMARY KEY,
  tipo_participante varchar(20) NOT NULL DEFAULT 'COLABORADOR'
    CHECK (tipo_participante = 'COLABORADOR'),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT colaboradores_participante_tipo_fkey
    FOREIGN KEY (id_participantes_vec, tipo_participante)
    REFERENCES sat.participantes_vec(id_participantes_vec, tipo_participante)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sat.egresados (
  id_participantes_vec uuid PRIMARY KEY,
  tipo_participante varchar(20) NOT NULL DEFAULT 'EGRESADO'
    CHECK (tipo_participante = 'EGRESADO'),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT egresados_participante_tipo_fkey
    FOREIGN KEY (id_participantes_vec, tipo_participante)
    REFERENCES sat.participantes_vec(id_participantes_vec, tipo_participante)
    ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION sat.validar_exclusividad_externo_vec()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.id_personas::text, 0));

  IF EXISTS (
    SELECT 1
    FROM sat.participantes_vec existente
    WHERE existente.id_personas = NEW.id_personas
      AND existente.id_participantes_vec IS DISTINCT FROM NEW.id_participantes_vec
      AND (
        NEW.tipo_participante = 'EXTERNO'
        OR existente.tipo_participante = 'EXTERNO'
      )
  ) THEN
    RAISE EXCEPTION 'Una persona con rol EXTERNO no puede tener otros roles, y una persona con otros roles no puede ser EXTERNO.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS participantes_vec_externo_exclusivo
  ON sat.participantes_vec;

CREATE TRIGGER participantes_vec_externo_exclusivo
BEFORE INSERT OR UPDATE
ON sat.participantes_vec
FOR EACH ROW
EXECUTE FUNCTION sat.validar_exclusividad_externo_vec();

CREATE OR REPLACE FUNCTION sat.sincronizar_tablas_roles_vec()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (
    TG_OP = 'UPDATE'
    AND (
      OLD.id_personas IS DISTINCT FROM NEW.id_personas
      OR OLD.tipo_participante IS DISTINCT FROM NEW.tipo_participante
    )
  ) THEN
    DELETE FROM sat.externos WHERE id_participantes_vec = OLD.id_participantes_vec;
    DELETE FROM sat.colaboradores WHERE id_participantes_vec = OLD.id_participantes_vec;
    DELETE FROM sat.egresados WHERE id_participantes_vec = OLD.id_participantes_vec;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    IF NEW.tipo_participante = 'EXTERNO' THEN
      INSERT INTO sat.externos (id_participantes_vec) VALUES (NEW.id_participantes_vec)
      ON CONFLICT (id_participantes_vec) DO NOTHING;
    ELSIF NEW.tipo_participante = 'COLABORADOR' THEN
      INSERT INTO sat.colaboradores (id_participantes_vec) VALUES (NEW.id_participantes_vec)
      ON CONFLICT (id_participantes_vec) DO NOTHING;
    ELSIF NEW.tipo_participante = 'EGRESADO' THEN
      INSERT INTO sat.egresados (id_participantes_vec) VALUES (NEW.id_participantes_vec)
      ON CONFLICT (id_participantes_vec) DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS participantes_vec_sincronizar_roles
  ON sat.participantes_vec;

CREATE TRIGGER participantes_vec_sincronizar_roles
AFTER INSERT OR UPDATE OR DELETE
ON sat.participantes_vec
FOR EACH ROW
EXECUTE FUNCTION sat.sincronizar_tablas_roles_vec();

INSERT INTO sat.externos (id_participantes_vec)
SELECT id_participantes_vec
FROM sat.participantes_vec
WHERE tipo_participante = 'EXTERNO'
ON CONFLICT (id_participantes_vec) DO NOTHING;

INSERT INTO sat.colaboradores (id_participantes_vec)
SELECT id_participantes_vec
FROM sat.participantes_vec
WHERE tipo_participante = 'COLABORADOR'
ON CONFLICT (id_participantes_vec) DO NOTHING;

INSERT INTO sat.egresados (id_participantes_vec)
SELECT id_participantes_vec
FROM sat.participantes_vec
WHERE tipo_participante = 'EGRESADO'
ON CONFLICT (id_participantes_vec) DO NOTHING;

COMMIT;
