-- ============================================================================
-- SAT-UNICESMAG: MIGRACIÓN DE CATÁLOGOS Y PARÁMETROS DE UUID A INT (SERIAL)
-- Transforma los identificadores de 15 tablas catálogo fijas/maestras
-- de UUID de 128 bits a INT autoincremental estándar relacional.
-- ============================================================================

BEGIN;

-- 0. Guardar y recrear temporalmente las vistas que referencian catálogos
DROP VIEW IF EXISTS sat.vw_actividades_vec_estudiantes CASCADE;
DROP VIEW IF EXISTS sat.vw_ficha_360_estudiante CASCADE;
DROP VIEW IF EXISTS sat.vw_tablero_permanencia CASCADE;

-- ----------------------------------------------------------------------------
-- 1. sat.sedes
-- ----------------------------------------------------------------------------
ALTER TABLE sat.sedes ADD COLUMN IF NOT EXISTS id_sedes_int SERIAL;
ALTER TABLE sat.estudiantes ADD COLUMN IF NOT EXISTS id_sedes_int INT;
ALTER TABLE sat.programas_academicos ADD COLUMN IF NOT EXISTS id_sedes_int INT;
ALTER TABLE sat.usuarios ADD COLUMN IF NOT EXISTS id_sedes_int INT;

UPDATE sat.estudiantes e SET id_sedes_int = s.id_sedes_int FROM sat.sedes s WHERE s.id_sedes = e.id_sedes;
UPDATE sat.programas_academicos p SET id_sedes_int = s.id_sedes_int FROM sat.sedes s WHERE s.id_sedes = p.id_sedes;
UPDATE sat.usuarios u SET id_sedes_int = s.id_sedes_int FROM sat.sedes s WHERE s.id_sedes = u.id_sedes;

ALTER TABLE sat.estudiantes DROP CONSTRAINT IF EXISTS estudiantes_id_sedes_fkey;
ALTER TABLE sat.programas_academicos DROP CONSTRAINT IF EXISTS programas_academicos_id_sedes_fkey;
ALTER TABLE sat.usuarios DROP CONSTRAINT IF EXISTS usuarios_id_sedes_fkey;

ALTER TABLE sat.sedes DROP CONSTRAINT IF EXISTS sedes_pkey CASCADE;
ALTER TABLE sat.sedes DROP COLUMN IF EXISTS id_sedes;
ALTER TABLE sat.sedes RENAME COLUMN id_sedes_int TO id_sedes;
ALTER TABLE sat.sedes ADD PRIMARY KEY (id_sedes);

ALTER TABLE sat.estudiantes DROP COLUMN IF EXISTS id_sedes;
ALTER TABLE sat.estudiantes RENAME COLUMN id_sedes_int TO id_sedes;
ALTER TABLE sat.estudiantes ADD CONSTRAINT estudiantes_id_sedes_fkey FOREIGN KEY (id_sedes) REFERENCES sat.sedes(id_sedes);

ALTER TABLE sat.programas_academicos DROP COLUMN IF EXISTS id_sedes;
ALTER TABLE sat.programas_academicos RENAME COLUMN id_sedes_int TO id_sedes;
ALTER TABLE sat.programas_academicos ADD CONSTRAINT programas_academicos_id_sedes_fkey FOREIGN KEY (id_sedes) REFERENCES sat.sedes(id_sedes);

ALTER TABLE sat.usuarios DROP COLUMN IF EXISTS id_sedes;
ALTER TABLE sat.usuarios RENAME COLUMN id_sedes_int TO id_sedes;
ALTER TABLE sat.usuarios ADD CONSTRAINT usuarios_id_sedes_fkey FOREIGN KEY (id_sedes) REFERENCES sat.sedes(id_sedes);

-- ----------------------------------------------------------------------------
-- 2. sat.facultades
-- ----------------------------------------------------------------------------
ALTER TABLE sat.facultades ADD COLUMN IF NOT EXISTS id_facultades_int SERIAL;
ALTER TABLE sat.programas_academicos ADD COLUMN IF NOT EXISTS id_facultades_int INT;

UPDATE sat.programas_academicos p SET id_facultades_int = f.id_facultades_int FROM sat.facultades f WHERE f.id_facultades = p.id_facultades;

ALTER TABLE sat.programas_academicos DROP CONSTRAINT IF EXISTS programas_academicos_id_facultades_fkey;

ALTER TABLE sat.facultades DROP CONSTRAINT IF EXISTS facultades_pkey CASCADE;
ALTER TABLE sat.facultades DROP COLUMN IF EXISTS id_facultades;
ALTER TABLE sat.facultades RENAME COLUMN id_facultades_int TO id_facultades;
ALTER TABLE sat.facultades ADD PRIMARY KEY (id_facultades);

ALTER TABLE sat.programas_academicos DROP COLUMN IF EXISTS id_facultades;
ALTER TABLE sat.programas_academicos RENAME COLUMN id_facultades_int TO id_facultades;
ALTER TABLE sat.programas_academicos ADD CONSTRAINT programas_academicos_id_facultades_fkey FOREIGN KEY (id_facultades) REFERENCES sat.facultades(id_facultades);

-- ----------------------------------------------------------------------------
-- 3. sat.estados_remision
-- ----------------------------------------------------------------------------
ALTER TABLE sat.estados_remision ADD COLUMN IF NOT EXISTS id_estados_remision_int SERIAL;
ALTER TABLE sat.remisiones ADD COLUMN IF NOT EXISTS id_estados_remision_int INT;
ALTER TABLE sat.remisiones_historial_estados ADD COLUMN IF NOT EXISTS id_estados_remision_anterior_int INT;
ALTER TABLE sat.remisiones_historial_estados ADD COLUMN IF NOT EXISTS id_estados_remision_nuevo_int INT;

UPDATE sat.remisiones r SET id_estados_remision_int = er.id_estados_remision_int FROM sat.estados_remision er WHERE er.id_estados_remision = r.id_estados_remision;
UPDATE sat.remisiones_historial_estados rh SET id_estados_remision_anterior_int = er.id_estados_remision_int FROM sat.estados_remision er WHERE er.id_estados_remision = rh.id_estados_remision_anterior;
UPDATE sat.remisiones_historial_estados rh SET id_estados_remision_nuevo_int = er.id_estados_remision_int FROM sat.estados_remision er WHERE er.id_estados_remision = rh.id_estados_remision_nuevo;

ALTER TABLE sat.remisiones DROP CONSTRAINT IF EXISTS remisiones_id_estados_remision_fkey;
ALTER TABLE sat.remisiones_historial_estados DROP CONSTRAINT IF EXISTS remisiones_historial_estados_id_estados_remision_anterior_fkey;
ALTER TABLE sat.remisiones_historial_estados DROP CONSTRAINT IF EXISTS remisiones_historial_estados_id_estados_remision_nuevo_fkey;

ALTER TABLE sat.estados_remision DROP CONSTRAINT IF EXISTS estados_remision_pkey CASCADE;
ALTER TABLE sat.estados_remision DROP COLUMN IF EXISTS id_estados_remision;
ALTER TABLE sat.estados_remision RENAME COLUMN id_estados_remision_int TO id_estados_remision;
ALTER TABLE sat.estados_remision ADD PRIMARY KEY (id_estados_remision);

ALTER TABLE sat.remisiones DROP COLUMN IF EXISTS id_estados_remision;
ALTER TABLE sat.remisiones RENAME COLUMN id_estados_remision_int TO id_estados_remision;
ALTER TABLE sat.remisiones ADD CONSTRAINT remisiones_id_estados_remision_fkey FOREIGN KEY (id_estados_remision) REFERENCES sat.estados_remision(id_estados_remision);

ALTER TABLE sat.remisiones_historial_estados DROP COLUMN IF EXISTS id_estados_remision_anterior;
ALTER TABLE sat.remisiones_historial_estados RENAME COLUMN id_estados_remision_anterior_int TO id_estados_remision_anterior;
ALTER TABLE sat.remisiones_historial_estados ADD CONSTRAINT remisiones_historial_estados_id_estados_remision_anterior_fkey FOREIGN KEY (id_estados_remision_anterior) REFERENCES sat.estados_remision(id_estados_remision);

ALTER TABLE sat.remisiones_historial_estados DROP COLUMN IF EXISTS id_estados_remision_nuevo;
ALTER TABLE sat.remisiones_historial_estados RENAME COLUMN id_estados_remision_nuevo_int TO id_estados_remision_nuevo;
ALTER TABLE sat.remisiones_historial_estados ADD CONSTRAINT remisiones_historial_estados_id_estados_remision_nuevo_fkey FOREIGN KEY (id_estados_remision_nuevo) REFERENCES sat.estados_remision(id_estados_remision);

-- ----------------------------------------------------------------------------
-- 4. sat.tipos_intervencion
-- ----------------------------------------------------------------------------
ALTER TABLE sat.tipos_intervencion ADD COLUMN IF NOT EXISTS id_tipos_intervencion_int SERIAL;
ALTER TABLE sat.intervenciones ADD COLUMN IF NOT EXISTS id_tipos_intervencion_int INT;

UPDATE sat.intervenciones i SET id_tipos_intervencion_int = ti.id_tipos_intervencion_int FROM sat.tipos_intervencion ti WHERE ti.id_tipos_intervencion = i.id_tipos_intervencion;

ALTER TABLE sat.intervenciones DROP CONSTRAINT IF EXISTS intervenciones_id_tipos_intervencion_fkey;

ALTER TABLE sat.tipos_intervencion DROP CONSTRAINT IF EXISTS tipos_intervencion_pkey CASCADE;
ALTER TABLE sat.tipos_intervencion DROP COLUMN IF EXISTS id_tipos_intervencion;
ALTER TABLE sat.tipos_intervencion RENAME COLUMN id_tipos_intervencion_int TO id_tipos_intervencion;
ALTER TABLE sat.tipos_intervencion ADD PRIMARY KEY (id_tipos_intervencion);

ALTER TABLE sat.intervenciones DROP COLUMN IF EXISTS id_tipos_intervencion;
ALTER TABLE sat.intervenciones RENAME COLUMN id_tipos_intervencion_int TO id_tipos_intervencion;
ALTER TABLE sat.intervenciones ADD CONSTRAINT intervenciones_id_tipos_intervencion_fkey FOREIGN KEY (id_tipos_intervencion) REFERENCES sat.tipos_intervencion(id_tipos_intervencion);

-- ----------------------------------------------------------------------------
-- 5. sat.estados_caso
-- ----------------------------------------------------------------------------
ALTER TABLE sat.estados_caso ADD COLUMN IF NOT EXISTS id_estados_caso_int SERIAL;
ALTER TABLE sat.casos ADD COLUMN IF NOT EXISTS id_estados_caso_int INT;

UPDATE sat.casos c SET id_estados_caso_int = ec.id_estados_caso_int FROM sat.estados_caso ec WHERE ec.id_estados_caso = c.id_estados_caso;

ALTER TABLE sat.casos DROP CONSTRAINT IF EXISTS casos_id_estados_caso_fkey;

ALTER TABLE sat.estados_caso DROP CONSTRAINT IF EXISTS estados_caso_pkey CASCADE;
ALTER TABLE sat.estados_caso DROP COLUMN IF EXISTS id_estados_caso;
ALTER TABLE sat.estados_caso RENAME COLUMN id_estados_caso_int TO id_estados_caso;
ALTER TABLE sat.estados_caso ADD PRIMARY KEY (id_estados_caso);

ALTER TABLE sat.casos DROP COLUMN IF EXISTS id_estados_caso;
ALTER TABLE sat.casos RENAME COLUMN id_estados_caso_int TO id_estados_caso;
ALTER TABLE sat.casos ADD CONSTRAINT casos_id_estados_caso_fkey FOREIGN KEY (id_estados_caso) REFERENCES sat.estados_caso(id_estados_caso);

-- ----------------------------------------------------------------------------
-- 6. sat.tipos_alerta
-- ----------------------------------------------------------------------------
ALTER TABLE sat.tipos_alerta ADD COLUMN IF NOT EXISTS id_tipos_alerta_int SERIAL;
ALTER TABLE sat.alertas ADD COLUMN IF NOT EXISTS id_tipos_alerta_int INT;
ALTER TABLE sat.criterios_riesgo_automatico ADD COLUMN IF NOT EXISTS id_tipos_alerta_int INT;

UPDATE sat.alertas a SET id_tipos_alerta_int = ta.id_tipos_alerta_int FROM sat.tipos_alerta ta WHERE ta.id_tipos_alerta = a.id_tipos_alerta;
UPDATE sat.criterios_riesgo_automatico cra SET id_tipos_alerta_int = ta.id_tipos_alerta_int FROM sat.tipos_alerta ta WHERE ta.id_tipos_alerta = cra.id_tipos_alerta;

ALTER TABLE sat.alertas DROP CONSTRAINT IF EXISTS alertas_id_tipos_alerta_fkey;
ALTER TABLE sat.criterios_riesgo_automatico DROP CONSTRAINT IF EXISTS criterios_riesgo_automatico_id_tipos_alerta_fkey;

ALTER TABLE sat.tipos_alerta DROP CONSTRAINT IF EXISTS tipos_alerta_pkey CASCADE;
ALTER TABLE sat.tipos_alerta DROP COLUMN IF EXISTS id_tipos_alerta;
ALTER TABLE sat.tipos_alerta RENAME COLUMN id_tipos_alerta_int TO id_tipos_alerta;
ALTER TABLE sat.tipos_alerta ADD PRIMARY KEY (id_tipos_alerta);

ALTER TABLE sat.alertas DROP COLUMN IF EXISTS id_tipos_alerta;
ALTER TABLE sat.alertas RENAME COLUMN id_tipos_alerta_int TO id_tipos_alerta;
ALTER TABLE sat.alertas ADD CONSTRAINT alertas_id_tipos_alerta_fkey FOREIGN KEY (id_tipos_alerta) REFERENCES sat.tipos_alerta(id_tipos_alerta);

ALTER TABLE sat.criterios_riesgo_automatico DROP COLUMN IF EXISTS id_tipos_alerta;
ALTER TABLE sat.criterios_riesgo_automatico RENAME COLUMN id_tipos_alerta_int TO id_tipos_alerta;
ALTER TABLE sat.criterios_riesgo_automatico ADD CONSTRAINT criterios_riesgo_automatico_id_tipos_alerta_fkey FOREIGN KEY (id_tipos_alerta) REFERENCES sat.tipos_alerta(id_tipos_alerta);

-- ----------------------------------------------------------------------------
-- 7. sat.roles, sat.modulos, sat.permisos
-- ----------------------------------------------------------------------------
-- Modulos
ALTER TABLE sat.modulos ADD COLUMN IF NOT EXISTS id_modulos_int SERIAL;
ALTER TABLE sat.permisos ADD COLUMN IF NOT EXISTS id_modulos_int INT;
UPDATE sat.permisos p SET id_modulos_int = m.id_modulos_int FROM sat.modulos m WHERE m.id_modulos = p.id_modulos;

ALTER TABLE sat.permisos DROP CONSTRAINT IF EXISTS permisos_id_modulos_fkey;
ALTER TABLE sat.modulos DROP CONSTRAINT IF EXISTS modulos_pkey CASCADE;
ALTER TABLE sat.modulos DROP COLUMN IF EXISTS id_modulos;
ALTER TABLE sat.modulos RENAME COLUMN id_modulos_int TO id_modulos;
ALTER TABLE sat.modulos ADD PRIMARY KEY (id_modulos);

ALTER TABLE sat.permisos DROP COLUMN IF EXISTS id_modulos;
ALTER TABLE sat.permisos RENAME COLUMN id_modulos_int TO id_modulos;
ALTER TABLE sat.permisos ADD CONSTRAINT permisos_id_modulos_fkey FOREIGN KEY (id_modulos) REFERENCES sat.modulos(id_modulos);

-- Permisos
ALTER TABLE sat.permisos ADD COLUMN IF NOT EXISTS id_permisos_int SERIAL;
ALTER TABLE sat.roles_permisos ADD COLUMN IF NOT EXISTS id_permisos_int INT;
UPDATE sat.roles_permisos rp SET id_permisos_int = p.id_permisos_int FROM sat.permisos p WHERE p.id_permisos = rp.id_permisos;

ALTER TABLE sat.roles_permisos DROP CONSTRAINT IF EXISTS roles_permisos_id_permisos_fkey;
ALTER TABLE sat.permisos DROP CONSTRAINT IF EXISTS permisos_pkey CASCADE;
ALTER TABLE sat.permisos DROP COLUMN IF EXISTS id_permisos;
ALTER TABLE sat.permisos RENAME COLUMN id_permisos_int TO id_permisos;
ALTER TABLE sat.permisos ADD PRIMARY KEY (id_permisos);

ALTER TABLE sat.roles_permisos DROP COLUMN IF EXISTS id_permisos;
ALTER TABLE sat.roles_permisos RENAME COLUMN id_permisos_int TO id_permisos;

-- Roles
ALTER TABLE sat.roles ADD COLUMN IF NOT EXISTS id_roles_int SERIAL;
ALTER TABLE sat.usuarios_roles ADD COLUMN IF NOT EXISTS id_roles_int INT;
ALTER TABLE sat.roles_permisos ADD COLUMN IF NOT EXISTS id_roles_int INT;

UPDATE sat.usuarios_roles ur SET id_roles_int = r.id_roles_int FROM sat.roles r WHERE r.id_roles = ur.id_roles;
UPDATE sat.roles_permisos rp SET id_roles_int = r.id_roles_int FROM sat.roles r WHERE r.id_roles = rp.id_roles;

ALTER TABLE sat.usuarios_roles DROP CONSTRAINT IF EXISTS usuarios_roles_id_roles_fkey;
ALTER TABLE sat.roles_permisos DROP CONSTRAINT IF EXISTS roles_permisos_id_roles_fkey;
ALTER TABLE sat.roles DROP CONSTRAINT IF EXISTS roles_pkey CASCADE;
ALTER TABLE sat.roles DROP COLUMN IF EXISTS id_roles;
ALTER TABLE sat.roles RENAME COLUMN id_roles_int TO id_roles;
ALTER TABLE sat.roles ADD PRIMARY KEY (id_roles);

ALTER TABLE sat.usuarios_roles DROP COLUMN IF EXISTS id_roles;
ALTER TABLE sat.usuarios_roles RENAME COLUMN id_roles_int TO id_roles;
ALTER TABLE sat.usuarios_roles ADD CONSTRAINT usuarios_roles_id_roles_fkey FOREIGN KEY (id_roles) REFERENCES sat.roles(id_roles);

ALTER TABLE sat.roles_permisos DROP COLUMN IF EXISTS id_roles;
ALTER TABLE sat.roles_permisos RENAME COLUMN id_roles_int TO id_roles;
ALTER TABLE sat.roles_permisos ADD CONSTRAINT roles_permisos_id_roles_fkey FOREIGN KEY (id_roles) REFERENCES sat.roles(id_roles);
ALTER TABLE sat.roles_permisos ADD CONSTRAINT roles_permisos_id_permisos_fkey FOREIGN KEY (id_permisos) REFERENCES sat.permisos(id_permisos);
ALTER TABLE sat.roles_permisos DROP CONSTRAINT IF EXISTS roles_permisos_pkey;
ALTER TABLE sat.roles_permisos ADD PRIMARY KEY (id_roles, id_permisos);

-- ----------------------------------------------------------------------------
-- 8. sat.lineas_accion, sat.componentes_bienestar, sat.programas_bienestar
-- ----------------------------------------------------------------------------
-- Lineas de accion
ALTER TABLE sat.lineas_accion ADD COLUMN IF NOT EXISTS id_lineas_accion_int SERIAL;
ALTER TABLE sat.componentes_bienestar ADD COLUMN IF NOT EXISTS id_lineas_accion_int INT;
UPDATE sat.componentes_bienestar cb SET id_lineas_accion_int = la.id_lineas_accion_int FROM sat.lineas_accion la WHERE la.id_lineas_accion = cb.id_lineas_accion;

ALTER TABLE sat.componentes_bienestar DROP CONSTRAINT IF EXISTS componentes_bienestar_id_lineas_accion_fkey;
ALTER TABLE sat.lineas_accion DROP CONSTRAINT IF EXISTS lineas_accion_pkey CASCADE;
ALTER TABLE sat.lineas_accion DROP COLUMN IF EXISTS id_lineas_accion;
ALTER TABLE sat.lineas_accion RENAME COLUMN id_lineas_accion_int TO id_lineas_accion;
ALTER TABLE sat.lineas_accion ADD PRIMARY KEY (id_lineas_accion);

ALTER TABLE sat.componentes_bienestar DROP COLUMN IF EXISTS id_lineas_accion;
ALTER TABLE sat.componentes_bienestar RENAME COLUMN id_lineas_accion_int TO id_lineas_accion;
ALTER TABLE sat.componentes_bienestar ADD CONSTRAINT componentes_bienestar_id_lineas_accion_fkey FOREIGN KEY (id_lineas_accion) REFERENCES sat.lineas_accion(id_lineas_accion);

-- Componentes bienestar
ALTER TABLE sat.componentes_bienestar ADD COLUMN IF NOT EXISTS id_componentes_bienestar_int SERIAL;
ALTER TABLE sat.programas_bienestar ADD COLUMN IF NOT EXISTS id_componentes_bienestar_int INT;
UPDATE sat.programas_bienestar pb SET id_componentes_bienestar_int = cb.id_componentes_bienestar_int FROM sat.componentes_bienestar cb WHERE cb.id_componentes_bienestar = pb.id_componentes_bienestar;

ALTER TABLE sat.programas_bienestar DROP CONSTRAINT IF EXISTS programas_bienestar_id_componentes_bienestar_fkey;
ALTER TABLE sat.componentes_bienestar DROP CONSTRAINT IF EXISTS componentes_bienestar_pkey CASCADE;
ALTER TABLE sat.componentes_bienestar DROP COLUMN IF EXISTS id_componentes_bienestar;
ALTER TABLE sat.componentes_bienestar RENAME COLUMN id_componentes_bienestar_int TO id_componentes_bienestar;
ALTER TABLE sat.componentes_bienestar ADD PRIMARY KEY (id_componentes_bienestar);

ALTER TABLE sat.programas_bienestar DROP COLUMN IF EXISTS id_componentes_bienestar;
ALTER TABLE sat.programas_bienestar RENAME COLUMN id_componentes_bienestar_int TO id_componentes_bienestar;
ALTER TABLE sat.programas_bienestar ADD CONSTRAINT programas_bienestar_id_componentes_bienestar_fkey FOREIGN KEY (id_componentes_bienestar) REFERENCES sat.componentes_bienestar(id_componentes_bienestar);

-- Programas bienestar
ALTER TABLE sat.programas_bienestar ADD COLUMN IF NOT EXISTS id_programas_bienestar_int SERIAL;
ALTER TABLE sat.actividades_vec ADD COLUMN IF NOT EXISTS id_programas_bienestar_int INT;
ALTER TABLE sat.rutas_remision ADD COLUMN IF NOT EXISTS id_programas_bienestar_int INT;

UPDATE sat.actividades_vec av SET id_programas_bienestar_int = pb.id_programas_bienestar_int FROM sat.programas_bienestar pb WHERE pb.id_programas_bienestar = av.id_programas_bienestar;
UPDATE sat.rutas_remision rr SET id_programas_bienestar_int = pb.id_programas_bienestar_int FROM sat.programas_bienestar pb WHERE pb.id_programas_bienestar = rr.id_programas_bienestar;

ALTER TABLE sat.actividades_vec DROP CONSTRAINT IF EXISTS actividades_vec_id_programas_bienestar_fkey;
ALTER TABLE sat.rutas_remision DROP CONSTRAINT IF EXISTS rutas_remision_id_programas_bienestar_fkey;

ALTER TABLE sat.programas_bienestar DROP CONSTRAINT IF EXISTS programas_bienestar_pkey CASCADE;
ALTER TABLE sat.programas_bienestar DROP COLUMN IF EXISTS id_programas_bienestar;
ALTER TABLE sat.programas_bienestar RENAME COLUMN id_programas_bienestar_int TO id_programas_bienestar;
ALTER TABLE sat.programas_bienestar ADD PRIMARY KEY (id_programas_bienestar);

ALTER TABLE sat.actividades_vec DROP COLUMN IF EXISTS id_programas_bienestar;
ALTER TABLE sat.actividades_vec RENAME COLUMN id_programas_bienestar_int TO id_programas_bienestar;
ALTER TABLE sat.actividades_vec ADD CONSTRAINT actividades_vec_id_programas_bienestar_fkey FOREIGN KEY (id_programas_bienestar) REFERENCES sat.programas_bienestar(id_programas_bienestar);

ALTER TABLE sat.rutas_remision DROP COLUMN IF EXISTS id_programas_bienestar;
ALTER TABLE sat.rutas_remision RENAME COLUMN id_programas_bienestar_int TO id_programas_bienestar;
ALTER TABLE sat.rutas_remision ADD CONSTRAINT rutas_remision_id_programas_bienestar_fkey FOREIGN KEY (id_programas_bienestar) REFERENCES sat.programas_bienestar(id_programas_bienestar);

-- ----------------------------------------------------------------------------
-- 9. sat.tipos_apoyo
-- ----------------------------------------------------------------------------
ALTER TABLE sat.tipos_apoyo ADD COLUMN IF NOT EXISTS id_tipos_apoyo_int SERIAL;
ALTER TABLE sat.actividades_vec_modalidades ADD COLUMN IF NOT EXISTS id_tipos_apoyo_int INT;
ALTER TABLE sat.actividades_vec_participantes ADD COLUMN IF NOT EXISTS id_tipos_apoyo_int INT;
ALTER TABLE sat.apoyos_actividades_vec ADD COLUMN IF NOT EXISTS id_tipos_apoyo_int INT;
ALTER TABLE sat.rutas_remision ADD COLUMN IF NOT EXISTS id_tipos_apoyo_int INT;

UPDATE sat.actividades_vec_modalidades avm SET id_tipos_apoyo_int = ta.id_tipos_apoyo_int FROM sat.tipos_apoyo ta WHERE ta.id_tipos_apoyo = avm.id_tipos_apoyo;
UPDATE sat.actividades_vec_participantes avp SET id_tipos_apoyo_int = ta.id_tipos_apoyo_int FROM sat.tipos_apoyo ta WHERE ta.id_tipos_apoyo = avp.id_tipos_apoyo;
UPDATE sat.apoyos_actividades_vec aav SET id_tipos_apoyo_int = ta.id_tipos_apoyo_int FROM sat.tipos_apoyo ta WHERE ta.id_tipos_apoyo = aav.id_tipos_apoyo;
UPDATE sat.rutas_remision rr SET id_tipos_apoyo_int = ta.id_tipos_apoyo_int FROM sat.tipos_apoyo ta WHERE ta.id_tipos_apoyo = rr.id_tipos_apoyo;

ALTER TABLE sat.actividades_vec_modalidades DROP CONSTRAINT IF EXISTS actividades_vec_modalidades_id_tipos_apoyo_fkey;
ALTER TABLE sat.actividades_vec_participantes DROP CONSTRAINT IF EXISTS actividades_vec_participantes_id_tipos_apoyo_fkey;
ALTER TABLE sat.apoyos_actividades_vec DROP CONSTRAINT IF EXISTS apoyos_actividades_vec_id_tipos_apoyo_fkey;
ALTER TABLE sat.rutas_remision DROP CONSTRAINT IF EXISTS rutas_remision_id_tipos_apoyo_fkey;

ALTER TABLE sat.tipos_apoyo DROP CONSTRAINT IF EXISTS tipos_apoyo_pkey CASCADE;
ALTER TABLE sat.tipos_apoyo DROP COLUMN IF EXISTS id_tipos_apoyo;
ALTER TABLE sat.tipos_apoyo RENAME COLUMN id_tipos_apoyo_int TO id_tipos_apoyo;
ALTER TABLE sat.tipos_apoyo ADD PRIMARY KEY (id_tipos_apoyo);

ALTER TABLE sat.actividades_vec_modalidades DROP COLUMN IF EXISTS id_tipos_apoyo;
ALTER TABLE sat.actividades_vec_modalidades RENAME COLUMN id_tipos_apoyo_int TO id_tipos_apoyo;
ALTER TABLE sat.actividades_vec_modalidades ADD CONSTRAINT actividades_vec_modalidades_id_tipos_apoyo_fkey FOREIGN KEY (id_tipos_apoyo) REFERENCES sat.tipos_apoyo(id_tipos_apoyo);

ALTER TABLE sat.actividades_vec_participantes DROP COLUMN IF EXISTS id_tipos_apoyo;
ALTER TABLE sat.actividades_vec_participantes RENAME COLUMN id_tipos_apoyo_int TO id_tipos_apoyo;
ALTER TABLE sat.actividades_vec_participantes ADD CONSTRAINT actividades_vec_participantes_id_tipos_apoyo_fkey FOREIGN KEY (id_tipos_apoyo) REFERENCES sat.tipos_apoyo(id_tipos_apoyo);

ALTER TABLE sat.apoyos_actividades_vec DROP COLUMN IF EXISTS id_tipos_apoyo;
ALTER TABLE sat.apoyos_actividades_vec RENAME COLUMN id_tipos_apoyo_int TO id_tipos_apoyo;
ALTER TABLE sat.apoyos_actividades_vec ADD CONSTRAINT apoyos_actividades_vec_id_tipos_apoyo_fkey FOREIGN KEY (id_tipos_apoyo) REFERENCES sat.tipos_apoyo(id_tipos_apoyo);

ALTER TABLE sat.rutas_remision DROP COLUMN IF EXISTS id_tipos_apoyo;
ALTER TABLE sat.rutas_remision RENAME COLUMN id_tipos_apoyo_int TO id_tipos_apoyo;
ALTER TABLE sat.rutas_remision ADD CONSTRAINT rutas_remision_id_tipos_apoyo_fkey FOREIGN KEY (id_tipos_apoyo) REFERENCES sat.tipos_apoyo(id_tipos_apoyo);

-- ----------------------------------------------------------------------------
-- 10. sat.rangos_riesgo
-- ----------------------------------------------------------------------------
ALTER TABLE sat.rangos_riesgo ADD COLUMN IF NOT EXISTS id_rangos_riesgo_int SERIAL;
ALTER TABLE sat.alertas ADD COLUMN IF NOT EXISTS id_rangos_riesgo_int INT;
ALTER TABLE sat.calificaciones_riesgo ADD COLUMN IF NOT EXISTS id_rangos_riesgo_int INT;
ALTER TABLE sat.casos ADD COLUMN IF NOT EXISTS id_rangos_riesgo_int INT;

UPDATE sat.alertas a SET id_rangos_riesgo_int = rr.id_rangos_riesgo_int FROM sat.rangos_riesgo rr WHERE rr.id_rangos_riesgo = a.id_rangos_riesgo;
UPDATE sat.calificaciones_riesgo cr SET id_rangos_riesgo_int = rr.id_rangos_riesgo_int FROM sat.rangos_riesgo rr WHERE rr.id_rangos_riesgo = cr.id_rangos_riesgo;
UPDATE sat.casos c SET id_rangos_riesgo_int = rr.id_rangos_riesgo_int FROM sat.rangos_riesgo rr WHERE rr.id_rangos_riesgo = c.id_rangos_riesgo;

ALTER TABLE sat.alertas DROP CONSTRAINT IF EXISTS alertas_id_rangos_riesgo_fkey;
ALTER TABLE sat.calificaciones_riesgo DROP CONSTRAINT IF EXISTS calificaciones_riesgo_id_rangos_riesgo_fkey;
ALTER TABLE sat.casos DROP CONSTRAINT IF EXISTS casos_id_rangos_riesgo_fkey;

ALTER TABLE sat.rangos_riesgo DROP CONSTRAINT IF EXISTS rangos_riesgo_pkey CASCADE;
ALTER TABLE sat.rangos_riesgo DROP COLUMN IF EXISTS id_rangos_riesgo;
ALTER TABLE sat.rangos_riesgo RENAME COLUMN id_rangos_riesgo_int TO id_rangos_riesgo;
ALTER TABLE sat.rangos_riesgo ADD PRIMARY KEY (id_rangos_riesgo);

ALTER TABLE sat.alertas DROP COLUMN IF EXISTS id_rangos_riesgo;
ALTER TABLE sat.alertas RENAME COLUMN id_rangos_riesgo_int TO id_rangos_riesgo;
ALTER TABLE sat.alertas ADD CONSTRAINT alertas_id_rangos_riesgo_fkey FOREIGN KEY (id_rangos_riesgo) REFERENCES sat.rangos_riesgo(id_rangos_riesgo);

ALTER TABLE sat.calificaciones_riesgo DROP COLUMN IF EXISTS id_rangos_riesgo;
ALTER TABLE sat.calificaciones_riesgo RENAME COLUMN id_rangos_riesgo_int TO id_rangos_riesgo;
ALTER TABLE sat.calificaciones_riesgo ADD CONSTRAINT calificaciones_riesgo_id_rangos_riesgo_fkey FOREIGN KEY (id_rangos_riesgo) REFERENCES sat.rangos_riesgo(id_rangos_riesgo);

ALTER TABLE sat.casos DROP COLUMN IF EXISTS id_rangos_riesgo;
ALTER TABLE sat.casos RENAME COLUMN id_rangos_riesgo_int TO id_rangos_riesgo;
ALTER TABLE sat.casos ADD CONSTRAINT casos_id_rangos_riesgo_fkey FOREIGN KEY (id_rangos_riesgo) REFERENCES sat.rangos_riesgo(id_rangos_riesgo);

-- ----------------------------------------------------------------------------
-- 11. sat.periodos_academicos
-- ----------------------------------------------------------------------------
ALTER TABLE sat.periodos_academicos ADD COLUMN IF NOT EXISTS id_periodos_academicos_int SERIAL;
ALTER TABLE sat.matriculas ADD COLUMN IF NOT EXISTS id_periodos_academicos_int INT;
ALTER TABLE sat.grupos_asignatura ADD COLUMN IF NOT EXISTS id_periodos_academicos_int INT;
ALTER TABLE sat.actividades_vec ADD COLUMN IF NOT EXISTS id_periodos_academicos_int INT;
ALTER TABLE sat.respuestas_caracterizacion ADD COLUMN IF NOT EXISTS id_periodos_academicos_int INT;
ALTER TABLE sat.calificaciones_riesgo ADD COLUMN IF NOT EXISTS id_periodos_academicos_int INT;
ALTER TABLE sat.apoyos_financieros ADD COLUMN IF NOT EXISTS id_periodos_academicos_int INT;
ALTER TABLE sat.exportaciones_snies ADD COLUMN IF NOT EXISTS id_periodos_academicos_int INT;

UPDATE sat.matriculas m SET id_periodos_academicos_int = pa.id_periodos_academicos_int FROM sat.periodos_academicos pa WHERE pa.id_periodos_academicos = m.id_periodos_academicos;
UPDATE sat.grupos_asignatura ga SET id_periodos_academicos_int = pa.id_periodos_academicos_int FROM sat.periodos_academicos pa WHERE pa.id_periodos_academicos = ga.id_periodos_academicos;
UPDATE sat.actividades_vec av SET id_periodos_academicos_int = pa.id_periodos_academicos_int FROM sat.periodos_academicos pa WHERE pa.id_periodos_academicos = av.id_periodos_academicos;
UPDATE sat.respuestas_caracterizacion rc SET id_periodos_academicos_int = pa.id_periodos_academicos_int FROM sat.periodos_academicos pa WHERE pa.id_periodos_academicos = rc.id_periodos_academicos;
UPDATE sat.calificaciones_riesgo cr SET id_periodos_academicos_int = pa.id_periodos_academicos_int FROM sat.periodos_academicos pa WHERE pa.id_periodos_academicos = cr.id_periodos_academicos;
UPDATE sat.apoyos_financieros af SET id_periodos_academicos_int = pa.id_periodos_academicos_int FROM sat.periodos_academicos pa WHERE pa.id_periodos_academicos = af.id_periodos_academicos;
UPDATE sat.exportaciones_snies es SET id_periodos_academicos_int = pa.id_periodos_academicos_int FROM sat.periodos_academicos pa WHERE pa.id_periodos_academicos = es.id_periodos_academicos;

ALTER TABLE sat.matriculas DROP CONSTRAINT IF EXISTS matriculas_id_periodos_academicos_fkey;
ALTER TABLE sat.grupos_asignatura DROP CONSTRAINT IF EXISTS grupos_asignatura_id_periodos_academicos_fkey;
ALTER TABLE sat.actividades_vec DROP CONSTRAINT IF EXISTS actividades_vec_id_periodos_academicos_fkey;
ALTER TABLE sat.respuestas_caracterizacion DROP CONSTRAINT IF EXISTS respuestas_caracterizacion_id_periodos_academicos_fkey;
ALTER TABLE sat.calificaciones_riesgo DROP CONSTRAINT IF EXISTS calificaciones_riesgo_id_periodos_academicos_fkey;
ALTER TABLE sat.apoyos_financieros DROP CONSTRAINT IF EXISTS apoyos_financieros_id_periodos_academicos_fkey;
ALTER TABLE sat.exportaciones_snies DROP CONSTRAINT IF EXISTS exportaciones_snies_id_periodos_academicos_fkey;

ALTER TABLE sat.periodos_academicos DROP CONSTRAINT IF EXISTS periodos_academicos_pkey CASCADE;
ALTER TABLE sat.periodos_academicos DROP COLUMN IF EXISTS id_periodos_academicos;
ALTER TABLE sat.periodos_academicos RENAME COLUMN id_periodos_academicos_int TO id_periodos_academicos;
ALTER TABLE sat.periodos_academicos ADD PRIMARY KEY (id_periodos_academicos);

ALTER TABLE sat.matriculas DROP COLUMN IF EXISTS id_periodos_academicos;
ALTER TABLE sat.matriculas RENAME COLUMN id_periodos_academicos_int TO id_periodos_academicos;
ALTER TABLE sat.matriculas ADD CONSTRAINT matriculas_id_periodos_academicos_fkey FOREIGN KEY (id_periodos_academicos) REFERENCES sat.periodos_academicos(id_periodos_academicos);

ALTER TABLE sat.grupos_asignatura DROP COLUMN IF EXISTS id_periodos_academicos;
ALTER TABLE sat.grupos_asignatura RENAME COLUMN id_periodos_academicos_int TO id_periodos_academicos;
ALTER TABLE sat.grupos_asignatura ADD CONSTRAINT grupos_asignatura_id_periodos_academicos_fkey FOREIGN KEY (id_periodos_academicos) REFERENCES sat.periodos_academicos(id_periodos_academicos);

ALTER TABLE sat.actividades_vec DROP COLUMN IF EXISTS id_periodos_academicos;
ALTER TABLE sat.actividades_vec RENAME COLUMN id_periodos_academicos_int TO id_periodos_academicos;
ALTER TABLE sat.actividades_vec ADD CONSTRAINT actividades_vec_id_periodos_academicos_fkey FOREIGN KEY (id_periodos_academicos) REFERENCES sat.periodos_academicos(id_periodos_academicos);

ALTER TABLE sat.respuestas_caracterizacion DROP COLUMN IF EXISTS id_periodos_academicos;
ALTER TABLE sat.respuestas_caracterizacion RENAME COLUMN id_periodos_academicos_int TO id_periodos_academicos;
ALTER TABLE sat.respuestas_caracterizacion ADD CONSTRAINT respuestas_caracterizacion_id_periodos_academicos_fkey FOREIGN KEY (id_periodos_academicos) REFERENCES sat.periodos_academicos(id_periodos_academicos);

ALTER TABLE sat.calificaciones_riesgo DROP COLUMN IF EXISTS id_periodos_academicos;
ALTER TABLE sat.calificaciones_riesgo RENAME COLUMN id_periodos_academicos_int TO id_periodos_academicos;
ALTER TABLE sat.calificaciones_riesgo ADD CONSTRAINT calificaciones_riesgo_id_periodos_academicos_fkey FOREIGN KEY (id_periodos_academicos) REFERENCES sat.periodos_academicos(id_periodos_academicos);

ALTER TABLE sat.apoyos_financieros DROP COLUMN IF EXISTS id_periodos_academicos;
ALTER TABLE sat.apoyos_financieros RENAME COLUMN id_periodos_academicos_int TO id_periodos_academicos;
ALTER TABLE sat.apoyos_financieros ADD CONSTRAINT apoyos_financieros_id_periodos_academicos_fkey FOREIGN KEY (id_periodos_academicos) REFERENCES sat.periodos_academicos(id_periodos_academicos);

ALTER TABLE sat.exportaciones_snies DROP COLUMN IF EXISTS id_periodos_academicos;
ALTER TABLE sat.exportaciones_snies RENAME COLUMN id_periodos_academicos_int TO id_periodos_academicos;
ALTER TABLE sat.exportaciones_snies ADD CONSTRAINT exportaciones_snies_id_periodos_academicos_fkey FOREIGN KEY (id_periodos_academicos) REFERENCES sat.periodos_academicos(id_periodos_academicos);

-- ----------------------------------------------------------------------------
-- 12. Recrear las Vistas Institucionales
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW sat.vw_actividades_vec_estudiantes AS
 SELECT pa.nombre AS periodo,
    COALESCE(p.numero_identificacion, e.numero_documento) AS identificacion,
    e.tipo_documento AS tipo_identificacion,
    COALESCE(m.codigo_externo, e.codigo_externo) AS codigo,
    COALESCE(NULLIF(btrim(concat_ws(' ', p.primer_apellido, p.segundo_apellido, p.primer_nombre, p.segundo_nombre)), ''), NULLIF(btrim(concat_ws(' ', e.apellidos, e.nombres)), '')) AS apellidos_y_nombres,
    prog_acad.nombre AS programa_academico_pregrado,
    pv.programa_posgrado_dependencia AS programa_academico_posgrado,
    COALESCE(m.semestre, e.semestre_actual, pv.semestre) AS semestre,
    COALESCE(e.genero, p.genero) AS genero,
    m.jornada,
    COALESCE(e.correo_institucional, e.correo_personal, p.correo_institucional, p.correo_electronico) AS correo,
    COALESCE(e.telefono, e.telefono_fijo, p.celular, p.telefono) AS contacto,
    pv.tipo_participante AS tipo_usuario_participante,
        CASE
            WHEN COALESCE(e.fecha_nacimiento, p.fecha_nacimiento) IS NULL THEN NULL::integer
            ELSE date_part('year', age(CURRENT_DATE, COALESCE(e.fecha_nacimiento, p.fecha_nacimiento)))::integer
        END AS edad,
    COALESCE(p.id_grupo_etnico::text, e.etnia, pv.etnia, 'Sin especificar') AS etnia,
    COALESCE(p.id_lugar_nacimiento::text, pv.lugar_nacimiento, 'Sin especificar') AS lugar_nacimiento,
    COALESCE(p.direccion, e.direccion, 'Sin especificar') AS lugar_residencia,
    COALESCE(p.id_lugar_radicacion::text, pv.municipio, 'Pasto') AS municipio,
    COALESCE(p.id_discapacidad::text, pv.discapacidad, 'Ninguna') AS condicion_discapacidad,
    COALESCE(p.victima_conflicto, pv.conflicto_armado, 'No') AS victima_conflicto_armado,
    e.id_estudiantes,
    pv.id_participantes_vec,
    pa.id_periodos_academicos,
    m.id_matriculas,
    e.id_personas
   FROM sat.estudiantes e
   LEFT JOIN sat.personas p ON p.id = e.id_personas
   LEFT JOIN sat.participantes_vec pv ON pv.id_personas = e.id_personas AND pv.tipo_participante = 'ESTUDIANTE'
   LEFT JOIN sat.matriculas m ON m.id_estudiantes = e.id_estudiantes
   LEFT JOIN sat.periodos_academicos pa ON pa.id_periodos_academicos = m.id_periodos_academicos
   LEFT JOIN sat.programas_academicos prog_acad ON prog_acad.id_programas_academicos = COALESCE(m.id_programas_academicos, e.id_programas_academicos);

CREATE OR REPLACE VIEW sat.vw_ficha_360_estudiante AS
 SELECT e.id_estudiantes,
    e.numero_documento,
    e.nombres,
    e.apellidos,
    e.foto_url,
    p.nombre AS programa,
    s.nombre AS sede,
    e.semestre_actual,
    cr.puntaje_global AS puntaje_riesgo_vigente,
    cr.puntaje_academico,
    cr.puntaje_socioeconomico,
    cr.puntaje_institucional,
    cr.puntaje_individual,
    rr.nombre AS rango_riesgo_vigente,
    rr.color_hex,
    ( SELECT count(*) AS count
           FROM sat.alertas a
          WHERE ((a.id_estudiantes = e.id_estudiantes) AND ((a.estado)::text = 'ACTIVA'::text))) AS alertas_activas,
    ( SELECT count(*) AS count
           FROM sat.casos c
          WHERE ((c.id_estudiantes = e.id_estudiantes) AND (c.cerrado_en IS NULL))) AS casos_abiertos
   FROM ((((sat.estudiantes e
     LEFT JOIN sat.sedes s ON ((s.id_sedes = e.id_sedes)))
     LEFT JOIN sat.programas_academicos p ON ((p.id_programas_academicos = e.id_programas_academicos)))
     LEFT JOIN LATERAL ( SELECT cr_1.id_calificaciones_riesgo,
            cr_1.id_estudiantes,
            cr_1.id_respuestas_caracterizacion,
            cr_1.id_periodos_academicos,
            cr_1.tipo_origen,
            cr_1.puntaje_global,
            cr_1.puntaje_academico,
            cr_1.puntaje_socioeconomico,
            cr_1.puntaje_institucional,
            cr_1.puntaje_individual,
            cr_1.id_rangos_riesgo,
            cr_1.factores,
            cr_1.vigente,
            cr_1.calculado_en
           FROM sat.calificaciones_riesgo cr_1
          WHERE ((cr_1.id_estudiantes = e.id_estudiantes) AND (cr_1.vigente = true))
          ORDER BY cr_1.calculado_en DESC
         LIMIT 1) cr ON (true))
     LEFT JOIN sat.rangos_riesgo rr ON ((rr.id_rangos_riesgo = cr.id_rangos_riesgo)));

CREATE OR REPLACE VIEW sat.vw_tablero_permanencia AS
 SELECT p.nombre AS programa,
    per.nombre AS periodo,
    rr.nombre AS rango_riesgo,
    count(DISTINCT c.id_estudiantes) AS total_estudiantes,
    count(*) FILTER (WHERE c.cerrado_en IS NOT NULL) AS casos_atendidos,
    count(*) FILTER (WHERE c.cerrado_en IS NULL) AS casos_pendientes
   FROM sat.casos c
   JOIN sat.estudiantes e ON e.id_estudiantes = c.id_estudiantes
   LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos = e.id_programas_academicos
   LEFT JOIN LATERAL (
     SELECT m.id_periodos_academicos
     FROM sat.matriculas m
     WHERE m.id_estudiantes = e.id_estudiantes
     ORDER BY m.id_matriculas DESC
     LIMIT 1
   ) ult_mat ON true
   LEFT JOIN sat.periodos_academicos per ON per.id_periodos_academicos = ult_mat.id_periodos_academicos
   LEFT JOIN sat.rangos_riesgo rr ON rr.id_rangos_riesgo = c.id_rangos_riesgo
  GROUP BY p.nombre, per.nombre, rr.nombre;

COMMIT;
