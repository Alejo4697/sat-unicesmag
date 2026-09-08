/* ==========================================================================
   Rutas de la aplicación. Cada import viene de una carpeta de features/ -
   el árbol de imports "grita" qué hace el sistema (autenticación,
   monitoreo, seguimiento estudiantil, alertas tempranas, intervenciones,
   remisiones, caracterización, reportes, administración), no de qué
   framework está hecho.
   ========================================================================== */

import { Routes, Route } from "react-router-dom";

import ProtectedRoute from "./shared/routing/ProtectedRoute.jsx";

import LoginPage from "./features/autenticacion/LoginPage.jsx";
import DashboardPage from "./features/monitoreo/DashboardPage.jsx";
import FichaEstudiantePage from "./features/seguimiento-estudiantil/FichaEstudiantePage.jsx";
import AlertasPage from "./features/alertas-tempranas/AlertasPage.jsx";
import IntervencionesPage from "./features/intervenciones/IntervencionesPage.jsx";
import RemisionesPage from "./features/remisiones/RemisionesPage.jsx";
import CaracterizacionPage from "./features/caracterizacion/CaracterizacionPage.jsx";
import ReportesPage from "./features/reportes-snies/ReportesPage.jsx";
import AdministracionPage from "./features/administracion/AdministracionPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />

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

      <Route path="*" element={<LoginPage />} />
    </Routes>
  );
}
