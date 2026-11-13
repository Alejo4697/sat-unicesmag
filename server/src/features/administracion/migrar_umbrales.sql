CREATE TABLE IF NOT EXISTS sat.umbrales_permanencia (
  id_umbrales_permanencia uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa character varying(30) NOT NULL,
  etapa_nombre character varying(50) NOT NULL,
  semestres_texto character varying(50) NOT NULL,
  semestre_min smallint NOT NULL,
  semestre_max smallint NOT NULL,
  nivel character varying(20) NOT NULL,
  puntaje_min numeric(6,2) NOT NULL,
  puntaje_max numeric(6,2) NOT NULL,
  orden smallint NOT NULL,
  color_hex character varying(7) NOT NULL,
  actualizado_en timestamp with time zone NOT NULL DEFAULT now()
);

TRUNCATE TABLE sat.umbrales_permanencia;

INSERT INTO sat.umbrales_permanencia (etapa, etapa_nombre, semestres_texto, semestre_min, semestre_max, nivel, puntaje_min, puntaje_max, orden, color_hex) VALUES
('INICIAL', 'Inicial', 'Semestres 1, 2, 3', 1, 3, 'BAJO', 23, 83, 1, '#10B981'),
('INICIAL', 'Inicial', 'Semestres 1, 2, 3', 1, 3, 'MEDIO', 84, 90, 2, '#F59E0B'),
('INICIAL', 'Inicial', 'Semestres 1, 2, 3', 1, 3, 'ALTO', 91, 112, 3, '#EF4444'),

('MEDIO', 'Medio', 'Semestres 4, 5, 6', 4, 6, 'BAJO', 23, 81, 1, '#10B981'),
('MEDIO', 'Medio', 'Semestres 4, 5, 6', 4, 6, 'MEDIO', 82, 87, 2, '#F59E0B'),
('MEDIO', 'Medio', 'Semestres 4, 5, 6', 4, 6, 'ALTO', 88, 112, 3, '#EF4444'),

('AVANZADO', 'Avanzado', 'Semestres 7, 8, 9', 7, 12, 'BAJO', 23, 72, 1, '#10B981'),
('AVANZADO', 'Avanzado', 'Semestres 7, 8, 9', 7, 12, 'MEDIO', 73, 87, 2, '#F59E0B'),
('AVANZADO', 'Avanzado', 'Semestres 7, 8, 9', 7, 12, 'ALTO', 88, 112, 3, '#EF4444');