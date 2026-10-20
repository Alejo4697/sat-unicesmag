# SAT-UNICESMAG — Proyecto full-stack (React + Node.js + Express)

Reorganización del mockup estático (`MOCKUPS PRACTICA/*.html`) como una
aplicación real, usando **Screaming Architecture**: la estructura de
carpetas "grita" qué hace el sistema (sus casos de uso / features del
negocio), no qué framework usa. Cliente y servidor viven en un único
repositorio (monorepo simple con npm workspaces), pensado para abrirse
como una sola carpeta en VS Code.

## Por qué Screaming Architecture

En la versión anterior, tanto `client/` como `server/` estaban organizados
por **capa técnica**: `pages/`, `components/`, `api/` en el cliente;
`routes/`, `middleware/`, `data/` en el servidor. Al abrir el proyecto lo
primero que se ve es "esto es React" / "esto es Express" — no "esto es un
sistema de alertas tempranas y permanencia estudiantil".

Con Screaming Architecture se invierte el criterio: la carpeta de primer
nivel dentro de `src/` es `features/`, y cada subcarpeta ahí es un caso de
uso real del sistema — el mismo que ya estaba documentado en
`assets/js/menu.js` del mockup (Monitoreo, Permanencia & Casos,
Caracterización, Informes & SNIES, Administración) más Autenticación. Lo
que es infraestructura pura y transversal (el layout del sidebar/topbar,
el cliente HTTP base, el guard de rutas, el middleware de RBAC, los datos
simulados) vive aparte en `shared/`, porque no es un caso de uso en sí
mismo — es lo que todos los casos de uso usan.

## Estructura

```
sat-unicesmag/
├── package.json              # raíz: solo orquesta client + server (workspaces)
│
├── client/                    # React (Vite)
│   ├── public/img/            # escudo y logo institucional
│   └── src/
│       ├── main.jsx, App.jsx, index.css
│       │
│       ├── shared/            # infraestructura transversal (NO son features)
│       │   ├── layout/         # AppLayout, Sidebar, Topbar — el "chrome" repetido en cada .html
│       │   ├── context/        # AuthContext — usuario activo + cambio de rol
│       │   ├── routing/        # ProtectedRoute — bloquea una ruta si el rol no tiene acceso
│       │   ├── api/            # client.js — wrapper fetch con la URL base y el header de sesión
│       │   ├── config/         # menuConfig.js — qué módulos ve cada rol
│       │   ├── panels/         # paneles de UI de negocio reutilizados por 2+ features (IntervencionesPanel, RemisionesPanel)
│       │   └── styles/         # variables.css, main.css, components.css (tal cual tu mockup)
│       │
│       └── features/          # un caso de uso del negocio = una carpeta
│           ├── autenticacion/            → LoginPage.jsx + api.js
│           ├── monitoreo/                → DashboardPage.jsx + api.js  (Tablero General + gráficas)
│           ├── seguimiento-estudiantil/  → FichaEstudiantePage.jsx + api.js  (Ficha 360°)
│           ├── alertas-tempranas/        → AlertasPage.jsx + api.js
│           ├── intervenciones/           → IntervencionesPage.jsx + api.js
│           ├── remisiones/               → RemisionesPage.jsx + api.js
│           ├── caracterizacion/          → CaracterizacionPage.jsx + api.js  (instrumento de 34 ítems)
│           ├── actividades/              → ActividadesPage.jsx + api.js  (catálogo VEC, asistentes y exportación)
│           ├── reportes-snies/           → ReportesPage.jsx + api.js
│           └── administracion/           → AdministracionPage.jsx + api.js
│
└── server/                     # Express (API REST)
    └── src/
        ├── server.js            # arranca el servidor (puerto 4000)
        ├── app.js               # arma express, cors, json, monta las rutas de cada feature
        │
        ├── shared/              # infraestructura transversal (NO son features)
        │   ├── data/             # mockData.js + menuConfig.js — la fuente de verdad de roles/permisos
        │   ├── middleware/       # requireRole.js (RBAC), errorHandler.js
        │   └── routes/           # menu.routes.js — sirve el menú (no es un caso de uso, es navegación)
        │
        └── features/            # un caso de uso del negocio = una carpeta = un router
            ├── autenticacion/            → auth.routes.js           (/api/auth)
            ├── monitoreo/                → dashboard.routes.js      (/api/dashboard)
            ├── seguimiento-estudiantil/  → estudiantes.routes.js    (/api/estudiantes)
            ├── alertas-tempranas/        → alertas.routes.js        (/api/alertas)
            ├── intervenciones/           → intervenciones.routes.js (/api/intervenciones)
            ├── remisiones/               → remisiones.routes.js     (/api/remisiones)
            ├── caracterizacion/          → caracterizacion.routes.js + instrumento.js (/api/caracterizacion)
            ├── actividades/              → participantes.routes.js  (/api/actividades/participantes)
            ├── reportes-snies/           → reportes.routes.js       (/api/reportes)
            └── administracion/           → administracion.routes.js (/api/administracion)
```

**Regla de dependencia:** una feature puede importar de `shared/`, nunca
al revés, y una feature nunca importa de otra feature. Si dos features
necesitaran compartir algo, ese algo se sube a `shared/`. Es lo que
mantiene cada carpeta de `features/` recortable y movible sin arrastrar
el resto del sistema.

> **Nota sobre `shared/panels/`:** originalmente `shared/` era solo
> infraestructura transversal (layout, cliente HTTP, guard de rutas, RBAC,
> datos simulados). Se admite además que `shared/panels/` aloje **UI de
> negocio reutilizable** — paneles usados por dos o más features (p. ej.
> `IntervencionesPanel.jsx` y `RemisionesPanel.jsx`, que comparten la Ficha
> 360° y las páginas standalone de `/intervenciones` y `/remisiones`). Es la
> aplicación directa de la regla "si dos features comparten algo, sube a
> `shared/`": el panel vive en `shared/` justamente para que ninguna feature
> importe de otra. Condición: estos paneles no pueden depender de ninguna
> feature específica.

## Qué ya está migrado de verdad

Las 10 features están completas, no solo enrutadas — cada pantalla trae el
mismo formulario, tabla y lógica del mockup original, ahora contra la API
real (nada vive ya solo en `localStorage` salvo lo que es legítimamente
por-dispositivo, como el borrador de intervenciones):

- **Autenticación**: login por selección de rol, igual UX que
  `index.html`.
- **Monitoreo**: KPIs, barra de filtros y las dos gráficas Chart.js de
  `dashboard.html`. La de "Semaforización por Campos de Riesgo" ya no usa
  los números inventados del mockup: se calcula de verdad agregando los
  envíos reales de Caracterización (`GET /api/dashboard/riesgo-dimensiones`)
  y muestra "aún sin datos" mientras no haya ninguno.
- **Seguimiento Estudiantil (Ficha 360°)**: buscador, encabezado del
  perfil, semaforización por dimensiones (calculada de `puntajesCampo`,
  no "quemada" como en el mockup) y la línea de tiempo de intervenciones
  con la confidencialidad VBG ya resuelta por el backend.
- **Alertas Tempranas**: formulario de alerta manual + registro
  activo, con acción directa "Iniciar Atención" hacia Intervenciones.
- **Intervenciones**: formulario de proceso de escucha con auto-guardado
  de borrador (en `localStorage` — legítimo: es conveniencia
  por-dispositivo), dropzone de evidencias PDF (clic o arrastrar, máx.
  5MB) y casilla de caso VBG.
- **Remisiones**: formulario de canalización y bandeja con modal
  "Gestionar Estado" para el flujo Generada → Recibida/Asignada → En
  Atención → Atendida.
- **Caracterización**: el instrumento oficial completo — 34 ítems en 5
  dimensiones, barra de progreso en vivo y el motor de riesgo, que en el
  mockup corría solo en el navegador y nunca se guardaba; acá corre en el
  servidor (`features/caracterizacion/instrumento.js`, la fuente de
  verdad) y cada envío se persiste.
- **Actividades VEC**: catálogo institucional, registros vinculados a
  participantes, filtro por actividad/periodo y búsqueda de asistentes.
  La administración consulta jornadas en PostgreSQL, permite crear/editar y
  cambiar su estado con auditoría. La creación permite escribir el nombre de
  la actividad y seleccionar la ubicación entre Campus Centro, Campus San
  Damián y Campus Santiago. Las actividades creadas manualmente también quedan
  disponibles al registrar participantes; las opciones del catálogo
  institucional permanecen separadas. En la administración y al registrar
  participantes, los programas aparecen numerados según su primera aparición
  en «Sis bienestar»; los que tienen variables o modalidades se muestran una
  sola vez como programa general y despliegan sus opciones al seleccionarlos.
  Se puede elegir una o varias modalidades reales (la fila general no aparece
  como modalidad adicional); el sistema muestra y completa automáticamente
  componente, línea de acción, tipo de apoyo y estrategias institucionales
  asociadas. Cada modalidad conserva su tipo de apoyo correspondiente. El
  catálogo propio de este módulo se guarda en `sat.apoyos_actividades_vec`, separado del catálogo
  general. La búsqueda de personas e historial reutilizan las
  identidades y participaciones institucionales. El registro permite el flujo
  individual y la carga masiva de hojas de cálculo por actividad. Al inscribir en una jornada con
  modalidades, se elige la variable o modalidad de cada persona y se guarda el
  tipo de apoyo asociado; si la jornada tiene una sola modalidad, se asigna
  automáticamente. Esta elección está disponible en el registro individual,
  por fila en la carga masiva y al crear perfiles de personas no encontradas.
  En el registro individual se puede seleccionar estudiante, egresado,
  colaborador o externo; si la identificación ya corresponde a una persona con
  otros roles compatibles, se solicita confirmar el rol adicional antes de
  guardar. El rol Externo permanece exclusivo y se valida también en el servidor.
  El servidor valida la modalidad y su apoyo asociado antes de guardar cada
  inscripción. La carga masiva admite estudiantes, egresados, colaboradores y externos. En el archivo se
  debe indicar el rol de cada fila en una columna «Rol de participante»
  (también se reconocen encabezados equivalentes); si no se incluye, se mantiene
  la compatibilidad y se interpreta como estudiante. Las filas con rol
  «Egresado» se guardan como perfiles VEC y se sincronizan con `sat.egresados`
  mediante la migración `server/src/features/actividades/participantes_roles.sql`,
  aplicada con `npm --prefix server run db:roles-participantes`. La carga masiva
  permite elegir la actividad y, si tiene modalidades de Bienestar, seleccionar
  una modalidad predeterminada para toda la carga antes de subir el archivo.
  También se puede asignar o cambiar por participante antes de confirmar; el
  apoyo vinculado se guarda en cada inscripción. Se reconoce una columna
  opcional «Apoyo» con el nombre de la modalidad. Si el valor del archivo
  coincide con varias modalidades, se debe elegir la opción correcta
  manualmente. El archivo puede contener documento o código institucional para
  buscar a la persona; los nombres y apellidos son opcionales, pues se consultan
  en los registros institucionales. No se usa el correo del Excel para validar
  personas. Se reconocen alias de encabezado
  comunes, incluyendo «Código», «Código institucional» y «Código estudiante»,
  y encabezados ubicados en las primeras 20 filas de cualquiera de las hojas;
  la comparación de nombres no depende del orden de nombres y apellidos. Si no
  hay encabezados, se intenta detectar una columna de identificadores. Se
  aceptan `.xlsx`, `.xls`, `.xlsm`, `.xlsb`, `.ods`, `.csv` y `.tsv`, sin
  necesitar una plantilla fija. La validación se centra en la coincidencia de
  nombre, cédula y código institucional con el registro institucional cuando
  corresponda; fechas y otros datos de la hoja no se exigen ni generan errores.
  Las personas no
  encontradas se muestran en una tabla aparte y pueden crearse con el rol
  indicado, individualmente o en lote para egresados, colaboradores y externos.
  La creación masiva es opcional por rol, usa los datos personales obligatorios
  de la plantilla y registra cada perfil en su tabla relacionada y en la
  actividad seleccionada; cada fila se procesa de forma independiente. Las
  filas repetidas y las personas ya inscritas se omiten
  conservando una sola aparición. Los participantes válidos pueden registrarse
  aunque haya identificadores no encontrados, con un máximo de 500 filas por
  archivo. Los resultados se procesan con un punto de recuperación por fila:
  las inscripciones exitosas se conservan aunque otra fila falle. El registro
  consulta datos institucionales y solo completa
  campos vacíos; no sobrescribe los valores existentes de personas,
  estudiantes, usuarios o docentes. La migración
  `server/src/features/actividades/administracion_actividades.sql` extiende
  `sat.actividades_vec` y crea su auditoría; se aplica con
  `npm --prefix server run db:actividades`. Los perfiles de colaboradores,
  egresados y externos se mantienen en tablas separadas vinculadas a
  `sat.participantes_vec`; se sincronizan con sus roles y la base impide que
  un externo tenga otros roles. Se aplican con
  `npm --prefix server run db:roles-participantes`. Desde Resumen, los perfiles
  de Egresado, Colaborador o Externo también se pueden importar por Excel/CSV,
  seleccionando un único rol para todo el archivo y relacionando encabezados
  flexibles sin una plantilla fija. Esta carga crea o vincula perfiles VEC sin
  inscribir personas en actividades; antes de agregar un rol a una persona ya
  registrada solicita confirmación explícita. Los roles repetidos y los
  conflictos de exclusividad de Externo se omiten. La carga masiva lista jornadas
  registradas de todos los periodos y fechas; las canceladas se muestran, pero
  no se pueden seleccionar. Al crear jornadas desde Administración o desde el
  registro se permiten fechas pasadas, siempre que la fecha final no sea
  anterior a la inicial. La creación desde «Administrar
  actividades» y la programación desde el registro de participantes usan el
  mismo guardado transaccional de jornadas en `sat.actividades_vec`, con su
  referencia al catálogo, modalidades y auditoría. Cada modalidad seleccionada
  se conserva además en `sat.actividades_vec_modalidades`, ligada al tipo de
  apoyo activo que corresponde en el catálogo de Bienestar; al inscribir a un
  participante se guardan el apoyo y la modalidad exacta en
  `sat.actividades_vec_participantes`. La lista de participantes muestra el
  programa/modalidad y el apoyo asignado en columnas separadas.
  `npm --prefix server run db:actividades` crea esta relación, completa las
  modalidades históricas que se puedan vincular sin ambigüedad y agrega la
  columna de modalidad a cada inscripción; ejecuta el comando para aplicar el
  cambio antes de usar la nueva versión del servidor.
  «Administrar actividades» permite borrar jornadas de forma permanente, con
  confirmación; las inscripciones, modalidades y auditorías vinculadas se
  eliminan en cascada, pero no se borran personas ni perfiles de estudiantes.
  El API expone `DELETE /api/actividades/participantes/eventos/:id`, protegido
  para administradores y coordinadores. Desde la lista de participantes de una
  actividad también se puede eliminar una inscripción; el perfil VEC y su rol
  solo se eliminan si no tiene otras inscripciones y no es un perfil de
  estudiante. Los datos de `sat.personas` solo se eliminan cuando no quedan
  otros perfiles, fuentes institucionales ni referencias; en caso contrario se
  conservan. La eliminación requiere confirmación e incluye las auditorías
  asociadas a la inscripción.
  La exportación genera un libro `.xlsx` de consulta con únicamente las hojas
  de colaboradores, estudiantes, egresados y externos; excluye las bases,
  hojas de apoyo, validaciones de captura y macros de la plantilla.
  La verificacion de listas fisicas usa
  `server/src/features/actividades/verificacion_elegibilidad.sql`, aplicada a
  la base conectada; anade marcas de asistencia desactivadas por defecto. La
  restricción única actividad-participante evita inscripciones repetidas en una
  misma sesión. Los perfiles de estudiantes, egresados, colaboradores y externos
  se registran según el rol de cada persona; la columna de rol es opcional en
  archivos antiguos y, si falta, se conserva el valor predeterminado de estudiante.
  La verificación se encuentra en «Asistencia y reportes»: se selecciona la
  actividad, periodo y jornada; luego se puede comparar un Excel `.xlsx` con
  documentos pegados o confirmar cada asistente en el checklist. El archivo se
  procesa localmente y solo se verifican personas ya inscritas en esa jornada.
  «Consultar apoyos» consulta los beneficiarios registrados en las tablas
  institucionales y conserva el catálogo de tipos de apoyo.
  En «Registrar participante», el formulario permite escoger una jornada futura
  ya registrada y precarga su actividad, periodo y fechas. Si todavía no hay
  jornadas futuras, se puede programar la primera desde el catálogo institucional;
  los registros posteriores con la misma actividad, periodo y fechas se vinculan
  a esa misma jornada. La consulta por identificación reutiliza los datos
  personales y académicos disponibles en `sat.personas`, `sat.estudiantes`,
  `sat.matriculas`, `sat.usuarios`, `sat.docentes` y `sat.participantes_vec`,
  completando campos vacíos desde esas fuentes sin modificar usuarios ni roles
  institucionales. La búsqueda
  solo acepta estudiantes académicos o perfiles VEC ya registrados como
  estudiantes. Los registros históricos de otros tipos se conservan para
  consulta y reportes, pero no se pueden crear desde este módulo. Los campos sin
  dato muestran «No aplica»; se mantienen los
  campos de la plantilla Excel y se omiten los datos de perfil no relacionados
  con ese registro.
  El reporte Excel de asistentes respeta las cuatro hojas y columnas de la
  plantilla institucional, prioriza el orden de los tipos de apoyo (1 a 5) y
  muestra «No aplica» cuando un campo del reporte no tiene dato. El periodo se
  presenta en el encabezado del libro, no en la columna «Tipo actividad».
  La base conectada ya tiene aplicada la migracion de asistencia; para una
  nueva instalacion ejecuta `server/src/features/actividades/verificacion_elegibilidad.sql`.

- **Reportes y SNIES**: las 3 exportaciones CSV reales (SNIES/MEN,
  Intervenciones, Remisiones) descargadas desde datos reales del backend,
  más el generador de informes filtrado.
- **Administración**: banner de sincronización académica, alta y
  baja de usuarios, umbrales de riesgo editables y la
  matriz de roles y permisos servida real.
- **Layout general** (`shared/layout`): extraído para no repetir el HTML
  del sidebar/topbar en cada página, como pasaba en cada `.html`.
- **Control de acceso por rol**: `shared/config/menuConfig.js` en
  el cliente y `shared/data/menuConfig.js` en el servidor (deben
  reflejarse exactamente igual entre sí), más `shared/middleware/requireRole.js`
  que protege cada endpoint de cada feature.
- **Confidencialidad VBG**: `shared/security/vbg.js` sanea el
  detalle sensible en el propio backend si el rol activo no está
  autorizado — la usan `alertas-tempranas`, `intervenciones` y la línea de
  tiempo de `seguimiento-estudiantil` (una sola regla, un solo lugar).
- **Datos simulados**: `mock-data.js` se portó a `server/src/shared/data/mockData.js`
  y el servidor lo sirve por API; los envíos de Caracterización y los
  umbrales de riesgo ya se persisten ahí también.

## Qué queda pendiente

Además de los puntos abiertos marcados con `// TODO`, Actividades VEC tiene
estos pendientes de conexión/datos:

- Dos actividades importadas del Excel no tienen proyecto. El registro de
  participantes desde el catálogo institucional no las permite seleccionar
  porque el esquema exige ese campo; se debe completar el proyecto correcto
  desde la fuente institucional. La administración puede programar una jornada
  escribiendo manualmente el nombre de la actividad.

Otros puntos abiertos del proyecto:

- **"Editar usuario"** en Administración es un botón de marcador — falta la pantalla de edición de permisos.
- No hay **autenticación real** (contraseñas/JWT): el login sigue siendo
  "de mockup" por selección de rol, documentado como tal en
  `server/src/shared/middleware/requireRole.js`.
- Los **adjuntos PDF** se validan (tipo y tamaño) y se listan, pero no se
  suben a un storage real — solo se guarda su nombre/tamaño, igual que en
  el mockup.

## Cómo correrlo en VS Code

```bash
cd sat-unicesmag
npm install          # instala client y server (usa workspaces)
npm run dev           # levanta server (puerto 4000) y client (puerto 5173) juntos
```

Abre `http://localhost:5173`. El cliente llama al backend en
`http://localhost:4000/api` (configurable en `client/.env` con
`VITE_API_URL`).

## Configuración de variables de entorno

Ninguna de las dos carpetas trae un `.env` real versionado (están en
`.gitignore`, junto con cualquier `.env.*` salvo `.env.example`). Antes de
correr el proyecto, copia las plantillas y rellénalas con valores reales:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

- **`server/.env`**:
  - `PORT`, `CLIENT_ORIGIN` — puerto del backend y origen permitido por CORS. Obligatorias.
  - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — conexión a PostgreSQL (schema `sat`, `shared/db/pool.js`). Obligatorias.
  - `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` (o los alias `EMAIL_USER`/`EMAIL_PASS`), y como alternativa `GMAIL_USER`/`GMAIL_PASS` — envío del código OTP a estudiantes (`shared/services/emailService.js`). Opcionales: sin ellas, el OTP solo se imprime en la consola del servidor.
  - `ACADEMIC_DB_HOST`, `ACADEMIC_DB_PORT`, `ACADEMIC_DB_NAME`, `ACADEMIC_DB_USER`, `ACADEMIC_DB_PASSWORD` — conexión a la base de datos académica institucional para la sincronización (`shared/services/syncService.js`, `autoSyncScheduler.js`). **`ACADEMIC_DB_HOST`, `ACADEMIC_DB_USER` y `ACADEMIC_DB_PASSWORD` son obligatorias**: el código ya no tiene ningún valor de respaldo (antes sí lo tenía, era un riesgo de seguridad ya corregido) — si faltan, la sincronización lanza un error en vez de conectarse con datos incorrectos.
- **`client/.env`**: solo `VITE_API_URL` (opcional, por defecto `http://localhost:4000/api`).

**No hardcodear credenciales reales en el código como valor de respaldo**
(`process.env.X || "valor-real"`) — usa siempre la variable de entorno y,
si hace falta un valor por defecto, que sea uno de desarrollo inofensivo.

Si prefieres correrlos por separado: `npm run dev:server` y
`npm run dev:client` en dos terminales.
