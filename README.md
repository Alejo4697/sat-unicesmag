# SAT-UNICESMAG — Sistema de Alertas Tempranas

Sistema de Alertas Tempranas y Permanencia Estudiantil de la **Universidad CESMAG**.  
Arquitectura modular full-stack organizada bajo el estándar **RUAH V2**, separando estrictamente responsabilidades entre **Rutas**, **Controladores**, **Servicios** y **Base de Datos** en el backend, y módulos con **Páginas**, **Componentes** y **Servicios** en el frontend.

---

## 🏛️ Arquitectura General

```
sat-unicesmag/
├── back/                        # Backend Node.js + Express + PostgreSQL
│   ├── index.js                 # Punto de entrada / arranque del servidor HTTP
│   ├── app.js                   # Configuración de Express, middlewares y montaje de rutas /api
│   ├── middlewares/             # Middlewares globales (identificación JWT, RBAC por rol y módulo)
│   ├── database/                # Conexión pool PostgreSQL y scripts SQL de migraciones
│   └── App/
│       ├── routes/              # Definición de rutas Express y control de acceso (Middlewares)
│       │   └── <modulo>/
│       │       └── <modulo>.route.js
│       └── src/                 # Lógica de la aplicación dividida en controladores y servicios
│           ├── <modulo>/
│           │   └── <entidad>/
│           │       ├── <entidad>.controller.js   # Manejo de req, res y códigos HTTP
│           │       ├── <entidad>.service.js      # Lógica de negocio, consultas SQL y transacciones
│           │       └── <entidad>.utils.js        # Utilidades puras de la entidad
│           ├── shared/          # Lógica transversal compartida (seguridad, menú, sincronización)
│           └── utils/           # Utilidades y formateadores globales
│
├── front/                       # Frontend SPA (React + Vite)
│   ├── index.html               # Entry point HTML
│   ├── vite.config.js           # Configuración de Vite y alias de importación (@pages, @services, etc.)
│   └── src/
│       ├── main.jsx             # Punto de montaje React
│       ├── App.jsx              # Router principal y proveedores de contexto
│       ├── pages/               # Vistas organizadas por módulo de negocio
│       │   └── <modulo>/
│       │       ├── index.js     # Barril de exportación pública del módulo
│       │       └── <pantalla>/
│       │           ├── <Pantalla>.jsx          # Vista / Componente principal
│       │           ├── <Pantalla>.service.js   # Consumo de API del módulo
│       │           ├── use<Pantalla>.js        # Estado y lógica (Hooks)
│       │           └── components/             # Subcomponentes específicos de la pantalla
│       ├── components/          # Componentes y layouts compartidos (AppLayout, Sidebar, Topbar, Modales)
│       ├── contexts/            # Contextos React globales (AuthContext para sesión y roles)
│       ├── hooks/               # Custom hooks reutilizables
│       ├── routes/              # Configuración de rutas y guards (ProtectedRoute)
│       ├── services/            # Cliente HTTP base (client.js con baseURL e interceptores)
│       ├── themes/              # Estilos, variables CSS y temas institucionales
│       └── utils/               # Funciones auxiliares y formateadores
│
├── docs/                        # Documentación técnica, manuales y especificaciones
├── docker-compose.yml           # Orquestación de contenedores (Frontend, Backend, Base de Datos)
└── README.md                    # Este documento
```

---

## ⚙️ Backend — Patrón MVC Modular (Ruta → Controlador → Servicio → BD)

El backend sigue rigurosamente el estándar modular:

1. **Rutas (`back/App/routes/<modulo>/<modulo>.route.js`):**  
   Declaran los endpoints HTTP (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) y aplican los middlewares de autenticación (`identifyUser`) y autorización (`requireModule`, `requireRole`). Delegan inmediatamente la ejecución al **Controlador**.

2. **Controladores (`back/App/src/<modulo>/<entidad>/<entidad>.controller.js`):**  
   Extraen y validan parámetros de entrada (`req.params`, `req.query`, `req.body`), invocan los métodos del **Servicio**, y estructuran la respuesta HTTP (`res.json()`, `res.status(201)`, `res.status(404)`, etc.) manejando errores con `next(err)`.

3. **Servicios (`back/App/src/<modulo>/<entidad>/<entidad>.service.js`):**  
   Encapsulan la lógica de negocio, validaciones complejas de dominio, transacciones y consultas SQL directas a PostgreSQL (`pool.query`). No tienen acceso directo a los objetos `req` o `res`.

### Módulos del Backend

| Módulo | Ruta Express | Controlador | Servicio | Responsabilidad |
|---|---|---|---|---|
| **autenticacion** | `autenticacion.route.js` | `auth.controller.js` | `auth.service.js` | Login institucional, JWT, cambio de contraseña |
| **menu** | `menu.route.js` | `menu.controller.js` | `menu.service.js` | Menú dinámico filtrado por permisos y roles |
| **monitoreo** | `monitoreo.route.js` | `dashboard.controller.js` | `dashboard.service.js` | Tablero de mando, métricas y gráficas institucionales |
| **seguimientoEstudiantil** | `seguimientoEstudiantil.route.js` | `estudiantes.controller.js` | `estudiantes.service.js` | Ficha 360° del estudiante, historial y alertas |
| **estudiante** | `estudiante.route.js` | `estudiante.controller.js` | `estudiante.service.js` | Vista y portal del estudiante |
| **alertasTempranas** | `alertasTempranas.route.js` | `alertas.controller.js` | `alertas.service.js` | Registro, semaforización y gestión de alertas |
| **intervenciones** | `intervenciones.route.js` | `intervenciones.controller.js` | `intervenciones.service.js` | Planes de acción, compromisos y seguimiento |
| **remisiones** | `remisiones.route.js` | `remisiones.controller.js` | `remisiones.service.js` | Casos remitidos a dependencias internas |
| **caracterizacion** | `caracterizacion.route.js` | `caracterizacion.controller.js` | `caracterizacion.service.js` | Instrumento de caracterización sociodemográfica |
| **actividades** | `actividades.route.js` | `actividades.controller.js` | `actividades.service.js` | Eventos de Bienestar Institucional, VEC y asistencias |
| **reportesSnies** | `reportesSnies.route.js` | `reportes.controller.js` | `reportes.service.js` | Informes de permanencia y exportación SNIES |
| **administracion** | `administracion.route.js` | `administracion.controller.js` | `administracion.service.js` | Usuarios, sincronización, roles y umbrales de riesgo |
| **catalogos** | `catalogos.route.js` | `catalogos.controller.js` | `catalogos.service.js` | Catálogos institucionales maestros |

---

## 💻 Frontend — Organización Modular por Módulos y Pantallas

En el frontend cada módulo de negocio tiene su espacio bajo `front/src/pages/<modulo>/`:

- `<modulo>/index.js`: Expone limpiamente las pantallas del módulo hacia las rutas principales.
- `<modulo>/<pantalla>/<Pantalla>.jsx`: Componente de vista puro.
- `<modulo>/<pantalla>/<Pantalla>.service.js`: Funciones de consumo API específicas para esa vista.
- `<modulo>/<pantalla>/components/`: Subcomponentes reutilizables exclusivamente en esa pantalla.

### Alias de Importación (Vite)
Se configuraron alias en `vite.config.js` para evitar rutas relativas profundas (`../../..`):
- `@pages` → `front/src/pages`
- `@components` → `front/src/components`
- `@hooks` → `front/src/hooks`
- `@services` → `front/src/services`
- `@contexts` → `front/src/contexts`
- `@routes` → `front/src/routes`
- `@themes` → `front/src/themes`
- `@utils` → `front/src/utils`
- `@shared` → `front/src/shared`

---

## 🚀 Comandos de Ejecución

### 1. Requisitos Previos
- **Node.js** (v18 o superior)
- **PostgreSQL** (v14 o superior)
- **Docker & Docker Compose** (opcional para ejecución en contenedores)

### 2. Desarrollo Local

#### Backend:
```bash
cd back
npm install
npm run dev
# Servidor escuchando en http://localhost:5000 (o puerto asignado en .env)
```

#### Frontend:
```bash
cd front
npm install
npm run dev
# Servidor de desarrollo Vite en http://localhost:5173
```

#### Compilación de Producción (Frontend):
```bash
cd front
npm run build
```

### 3. Ejecución con Docker
```bash
# Construir y levantar todos los servicios en segundo plano
docker compose up -d --build

# Ver logs de los servicios
docker compose logs -f

# Detener los servicios
docker compose down
```

---

## 👥 Roles de Usuario del Sistema
El sistema cuenta con control de acceso basado en roles (RBAC) y matriz configurable de permisos por módulo:
- `admin` / `administrador`: Acceso global al sistema, gestión de usuarios, catálogos y sincronización.
- `coordinador`: Monitoreo general, asignación de casos, reportería y alertas.
- `profesional`: Gestión de intervenciones, seguimiento de casos y remisiones.
- `docente`: Notificación de alertas tempranas y asistencia a actividades.
- `estudiante`: Consulta de ficha personal, actividades y citas.
- `reporte_actividades`: Registro de asistencias y eventos de Bienestar Universitario.
