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
│       │   ├── config/         # menuConfig.js — qué módulos ve cada rol (RQF03)
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

Las 9 features están completas, no solo enrutadas — cada pantalla trae el
mismo formulario, tabla y lógica del mockup original, ahora contra la API
real (nada vive ya solo en `localStorage` salvo lo que es legítimamente
por-dispositivo, como el borrador de intervenciones):

- **Autenticación**: login por selección de rol (RQF03), igual UX que
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
- **Alertas Tempranas**: formulario de alerta manual (RQF15) + registro
  activo, con acción directa "Iniciar Atención" hacia Intervenciones.
- **Intervenciones**: formulario de proceso de escucha con auto-guardado
  de borrador (RQF04/RNF04, en `localStorage` — legítimo: es conveniencia
  por-dispositivo), dropzone de evidencias PDF (clic o arrastrar, máx.
  5MB, RQF16) y casilla de caso VBG.
- **Remisiones**: formulario de canalización (RQF17) y bandeja con modal
  "Gestionar Estado" para el flujo Generada → Recibida/Asignada → En
  Atención → Atendida (RQF18).
- **Caracterización**: el instrumento oficial completo — 34 ítems en 5
  dimensiones, barra de progreso en vivo y el motor de riesgo, que en el
  mockup corría solo en el navegador y nunca se guardaba; acá corre en el
  servidor (`features/caracterizacion/instrumento.js`, la fuente de
  verdad) y cada envío se persiste.
- **Reportes y SNIES**: las 3 exportaciones CSV reales (SNIES/MEN,
  Intervenciones, Remisiones) descargadas desde datos reales del backend,
  más el generador de informes filtrado.
- **Administración**: banner de sincronización académica (RQF08), alta y
  baja de usuarios (RQF05), umbrales de riesgo editables (RQF11) y la
  matriz de roles y permisos servida real.
- **Layout general** (`shared/layout`): extraído para no repetir el HTML
  del sidebar/topbar en cada página, como pasaba en cada `.html`.
- **Control de acceso por rol (RQF03)**: `shared/config/menuConfig.js` en
  el cliente y `shared/data/menuConfig.js` en el servidor (deben
  reflejarse exactamente igual entre sí), más `shared/middleware/requireRole.js`
  que protege cada endpoint de cada feature.
- **Confidencialidad VBG (RNF01)**: `shared/security/vbg.js` sanea el
  detalle sensible en el propio backend si el rol activo no está
  autorizado — la usan `alertas-tempranas`, `intervenciones` y la línea de
  tiempo de `seguimiento-estudiantil` (una sola regla, un solo lugar).
- **Datos simulados**: `mock-data.js` se portó a `server/src/shared/data/mockData.js`
  y el servidor lo sirve por API; los envíos de Caracterización y los
  umbrales de riesgo ya se persisten ahí también.

## Qué queda pendiente

Nada crítico está sin migrar, pero quedan puntos abiertos, marcados con
`// TODO` en el código:

- Los **filtros de "Reportes"** (periodo/programa/semestre/riesgo) son
  visuales — el botón "Generar Informe Filtrado" no recorta todavía el
  CSV exportado (igual que en el mockup original).
- **"Editar usuario"** en Administración es un botón de marcador
  (`RQF06`) — falta la pantalla de edición de permisos.
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

Si prefieres correrlos por separado: `npm run dev:server` y
`npm run dev:client` en dos terminales.
