-- ============================================================================
-- SAT-UNICESMAG (DataBasePractica): DDL PARA DIAGRAMA ENTIDAD-RELACION EN DRAW.IO
-- Compatible con: Draw.io / diagrams.net -> Insertar (Insert) > Avanzado (Advanced) > SQL...
-- ============================================================================

/* INSTRUCCIONES DE USO EN DRAW.IO:
   1. Abre Draw.io (o https://app.diagrams.net).
   2. En la barra superior haz clic en: "+" o "Organizar" (Arrange) > "Insertar" (Insert) > "Avanzado" (Advanced) > "SQL...".
   3. Copia y pega el código de este archivo (puedes pegar todo el archivo o modulo por modulo).
   4. Haz clic en "Insertar" (Insert).
   5. ¡Listo! Draw.io generará automaticamente todas las tablas con sus columnas, llaves primarias y lineas de relacion (FK).
*/

-- ============================================================================
-- MÓDULO 1: SEGURIDAD, AUTENTICACIÓN Y ROLES (RBAC)
-- Descripcion: Gestión de usuarios institucionales, roles, permisos y sesiones seguras
-- ============================================================================

CREATE TABLE usuarios (
    id_usuarios uuid DEFAULT gen_random_uuid() NOT NULL,
    correo_institucional character varying(150) NOT NULL,
    password_hash character varying(255) NOT NULL,
    tipo_documento character varying(20) DEFAULT 'CC' NOT NULL,
    numero_documento character varying(30) NOT NULL,
    nombres character varying(150) NOT NULL,
    apellidos character varying(150) NOT NULL,
    telefono character varying(30),
    foto_url text,
    id_sedes uuid,
    activo boolean DEFAULT true NOT NULL,
    debe_cambiar_password boolean DEFAULT false NOT NULL,
    ultimo_login_en timestamp with time zone,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    eliminado_en timestamp with time zone,
    id_personas bigint,
    cargo character varying,
    intentos_fallidos integer DEFAULT 0 NOT NULL,
    bloqueado_hasta timestamp with time zone,
    PRIMARY KEY (id_usuarios),
    FOREIGN KEY (id_personas) REFERENCES personas(id),
    FOREIGN KEY (id_sedes) REFERENCES sedes(id_sedes)
);

CREATE TABLE roles (
    id_roles uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion text,
    es_sistema boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_roles)
);

CREATE TABLE permisos (
    id_permisos uuid DEFAULT gen_random_uuid() NOT NULL,
    id_modulos uuid NOT NULL,
    codigo character varying(100) NOT NULL,
    nombre character varying(150) NOT NULL,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    PRIMARY KEY (id_permisos),
    FOREIGN KEY (id_modulos) REFERENCES modulos(id_modulos)
);

CREATE TABLE usuarios_roles (
    id_usuarios uuid NOT NULL,
    id_roles uuid NOT NULL,
    asignado_en timestamp with time zone DEFAULT now() NOT NULL,
    id_usuarios_asignador uuid,
    PRIMARY KEY (id_usuarios, id_roles),
    FOREIGN KEY (id_roles) REFERENCES roles(id_roles),
    FOREIGN KEY (id_usuarios_asignador) REFERENCES usuarios(id_usuarios),
    FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios)
);

CREATE TABLE roles_permisos (
    id_roles uuid NOT NULL,
    id_permisos uuid NOT NULL,
    PRIMARY KEY (id_roles, id_permisos),
    FOREIGN KEY (id_permisos) REFERENCES permisos(id_permisos),
    FOREIGN KEY (id_roles) REFERENCES roles(id_roles)
);

CREATE TABLE modulos (
    id_modulos uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo character varying(60) NOT NULL,
    nombre character varying(120) NOT NULL,
    icono character varying(60),
    orden integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    PRIMARY KEY (id_modulos)
);

CREATE TABLE sesiones (
    id_sesiones uuid DEFAULT gen_random_uuid() NOT NULL,
    id_usuarios uuid,
    token_sesion character varying(255) NOT NULL,
    ip_origen inet,
    user_agent text,
    iniciada_en timestamp with time zone DEFAULT now() NOT NULL,
    expirada_en timestamp with time zone,
    cerrada_en timestamp with time zone,
    id_estudiantes uuid,
    ultimo_acceso_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_sesiones),
    FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios)
);

CREATE TABLE tokens_recuperacion (
    id_tokens_recuperacion uuid DEFAULT gen_random_uuid() NOT NULL,
    id_usuarios uuid NOT NULL,
    token_hash character varying(255) NOT NULL,
    expira_en timestamp with time zone NOT NULL,
    usado_en timestamp with time zone,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_tokens_recuperacion),
    FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios)
);

CREATE TABLE otp_codigos (
    id_otp uuid DEFAULT gen_random_uuid() NOT NULL,
    id_estudiantes uuid NOT NULL,
    codigo character varying(10) NOT NULL,
    correo_destino character varying(255) NOT NULL,
    expira_en timestamp with time zone NOT NULL,
    intentos_fallidos integer DEFAULT 0,
    max_intentos integer DEFAULT 5,
    usado boolean DEFAULT false,
    usado_en timestamp with time zone,
    ip_origen character varying(45),
    creado_en timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id_otp),
    FOREIGN KEY (id_estudiantes) REFERENCES estudiantes(id_estudiantes)
);

-- ============================================================================
-- MÓDULO 2: ESTRUCTURA INSTITUCIONAL Y PROGRAMAS ACADÉMICOS
-- Descripcion: Sedes, facultades, dependencias y programas académicos de la UNICESMAG
-- ============================================================================

CREATE TABLE sedes (
    id_sedes uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo character varying(20) NOT NULL,
    nombre character varying(100) NOT NULL,
    ciudad character varying(100) DEFAULT 'Pasto' NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_sedes)
);

CREATE TABLE facultades (
    id_facultades uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(200) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_facultades)
);

CREATE TABLE programas_academicos (
    id_programas_academicos uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo_snies character varying(20),
    codigo_externo character varying(40),
    nombre character varying(150) NOT NULL,
    id_facultades uuid,
    id_sedes uuid,
    id_usuarios_director uuid,
    id_dependencias uuid,
    spadies boolean DEFAULT true NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_programas_academicos),
    FOREIGN KEY (id_dependencias) REFERENCES dependencias(id_dependencias),
    FOREIGN KEY (id_facultades) REFERENCES facultades(id_facultades),
    FOREIGN KEY (id_sedes) REFERENCES sedes(id_sedes),
    FOREIGN KEY (id_usuarios_director) REFERENCES usuarios(id_usuarios)
);

CREATE TABLE periodos_academicos (
    id_periodos_academicos uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(20) NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    PRIMARY KEY (id_periodos_academicos)
);

CREATE TABLE dependencias (
    id_dependencias uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(150) NOT NULL,
    tipo character varying(60) NOT NULL,
    id_usuarios_responsable uuid,
    es_confidencialidad_especial boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_dependencias),
    FOREIGN KEY (id_usuarios_responsable) REFERENCES usuarios(id_usuarios)
);

CREATE TABLE usuarios_dependencias (
    id_usuarios uuid NOT NULL,
    id_dependencias uuid NOT NULL,
    es_responsable boolean DEFAULT false NOT NULL,
    PRIMARY KEY (id_usuarios, id_dependencias),
    FOREIGN KEY (id_dependencias) REFERENCES dependencias(id_dependencias),
    FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios)
);

CREATE TABLE usuarios_programas (
    id_usuarios uuid NOT NULL,
    id_programas_academicos uuid NOT NULL,
    rol_en_programa character varying DEFAULT 'DIRECTOR',
    asignado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_usuarios, id_programas_academicos),
    FOREIGN KEY (id_programas_academicos) REFERENCES programas_academicos(id_programas_academicos),
    FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios)
);

-- ============================================================================
-- MÓDULO 3: POBLACIÓN UNIVERSITARIA (ESTUDIANTES, DOCENTES Y PERSONAL)
-- Descripcion: Personas, estudiantes, docentes, acudientes y colaboradores
-- ============================================================================

CREATE TABLE personas (
    id bigint NOT NULL,
    id_tipo_identificacion bigint DEFAULT 1,
    numero_identificacion character varying(20) NOT NULL,
    primer_nombre character varying(30),
    segundo_nombre character varying(30) DEFAULT '',
    primer_apellido character varying(30),
    segundo_apellido character varying(30) DEFAULT '',
    barrio character varying(60),
    telefono character varying(10),
    correo_electronico character varying(80),
    celular character varying(10),
    otra_ubicacion character varying(250),
    ruta_foto character varying(250),
    genero character varying(2),
    fecha_nacimiento date,
    fecha_expedicion date,
    id_lugar_radicacion bigint DEFAULT 560,
    id_lugar_expedicion bigint,
    id_lugar_nacimiento bigint,
    direccion character varying(60),
    id_grupo_etnico bigint DEFAULT 1,
    libreta_militar character varying(30),
    distrito_militar character varying(5),
    forma_pago character varying(2),
    vivienda_propia boolean,
    victima_conflicto character varying(2) DEFAULT '02',
    necesidades_educativas character varying(2),
    id_frontera smallint DEFAULT 4,
    id_capacidad bigint DEFAULT 5,
    id_discapacidad bigint DEFAULT 11,
    personas_cargo smallint,
    id_estado_civil bigint DEFAULT 1,
    grupo_vulnerable character varying(2) DEFAULT '02',
    estado_hv character varying(5),
    habilitar_hv boolean DEFAULT true,
    creacion_hv timestamp without time zone DEFAULT now(),
    firma character varying(128),
    huella bytea,
    id_tipo_identificacion_ant bigint,
    numero_identificacion_ant character varying(20),
    fecha_actualizacion_identificacion timestamp without time zone,
    labora boolean,
    asociacion_egresados boolean,
    id_sector_laboral bigint,
    subir_foto boolean,
    empresa_labora character varying(80),
    id_estado_laboral bigint,
    id_actividad_economica_empresa bigint,
    correo_electronico_opcional character varying(80),
    estrato integer,
    sisben integer,
    pertinencia_trabajo bigint,
    dificultad_trabajo character varying(100),
    autoriza character varying(10) DEFAULT 'true',
    tipo_sangre character varying(5),
    factor_rh character varying(5),
    id_orientacion_sexual bigint,
    cargo character varying(300),
    profesion character varying(300),
    vive boolean DEFAULT true,
    id_persona_acudiente bigint,
    eps character varying(150),
    correo_institucional character varying(150),
    identitario json,
    id_cargo integer,
    id_lugar_procedencia character varying(10),
    sector_rural character varying(2),
    registroruv character varying(2),
    firmantepaz_arn character varying(2),
    id_tipo_grupo_etnico integer,
    estado_investigacion boolean,
    id_estrato_socioeconomico integer,
    PRIMARY KEY (id),
    FOREIGN KEY (id_persona_acudiente) REFERENCES personas(id)
);

CREATE TABLE estudiantes (
    id_estudiantes uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo_externo character varying(40),
    tipo_documento character varying(20) DEFAULT 'CC' NOT NULL,
    numero_documento character varying(30) NOT NULL,
    nombres character varying(150) NOT NULL,
    apellidos character varying(150) NOT NULL,
    correo_institucional character varying(150),
    correo_personal character varying(150),
    telefono character varying(30),
    telefono_fijo character varying(30),
    direccion character varying(250),
    foto_url text,
    fecha_nacimiento date,
    genero character varying(20),
    estado_civil character varying(40),
    etnia character varying(100),
    afiliado_salud character varying(20),
    eps character varying(100),
    colegio_origen character varying(250),
    tipo_colegio character varying(30),
    ano_grado_colegio character varying(10),
    id_sedes uuid,
    id_programas_academicos uuid,
    semestre_actual smallint,
    estado_matricula character varying(30) DEFAULT 'ACTIVO' NOT NULL,
    tipo_estudiante character varying(60),
    corte_ingreso character varying(30),
    id_cargas_sincronizacion uuid,
    sincronizado_en timestamp with time zone,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    id_personas bigint,
    PRIMARY KEY (id_estudiantes),
    FOREIGN KEY (id_cargas_sincronizacion) REFERENCES cargas_sincronizacion(id_cargas_sincronizacion),
    FOREIGN KEY (id_personas) REFERENCES personas(id),
    FOREIGN KEY (id_programas_academicos) REFERENCES programas_academicos(id_programas_academicos),
    FOREIGN KEY (id_sedes) REFERENCES sedes(id_sedes)
);

CREATE TABLE docentes (
    id_docentes uuid DEFAULT gen_random_uuid() NOT NULL,
    id_usuarios uuid,
    codigo_externo character varying(40),
    numero_documento character varying(30) NOT NULL,
    nombres character varying(150) NOT NULL,
    apellidos character varying(150) NOT NULL,
    tipo_vinculo character varying(40),
    id_programas_academicos uuid,
    activo boolean DEFAULT true NOT NULL,
    id_personas bigint,
    correo_institucional character varying(150),
    PRIMARY KEY (id_docentes),
    FOREIGN KEY (id_personas) REFERENCES personas(id),
    FOREIGN KEY (id_programas_academicos) REFERENCES programas_academicos(id_programas_academicos),
    FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios)
);

CREATE TABLE colaboradores (
    id_participantes_vec uuid NOT NULL,
    tipo_participante character varying(20) DEFAULT 'COLABORADOR' NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT colaboradores_tipo_participante_check CHECK (((tipo_participante) = 'COLABORADOR')),
    PRIMARY KEY (id_participantes_vec),
    FOREIGN KEY (id_participantes_vec, tipo_participante) REFERENCES participantes_vec(id_participantes_vec, tipo_participante)
);

CREATE TABLE acudientes (
    id_acudientes uuid DEFAULT gen_random_uuid() NOT NULL,
    id_estudiantes uuid NOT NULL,
    nombres character varying(150) NOT NULL,
    parentesco character varying(60),
    telefono character varying(30),
    correo character varying(150),
    es_contacto_emergencia boolean DEFAULT false NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    id_personas bigint,
    PRIMARY KEY (id_acudientes),
    FOREIGN KEY (id_estudiantes) REFERENCES estudiantes(id_estudiantes),
    FOREIGN KEY (id_personas) REFERENCES personas(id)
);

CREATE TABLE egresados (
    id_participantes_vec uuid NOT NULL,
    tipo_participante character varying(20) DEFAULT 'EGRESADO' NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT egresados_tipo_participante_check CHECK (((tipo_participante) = 'EGRESADO')),
    PRIMARY KEY (id_participantes_vec),
    FOREIGN KEY (id_participantes_vec, tipo_participante) REFERENCES participantes_vec(id_participantes_vec, tipo_participante)
);

CREATE TABLE externos (
    id_participantes_vec uuid NOT NULL,
    tipo_participante character varying(20) DEFAULT 'EXTERNO' NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT externos_tipo_participante_check CHECK (((tipo_participante) = 'EXTERNO')),
    PRIMARY KEY (id_participantes_vec),
    FOREIGN KEY (id_participantes_vec, tipo_participante) REFERENCES participantes_vec(id_participantes_vec, tipo_participante)
);

-- ============================================================================
-- MÓDULO 4: ASIGNATURAS, GRUPOS Y MATRÍCULAS
-- Descripcion: Asignaturas, grupos académicos y registros de matrícula institucional
-- ============================================================================

CREATE TABLE asignaturas (
    id_asignaturas uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo_externo character varying(40),
    codigo character varying(30),
    nombre character varying(150) NOT NULL,
    id_programas_academicos uuid NOT NULL,
    creditos smallint,
    activo boolean DEFAULT true NOT NULL,
    PRIMARY KEY (id_asignaturas),
    FOREIGN KEY (id_programas_academicos) REFERENCES programas_academicos(id_programas_academicos)
);

CREATE TABLE grupos_asignatura (
    id_grupos_asignatura uuid DEFAULT gen_random_uuid() NOT NULL,
    id_asignaturas uuid NOT NULL,
    id_periodos_academicos uuid NOT NULL,
    id_docentes uuid,
    codigo_grupo character varying(20) DEFAULT '01' NOT NULL,
    id_cargas_sincronizacion uuid,
    PRIMARY KEY (id_grupos_asignatura),
    FOREIGN KEY (id_asignaturas) REFERENCES asignaturas(id_asignaturas),
    FOREIGN KEY (id_cargas_sincronizacion) REFERENCES cargas_sincronizacion(id_cargas_sincronizacion),
    FOREIGN KEY (id_docentes) REFERENCES docentes(id_docentes),
    FOREIGN KEY (id_periodos_academicos) REFERENCES periodos_academicos(id_periodos_academicos)
);

CREATE TABLE matriculas (
    id_matriculas uuid DEFAULT gen_random_uuid() NOT NULL,
    id_estudiantes uuid NOT NULL,
    id_programas_academicos uuid NOT NULL,
    id_periodos_academicos uuid NOT NULL,
    semestre smallint,
    jornada character varying(20),
    estado character varying(30) DEFAULT 'ACTIVA' NOT NULL,
    id_cargas_sincronizacion uuid,
    codigo_externo character varying,
    PRIMARY KEY (id_matriculas),
    FOREIGN KEY (id_cargas_sincronizacion) REFERENCES cargas_sincronizacion(id_cargas_sincronizacion),
    FOREIGN KEY (id_estudiantes) REFERENCES estudiantes(id_estudiantes),
    FOREIGN KEY (id_periodos_academicos) REFERENCES periodos_academicos(id_periodos_academicos),
    FOREIGN KEY (id_programas_academicos) REFERENCES programas_academicos(id_programas_academicos)
);

CREATE TABLE matriculas_asignaturas (
    id_matriculas_asignaturas uuid DEFAULT gen_random_uuid() NOT NULL,
    id_matriculas uuid NOT NULL,
    id_grupos_asignatura uuid NOT NULL,
    nota_corte_1 numeric(4,2),
    nota_corte_2 numeric(4,2),
    nota_corte_3 numeric(4,2),
    nota_final numeric(4,2),
    inasistencias_corte_1 smallint DEFAULT 0,
    inasistencias_corte_2 smallint DEFAULT 0,
    inasistencias_corte_3 smallint DEFAULT 0,
    veces_cursada smallint DEFAULT 1 NOT NULL,
    porcentaje_asistencia numeric(5,2),
    estado character varying(30) DEFAULT 'CURSANDO',
    id_cargas_sincronizacion uuid,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_matriculas_asignaturas),
    FOREIGN KEY (id_cargas_sincronizacion) REFERENCES cargas_sincronizacion(id_cargas_sincronizacion),
    FOREIGN KEY (id_grupos_asignatura) REFERENCES grupos_asignatura(id_grupos_asignatura),
    FOREIGN KEY (id_matriculas) REFERENCES matriculas(id_matriculas)
);

-- ============================================================================
-- MÓDULO 5: ENCUESTA DE CARACTERIZACIÓN Y MOTOR DE RIESGO DE PERMANENCIA
-- Descripcion: Encuesta psicopedagógica, preguntas, opciones, respuestas, calificaciones y umbrales por etapa formativa
-- ============================================================================

CREATE TABLE encuestas_caracterizacion (
    id_encuestas_caracterizacion uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(150) NOT NULL,
    version smallint DEFAULT 1 NOT NULL,
    vigente_desde date,
    vigente_hasta date,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_encuestas_caracterizacion)
);

CREATE TABLE preguntas_caracterizacion (
    id_preguntas_caracterizacion uuid DEFAULT gen_random_uuid() NOT NULL,
    id_encuestas_caracterizacion uuid NOT NULL,
    texto text NOT NULL,
    tipo_respuesta character varying(30) NOT NULL,
    categoria character varying(60),
    orden smallint DEFAULT 0 NOT NULL,
    obligatoria boolean DEFAULT true NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    PRIMARY KEY (id_preguntas_caracterizacion),
    FOREIGN KEY (id_encuestas_caracterizacion) REFERENCES encuestas_caracterizacion(id_encuestas_caracterizacion)
);

CREATE TABLE opciones_pregunta (
    id_opciones_pregunta uuid DEFAULT gen_random_uuid() NOT NULL,
    id_preguntas_caracterizacion uuid NOT NULL,
    texto character varying(255) NOT NULL,
    valor_riesgo numeric(6,2) DEFAULT 0 NOT NULL,
    orden smallint DEFAULT 0 NOT NULL,
    PRIMARY KEY (id_opciones_pregunta),
    FOREIGN KEY (id_preguntas_caracterizacion) REFERENCES preguntas_caracterizacion(id_preguntas_caracterizacion)
);

CREATE TABLE respuestas_caracterizacion (
    id_respuestas_caracterizacion uuid DEFAULT gen_random_uuid() NOT NULL,
    id_estudiantes uuid NOT NULL,
    id_encuestas_caracterizacion uuid NOT NULL,
    id_periodos_academicos uuid,
    id_usuarios uuid,
    estado character varying(20) DEFAULT 'COMPLETA' NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_respuestas_caracterizacion),
    FOREIGN KEY (id_encuestas_caracterizacion) REFERENCES encuestas_caracterizacion(id_encuestas_caracterizacion),
    FOREIGN KEY (id_estudiantes) REFERENCES estudiantes(id_estudiantes),
    FOREIGN KEY (id_periodos_academicos) REFERENCES periodos_academicos(id_periodos_academicos),
    FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios)
);

CREATE TABLE respuestas_detalle (
    id_respuestas_detalle uuid DEFAULT gen_random_uuid() NOT NULL,
    id_respuestas_caracterizacion uuid NOT NULL,
    id_preguntas_caracterizacion uuid NOT NULL,
    id_opciones_pregunta uuid,
    valor_texto text,
    valor_numerico numeric(12,2),
    PRIMARY KEY (id_respuestas_detalle),
    FOREIGN KEY (id_opciones_pregunta) REFERENCES opciones_pregunta(id_opciones_pregunta),
    FOREIGN KEY (id_preguntas_caracterizacion) REFERENCES preguntas_caracterizacion(id_preguntas_caracterizacion),
    FOREIGN KEY (id_respuestas_caracterizacion) REFERENCES respuestas_caracterizacion(id_respuestas_caracterizacion)
);

CREATE TABLE calificaciones_riesgo (
    id_calificaciones_riesgo uuid DEFAULT gen_random_uuid() NOT NULL,
    id_estudiantes uuid NOT NULL,
    id_respuestas_caracterizacion uuid,
    id_periodos_academicos uuid,
    tipo_origen character varying(20) NOT NULL,
    puntaje_global numeric(6,2) NOT NULL,
    puntaje_academico numeric(6,2),
    puntaje_socioeconomico numeric(6,2),
    puntaje_institucional numeric(6,2),
    puntaje_individual numeric(6,2),
    id_rangos_riesgo uuid NOT NULL,
    factores jsonb,
    vigente boolean DEFAULT true NOT NULL,
    calculado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_calificaciones_riesgo),
    FOREIGN KEY (id_estudiantes) REFERENCES estudiantes(id_estudiantes),
    FOREIGN KEY (id_periodos_academicos) REFERENCES periodos_academicos(id_periodos_academicos),
    FOREIGN KEY (id_rangos_riesgo) REFERENCES rangos_riesgo(id_rangos_riesgo),
    FOREIGN KEY (id_respuestas_caracterizacion) REFERENCES respuestas_caracterizacion(id_respuestas_caracterizacion)
);

CREATE TABLE umbrales_permanencia (
    id_umbrales_permanencia uuid DEFAULT gen_random_uuid() NOT NULL,
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
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_umbrales_permanencia)
);

CREATE TABLE rangos_riesgo (
    id_rangos_riesgo uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(30) NOT NULL,
    color_hex character varying(7) NOT NULL,
    puntaje_min numeric(6,2) NOT NULL,
    puntaje_max numeric(6,2) NOT NULL,
    orden smallint NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    id_usuarios uuid,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rangos_riesgo_check CHECK ((puntaje_max >= puntaje_min)),
    PRIMARY KEY (id_rangos_riesgo),
    FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios)
);

CREATE TABLE criterios_riesgo_automatico (
    id_criterios_riesgo_automatico uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(120) NOT NULL,
    id_tipos_alerta uuid NOT NULL,
    campo_evaluado character varying(60) NOT NULL,
    operador character varying(10) NOT NULL,
    umbral numeric(6,2) NOT NULL,
    peso numeric(5,2) DEFAULT 1 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    PRIMARY KEY (id_criterios_riesgo_automatico),
    FOREIGN KEY (id_tipos_alerta) REFERENCES tipos_alerta(id_tipos_alerta)
);

-- ============================================================================
-- MÓDULO 6: ALERTAS TEMPRANAS, CASOS Y SEGUIMIENTO ESTUDIANTIL
-- Descripcion: Detección temprana de alertas, radicación de casos y notas de seguimiento
-- ============================================================================

CREATE TABLE tipos_alerta (
    id_tipos_alerta uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(100) NOT NULL,
    categoria character varying(60) NOT NULL,
    requiere_confidencialidad_especial boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    PRIMARY KEY (id_tipos_alerta)
);

CREATE TABLE alertas (
    id_alertas uuid DEFAULT gen_random_uuid() NOT NULL,
    id_estudiantes uuid NOT NULL,
    id_tipos_alerta uuid NOT NULL,
    origen character varying(20) NOT NULL,
    id_criterios_riesgo_automatico uuid,
    id_usuarios_creador uuid,
    descripcion text NOT NULL,
    id_rangos_riesgo uuid,
    estado character varying(20) DEFAULT 'ACTIVA' NOT NULL,
    id_usuarios_solicita_inactivacion uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_alertas),
    FOREIGN KEY (id_criterios_riesgo_automatico) REFERENCES criterios_riesgo_automatico(id_criterios_riesgo_automatico),
    FOREIGN KEY (id_estudiantes) REFERENCES estudiantes(id_estudiantes),
    FOREIGN KEY (id_rangos_riesgo) REFERENCES rangos_riesgo(id_rangos_riesgo),
    FOREIGN KEY (id_tipos_alerta) REFERENCES tipos_alerta(id_tipos_alerta),
    FOREIGN KEY (id_usuarios_creador) REFERENCES usuarios(id_usuarios),
    FOREIGN KEY (id_usuarios_solicita_inactivacion) REFERENCES usuarios(id_usuarios)
);

CREATE TABLE estados_caso (
    id_estados_caso uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(60) NOT NULL,
    orden smallint NOT NULL,
    es_final boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    PRIMARY KEY (id_estados_caso)
);

CREATE TABLE casos (
    id_casos uuid DEFAULT gen_random_uuid() NOT NULL,
    id_estudiantes uuid NOT NULL,
    id_alertas uuid,
    id_dependencias uuid,
    id_estados_caso uuid NOT NULL,
    id_rangos_riesgo uuid,
    es_confidencialidad_especial boolean DEFAULT false NOT NULL,
    abierto_en timestamp with time zone DEFAULT now() NOT NULL,
    cerrado_en timestamp with time zone,
    id_usuarios_cierre uuid,
    observaciones_cierre text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_casos),
    FOREIGN KEY (id_alertas) REFERENCES alertas(id_alertas),
    FOREIGN KEY (id_dependencias) REFERENCES dependencias(id_dependencias),
    FOREIGN KEY (id_estados_caso) REFERENCES estados_caso(id_estados_caso),
    FOREIGN KEY (id_estudiantes) REFERENCES estudiantes(id_estudiantes),
    FOREIGN KEY (id_rangos_riesgo) REFERENCES rangos_riesgo(id_rangos_riesgo),
    FOREIGN KEY (id_usuarios_cierre) REFERENCES usuarios(id_usuarios)
);

CREATE TABLE notas_aclaratorias (
    id_notas_aclaratorias uuid DEFAULT gen_random_uuid() NOT NULL,
    id_intervenciones uuid NOT NULL,
    id_usuarios uuid NOT NULL,
    texto text NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_notas_aclaratorias),
    FOREIGN KEY (id_intervenciones) REFERENCES intervenciones(id_intervenciones),
    FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios)
);

CREATE TABLE borradores (
    id_borradores uuid DEFAULT gen_random_uuid() NOT NULL,
    id_usuarios uuid NOT NULL,
    tipo_entidad character varying(40) NOT NULL,
    entidad_id uuid,
    contenido jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_borradores),
    FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios)
);

-- ============================================================================
-- MÓDULO 7: REMISIONES E INTERVENCIONES
-- Descripcion: Rutas de remisión a áreas de apoyo, flujo de estados e intervenciones profesionales
-- ============================================================================

CREATE TABLE rutas_remision (
    id_rutas_remision uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(200) NOT NULL,
    id_programas_bienestar uuid NOT NULL,
    id_tipos_apoyo uuid,
    id_dependencias uuid,
    profesional_responsable character varying(150),
    id_usuarios_responsable uuid,
    observaciones text,
    activo boolean DEFAULT true NOT NULL,
    PRIMARY KEY (id_rutas_remision),
    FOREIGN KEY (id_dependencias) REFERENCES dependencias(id_dependencias),
    FOREIGN KEY (id_programas_bienestar) REFERENCES programas_bienestar(id_programas_bienestar),
    FOREIGN KEY (id_tipos_apoyo) REFERENCES tipos_apoyo(id_tipos_apoyo),
    FOREIGN KEY (id_usuarios_responsable) REFERENCES usuarios(id_usuarios)
);

CREATE TABLE estados_remision (
    id_estados_remision uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(60) NOT NULL,
    orden smallint NOT NULL,
    es_final boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    PRIMARY KEY (id_estados_remision)
);

CREATE TABLE remisiones (
    id_remisiones uuid DEFAULT gen_random_uuid() NOT NULL,
    id_casos uuid NOT NULL,
    id_dependencias uuid NOT NULL,
    id_usuarios_profesional uuid NOT NULL,
    id_usuarios_remitente uuid NOT NULL,
    id_estados_remision uuid NOT NULL,
    motivo text NOT NULL,
    generada_en timestamp with time zone DEFAULT now() NOT NULL,
    fecha_limite_atencion timestamp with time zone,
    atendida_en timestamp with time zone,
    recomendaciones_docente text,
    escalada boolean DEFAULT false NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_remisiones),
    FOREIGN KEY (id_casos) REFERENCES casos(id_casos),
    FOREIGN KEY (id_dependencias) REFERENCES dependencias(id_dependencias),
    FOREIGN KEY (id_estados_remision) REFERENCES estados_remision(id_estados_remision),
    FOREIGN KEY (id_usuarios_profesional) REFERENCES usuarios(id_usuarios),
    FOREIGN KEY (id_usuarios_remitente) REFERENCES usuarios(id_usuarios)
);

CREATE TABLE remisiones_historial_estados (
    id_remisiones_historial_estados uuid DEFAULT gen_random_uuid() NOT NULL,
    id_remisiones uuid NOT NULL,
    id_estados_remision_anterior uuid,
    id_estados_remision_nuevo uuid NOT NULL,
    id_usuarios uuid,
    observacion text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_remisiones_historial_estados),
    FOREIGN KEY (id_estados_remision_anterior) REFERENCES estados_remision(id_estados_remision),
    FOREIGN KEY (id_estados_remision_nuevo) REFERENCES estados_remision(id_estados_remision),
    FOREIGN KEY (id_remisiones) REFERENCES remisiones(id_remisiones),
    FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios)
);

CREATE TABLE tipos_intervencion (
    id_tipos_intervencion uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    PRIMARY KEY (id_tipos_intervencion)
);

CREATE TABLE intervenciones (
    id_intervenciones uuid DEFAULT gen_random_uuid() NOT NULL,
    id_casos uuid NOT NULL,
    id_tipos_intervencion uuid NOT NULL,
    id_usuarios uuid NOT NULL,
    fecha_atencion timestamp with time zone NOT NULL,
    descripcion text NOT NULL,
    estado character varying(20) DEFAULT 'ABIERTA' NOT NULL,
    canal_atencion character varying(50),
    es_tutorias boolean DEFAULT false NOT NULL,
    satisfaccion_escala smallint,
    utilizaria_nuevamente boolean,
    recomenderia boolean,
    aporto_bienestar boolean,
    cerrada_en timestamp with time zone,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT intervenciones_satisfaccion_escala_check CHECK (((satisfaccion_escala >= 1) AND (satisfaccion_escala <= 5))),
    PRIMARY KEY (id_intervenciones),
    FOREIGN KEY (id_casos) REFERENCES casos(id_casos),
    FOREIGN KEY (id_tipos_intervencion) REFERENCES tipos_intervencion(id_tipos_intervencion),
    FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios)
);

CREATE TABLE intervenciones_soportes (
    id_intervenciones_soportes uuid DEFAULT gen_random_uuid() NOT NULL,
    id_intervenciones uuid NOT NULL,
    nombre_archivo character varying(255) NOT NULL,
    ruta_almacenamiento text NOT NULL,
    tipo_mime character varying(100) DEFAULT 'application/pdf' NOT NULL,
    tamano_bytes integer NOT NULL,
    hash_sha256 character varying(64),
    id_usuarios uuid NOT NULL,
    subido_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT intervenciones_soportes_tamano_bytes_check CHECK ((tamano_bytes <= 5242880)),
    PRIMARY KEY (id_intervenciones_soportes),
    FOREIGN KEY (id_intervenciones) REFERENCES intervenciones(id_intervenciones),
    FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios)
);

-- ============================================================================
-- MÓDULO 8: ACTIVIDADES VEC Y BIENESTAR INSTITUCIONAL
-- Descripcion: Gestión de actividades de la Vicerrectoría para la Evangelización de las Culturas, asistencias y apoyos
-- ============================================================================

CREATE TABLE componentes_bienestar (
    id_componentes_bienestar uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(150) NOT NULL,
    id_lineas_accion uuid NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    PRIMARY KEY (id_componentes_bienestar),
    FOREIGN KEY (id_lineas_accion) REFERENCES lineas_accion(id_lineas_accion)
);

CREATE TABLE lineas_accion (
    id_lineas_accion uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(150) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    PRIMARY KEY (id_lineas_accion)
);

CREATE TABLE programas_bienestar (
    id_programas_bienestar uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(200) NOT NULL,
    id_componentes_bienestar uuid NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    PRIMARY KEY (id_programas_bienestar),
    FOREIGN KEY (id_componentes_bienestar) REFERENCES componentes_bienestar(id_componentes_bienestar)
);

CREATE TABLE catalogo_bienestar_actividades (
    programa character varying(250) NOT NULL,
    componente character varying(250),
    linea_accion character varying(250),
    estrategia_politica_bienestar text,
    estrategia_politica_permanencia text,
    estrategia_politica_educacion_inclusiva text,
    numero_tipo_apoyo smallint,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    tipo_apoyo_excel character varying(200),
    orden_excel integer,
    PRIMARY KEY (programa),
    FOREIGN KEY (numero_tipo_apoyo) REFERENCES apoyos_actividades_vec(numero)
);

CREATE TABLE catalogo_actividades_vec (
    id_catalogo_actividades_vec uuid DEFAULT gen_random_uuid() NOT NULL,
    hoja_origen character varying(100) NOT NULL,
    fila_origen integer NOT NULL,
    tipo_registro character varying(12) NOT NULL,
    actividad text,
    nota_origen text,
    descripcion text,
    tipo_actividad character varying(200),
    proyecto text,
    programa text,
    componente text,
    linea_accion text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT catalogo_actividades_vec_fila_origen_check CHECK ((fila_origen > 1)),
    CONSTRAINT catalogo_actividades_vec_tipo_contenido_check CHECK (((((tipo_registro) = 'ACTIVIDAD') AND (NULLIF(btrim(actividad), '') IS NOT NULL) AND (nota_origen IS NULL)) OR (((tipo_registro) = 'NOTA') AND (NULLIF(btrim(nota_origen), '') IS NOT NULL) AND (actividad IS NULL)))),
    CONSTRAINT catalogo_actividades_vec_tipo_registro_check CHECK (((tipo_registro) = ANY (ARRAY[('ACTIVIDAD'), ('NOTA')]))),
    PRIMARY KEY (id_catalogo_actividades_vec)
);

CREATE TABLE actividades_vec (
    id_actividades_vec uuid DEFAULT gen_random_uuid() NOT NULL,
    id_periodos_academicos uuid NOT NULL,
    actividad character varying(250) NOT NULL,
    descripcion_actividad text,
    proyecto character varying(250) NOT NULL,
    tipo_actividad character varying(150),
    tipo_actividad_otra text,
    alianza_interinstitucional boolean,
    entidad_alianza character varying(250),
    articulacion_institucional character varying(250),
    id_dependencias uuid,
    dependencia_otra character varying(250),
    modalidad character varying(100),
    fecha_inicio date NOT NULL,
    fecha_finalizacion date NOT NULL,
    id_programas_bienestar uuid,
    estrategia_politica_bienestar text,
    estrategia_politica_permanencia text,
    estrategia_politica_educacion_inclusiva text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    id_catalogo_actividades_vec uuid,
    estado character varying(20) DEFAULT 'PROGRAMADA' NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    ubicacion text,
    variables_modalidades text[] DEFAULT ARRAY[][] NOT NULL,
    roles_participantes_objetivo text[] DEFAULT ARRAY['ESTUDIANTE', 'COLABORADOR', 'EGRESADO', 'EXTERNO', 'ADMINISTRATIVO'] NOT NULL,
    cancelada_en timestamp with time zone,
    CONSTRAINT actividades_vec_catalogo_o_programa_check CHECK (((id_catalogo_actividades_vec IS NOT NULL) OR (id_programas_bienestar IS NOT NULL))),
    CONSTRAINT actividades_vec_estado_check CHECK (((estado) = ANY (ARRAY[('PROGRAMADA'), ('EN_CURSO'), ('FINALIZADA'), ('CANCELADA')]))),
    CONSTRAINT actividades_vec_fechas_validas CHECK ((fecha_finalizacion >= fecha_inicio)),
    CONSTRAINT actividades_vec_roles_participantes_objetivo_check CHECK (((cardinality(roles_participantes_objetivo) > 0) AND (roles_participantes_objetivo <@ ARRAY['ESTUDIANTE', 'COLABORADOR', 'EGRESADO', 'EXTERNO', 'ADMINISTRATIVO']))),
    PRIMARY KEY (id_actividades_vec),
    FOREIGN KEY (id_catalogo_actividades_vec) REFERENCES catalogo_actividades_vec(id_catalogo_actividades_vec),
    FOREIGN KEY (id_dependencias) REFERENCES dependencias(id_dependencias),
    FOREIGN KEY (id_periodos_academicos) REFERENCES periodos_academicos(id_periodos_academicos),
    FOREIGN KEY (id_programas_bienestar) REFERENCES programas_bienestar(id_programas_bienestar)
);

CREATE TABLE actividades_vec_modalidades (
    id_actividades_vec uuid NOT NULL,
    programa character varying(250) NOT NULL,
    id_tipos_apoyo uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_actividades_vec, programa),
    FOREIGN KEY (id_actividades_vec) REFERENCES actividades_vec(id_actividades_vec),
    FOREIGN KEY (id_tipos_apoyo) REFERENCES apoyos_actividades_vec(id_tipos_apoyo)
);

CREATE TABLE actividades_vec_participantes (
    id_actividades_vec_participantes uuid DEFAULT gen_random_uuid() NOT NULL,
    id_actividades_vec uuid NOT NULL,
    id_participantes_vec uuid NOT NULL,
    id_tipos_apoyo uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    asistencia_verificada boolean DEFAULT false NOT NULL,
    asistencia_verificada_en timestamp with time zone,
    asistencia_verificada_por text,
    programa_modalidad character varying(250),
    estado_asistencia character varying(20) DEFAULT 'PENDIENTE' NOT NULL,
    asistencia_verificada_origen text DEFAULT 'MANUAL' NOT NULL,
    tipo_apoyo_otro character varying(250),
    CONSTRAINT actividades_vec_participantes_estado_asistencia_check CHECK (((estado_asistencia) = ANY (ARRAY[('PENDIENTE'), ('PRESENTE'), ('AUSENTE')]))),
    PRIMARY KEY (id_actividades_vec_participantes),
    FOREIGN KEY (id_actividades_vec) REFERENCES actividades_vec(id_actividades_vec),
    FOREIGN KEY (id_tipos_apoyo) REFERENCES apoyos_actividades_vec(id_tipos_apoyo),
    FOREIGN KEY (id_participantes_vec) REFERENCES participantes_vec(id_participantes_vec)
);

CREATE TABLE actividades_vec_auditoria (
    id_auditoria bigint NOT NULL,
    id_actividades_vec uuid NOT NULL,
    accion character varying(20) NOT NULL,
    id_usuario text,
    detalle jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT actividades_vec_auditoria_accion_check CHECK (((accion) = ANY (ARRAY[('CREAR'), ('EDITAR'), ('CAMBIAR_ESTADO')]))),
    PRIMARY KEY (id_auditoria),
    FOREIGN KEY (id_actividades_vec) REFERENCES actividades_vec(id_actividades_vec)
);

CREATE TABLE actividades_vec_participantes_auditoria (
    id_auditoria bigint NOT NULL,
    id_actividades_vec_participantes uuid NOT NULL,
    accion character varying(30) NOT NULL,
    id_usuario text,
    detalle jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT actividades_vec_participantes_auditoria_accion_check CHECK (((accion) = 'EDITAR_TIPO_APOYO')),
    PRIMARY KEY (id_auditoria),
    FOREIGN KEY (id_actividades_vec_participantes) REFERENCES actividades_vec_participantes(id_actividades_vec_participantes)
);

CREATE TABLE participantes_vec (
    id_participantes_vec uuid DEFAULT gen_random_uuid() NOT NULL,
    id_personas bigint NOT NULL,
    tipo_participante character varying(20) NOT NULL,
    tipo_documento character varying(50),
    codigo character varying(100),
    programa_academico character varying(250),
    programa_posgrado_dependencia character varying(250),
    semestre smallint,
    jornada character varying(100),
    dependencia character varying(250),
    cargo character varying(250),
    fecha_egreso date,
    etnia character varying(150),
    municipio character varying(150),
    discapacidad text,
    conflicto_armado text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    detalle_tipo_participante character varying(120),
    lugar_nacimiento character varying(250),
    CONSTRAINT participantes_vec_semestre_check CHECK (((semestre IS NULL) OR (semestre > 0))),
    CONSTRAINT participantes_vec_tipo_participante_check CHECK (((tipo_participante) = ANY ((ARRAY['ESTUDIANTE', 'COLABORADOR', 'EGRESADO', 'EXTERNO', 'ADMINISTRATIVO', 'POR_CONFIRMAR'])[]))),
    PRIMARY KEY (id_participantes_vec),
    FOREIGN KEY (id_personas) REFERENCES personas(id)
);

CREATE TABLE tipos_apoyo (
    id_tipos_apoyo uuid DEFAULT gen_random_uuid() NOT NULL,
    numero smallint NOT NULL,
    nombre character varying(120) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    PRIMARY KEY (id_tipos_apoyo)
);

CREATE TABLE apoyos_financieros (
    id_apoyos_financieros uuid DEFAULT gen_random_uuid() NOT NULL,
    id_estudiantes uuid NOT NULL,
    id_periodos_academicos uuid NOT NULL,
    concepto_descuento character varying(150) NOT NULL,
    nombre_descuento character varying(200) NOT NULL,
    porcentaje_descuento numeric(5,2) DEFAULT 0 NOT NULL,
    valor_descuento numeric(12,2),
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_apoyos_financieros),
    FOREIGN KEY (id_estudiantes) REFERENCES estudiantes(id_estudiantes),
    FOREIGN KEY (id_periodos_academicos) REFERENCES periodos_academicos(id_periodos_academicos)
);

CREATE TABLE apoyos_actividades_vec (
    id_tipos_apoyo uuid DEFAULT gen_random_uuid() NOT NULL,
    numero smallint NOT NULL,
    nombre character varying(120) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_tipos_apoyo)
);

-- ============================================================================
-- MÓDULO 9: AUDITORÍA, SINCRONIZACIÓN Y NOTIFICACIONES
-- Descripcion: Trazabilidad, sincronización académica externa, reportes SNIES y log de auditoría
-- ============================================================================

CREATE TABLE fuentes_sincronizacion (
    id_fuentes_sincronizacion uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(100) NOT NULL,
    tipo character varying(20) NOT NULL,
    configuracion jsonb,
    activo boolean DEFAULT true NOT NULL,
    CONSTRAINT fuentes_sincronizacion_tipo_check CHECK (((tipo) = ANY (ARRAY[('BATCH'), ('API'), ('WEBHOOK')]))),
    PRIMARY KEY (id_fuentes_sincronizacion)
);

CREATE TABLE cargas_sincronizacion (
    id_cargas_sincronizacion uuid DEFAULT gen_random_uuid() NOT NULL,
    id_fuentes_sincronizacion uuid NOT NULL,
    tipo_dato character varying(40) NOT NULL,
    iniciada_en timestamp with time zone DEFAULT now() NOT NULL,
    finalizada_en timestamp with time zone,
    estado character varying(20) DEFAULT 'EN_PROCESO' NOT NULL,
    registros_procesados integer DEFAULT 0,
    registros_error integer DEFAULT 0,
    detalle_error jsonb,
    payload_bruto jsonb,
    PRIMARY KEY (id_cargas_sincronizacion),
    FOREIGN KEY (id_fuentes_sincronizacion) REFERENCES fuentes_sincronizacion(id_fuentes_sincronizacion)
);

CREATE TABLE exportaciones_snies (
    id_exportaciones_snies uuid DEFAULT gen_random_uuid() NOT NULL,
    id_usuarios uuid NOT NULL,
    id_periodos_academicos uuid,
    tipo_reporte character varying(60) NOT NULL,
    parametros jsonb,
    archivo_url text,
    estado character varying(20) DEFAULT 'GENERADO' NOT NULL,
    generado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_exportaciones_snies),
    FOREIGN KEY (id_periodos_academicos) REFERENCES periodos_academicos(id_periodos_academicos),
    FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios)
);

CREATE TABLE log_auditoria_default (
    id_log_auditoria bigint DEFAULT nextval('sat.log_auditoria_id_log_auditoria_seq'::regclass) NOT NULL,
    id_usuarios uuid,
    accion character varying(30) NOT NULL,
    tabla_afectada character varying(100) NOT NULL,
    registro_id uuid,
    datos_anteriores jsonb,
    datos_nuevos jsonb,
    ip_origen inet,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id_log_auditoria, creado_en)
);

CREATE TABLE notificaciones_default (
    id_notificaciones uuid DEFAULT gen_random_uuid() NOT NULL,
    id_usuarios uuid NOT NULL,
    tipo character varying(40) NOT NULL,
    entidad_tipo character varying(40) NOT NULL,
    entidad_id uuid NOT NULL,
    canal character varying(20) DEFAULT 'CORREO' NOT NULL,
    estado_envio character varying(20) DEFAULT 'PENDIENTE' NOT NULL,
    leida_en timestamp with time zone,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    enviada_en timestamp with time zone,
    PRIMARY KEY (id_notificaciones, creado_en)
);

