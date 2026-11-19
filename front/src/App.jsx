/* ==========================================================================
   Rutas de la aplicación (SAT-UNICESMAG).
   Cada import viene del index de su módulo en pages/ según la arquitectura.
   ========================================================================== */

import { Routes, Route } from "react-router-dom";

import ProtectedRoute from "./routes/ProtectedRoute.jsx";

import { LoginPage } from "./pages/autenticacion/index.js";
import { EstudianteLoginPage, EstudiantePortalPage } from "./pages/estudiante/index.js";
import { DashboardPage } from "./pages/monitoreo/index.js";
import { FichaEstudiantePage } from "./pages/seguimientoEstudiantil/index.js";
import { AlertasPage } from "./pages/alertasTempranas/index.js";
import { IntervencionesPage } from "./pages/intervenciones/index.js";
import { RemisionesPage } from "./pages/remisiones/index.js";
import { CaracterizacionPage } from "./pages/caracterizacion/index.js";
import { ReportesPage } from "./pages/reportesSnies/index.js";
import { AdministracionPage } from "./pages/administracion/index.js";
import { ActividadesPage } from "./pages/actividades/index.js";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/estudiante/login" element={<EstudianteLoginPage />} />
      <Route
        path="/estudiante/portal"
        element={
          <ProtectedRoute moduleId="estudiante">
            <EstudiantePortalPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute moduleId="dashboard">
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ficha-estudiante"
        element={
          <ProtectedRoute moduleId="ficha">
            <FichaEstudiantePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/alertas"
        element={
          <ProtectedRoute moduleId="alertas">
            <AlertasPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/intervenciones"
        element={
          <ProtectedRoute moduleId="intervenciones">
            <IntervencionesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/remisiones"
        element={
          <ProtectedRoute moduleId="remisiones">
            <RemisionesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/caracterizacion"
        element={
          <ProtectedRoute moduleId="caracterizacion">
            <CaracterizacionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reportes"
        element={
          <ProtectedRoute moduleId="reportes">
            <ReportesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/administracion"
        element={
          <ProtectedRoute moduleId="administracion">
            <AdministracionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/actividades"
        element={
          <ProtectedRoute moduleId="actividades">
            <ActividadesPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<LoginPage />} />
    </Routes>
  );
}
