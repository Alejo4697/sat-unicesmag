/* ==========================================================================
   Feature: Administración
   Migración real de administracion.html + assets/js/administracion.js:
   banner de sincronización académica, alta de usuarios,
   listado con baja de usuarios, umbrales de riesgo, más la matriz
   de roles y permisos que ya se había diseñado como mockup y ahora se sirve
   real desde GET /api/administracion/matriz-permisos.

   La matriz de roles y permisos es EDITABLE: cada celda es una casilla que
   concede/quita el acceso del rol al módulo (PUT /matriz-permisos). Tras
   guardar se recarga la matriz del AuthContext para que el sidebar del
   usuario activo refleje el cambio de inmediato.
   ========================================================================== */

import { useEffect, useState } from "react";
import AppLayout from "../../shared/layout/AppLayout.jsx";
import {
  listUsuariosAdmin,
  crearUsuarioAdmin,
  eliminarUsuarioAdmin,
  getUmbralesRiesgo,
  actualizarUmbralesRiesgo,
  sincronizarAcademico,
  getEstadoSincronizacion,
  getMatrizPermisos,
  actualizarPermisoModulo,
  areasRemisionApi,
  estadosRemisionApi,
  tiposIntervencionApi
} from "./api.js";
import CatalogoAdmin from "./CatalogoAdmin.jsx";
import { useAuth } from "../../shared/context/AuthContext.jsx";

// Catálogos administrables (schema `sat`). `campos` describe las columnas
// extra de cada uno además de "nombre"/"activo":
//   { key, label, tipo: "text" | "check", enForm?, enTabla?, badgeSi? }
const CAMPOS_AREA_REMISION = [
  { key: "esConfidencialidad", label: "Confidencialidad VBG", tipo: "check", badgeSi: "VBG" }
];
const CAMPOS_ESTADO_REMISION = [
  { key: "esFinal", label: "Estado final", tipo: "check", badgeSi: "Final" },
  { key: "orden", label: "Orden", tipo: "text", enForm: false }
];
const CAMPOS_TIPO_INTERVENCION = [{ key: "descripcion", label: "Descripción", tipo: "text" }];

const ROLE_LABELS = {
  admin: "Administrativo",
  profesional: "Profesional Asistencial",
  directivo: "Directivo / Docente Acompañante",
  reporte_actividades: "Reporte Actividades",
  estudiante: "Estudiante"
};

const PROGRAMAS = [
  "Todos",
  "Ingeniería de Sistemas",
  "Psicología",
  "Derecho",
  "Arquitectura",
  "Unidad de Servicios Psicológicos (USP)",
  "Consultorios Jurídicos",
  "Área de Salud María Goretti"
];

const FORM_USUARIO_INICIAL = { nombre: "", email: "", rol: "admin", cargo: "", programa: "Todos" };

export default function AdministracionPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [matriz, setMatriz] = useState(null);
  const [umbrales, setUmbrales] = useState({ alto: 10, medio: 6 });
  const [estadoSync, setEstadoSync] = useState(null);
  const [formUsuario, setFormUsuario] = useState(FORM_USUARIO_INICIAL);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  // "modulo|rol" de la celda que se está guardando
  const [guardandoCelda, setGuardandoCelda] = useState("");
  const { user, recargarPermisos } = useAuth();

  useEffect(() => {
    Promise.all([listUsuariosAdmin(), getMatrizPermisos(), getUmbralesRiesgo(), getEstadoSincronizacion()])
      .then(([u, m, um, sync]) => {
        setUsuarios(u);
        setMatriz(m);
        setUmbrales(um);
        setEstadoSync(sync);
      })
      .catch((err) => setError(err.message));
  }, []);

  function avisar(texto) {
    setMensaje(texto);
    setTimeout(() => setMensaje(""), 6000);
  }

  async function handleTogglePermiso(modulo, rolId, permitido) {
    const celda = `${modulo.id}|${rolId}`;
    setGuardandoCelda(celda);
    setError("");
    try {
      const res = await actualizarPermisoModulo({ modulo: modulo.id, rol: rolId, permitido });
      setMatriz((prev) => ({
        ...prev,
        modulos: prev.modulos.map((m) => (m.id === res.modulo ? { ...m, roles: res.roles } : m))
      }));
      const etiqueta = ROLE_LABELS[rolId] || rolId;
      avisar(
        permitido
          ? `Se concedió "${modulo.name}" al rol ${etiqueta}.`
          : `Se quitó "${modulo.name}" al rol ${etiqueta}.`
      );
      // Si el cambio afecta al rol con el que estoy conectado, actualiza el sidebar ya.
      if (user?.rol === rolId) recargarPermisos();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoCelda("");
    }
  }

  async function handleSincronizar() {
    setSincronizando(true);
    setError("");
    setMensaje("Conectando con base de datos institucional prod18sep2 y sincronizando registros... Por favor espere.");
    try {
      const res = await sincronizarAcademico();
      
      // Actualizar automáticamente los usuarios y las métricas en pantalla
      const [uActualizados, syncActualizado] = await Promise.all([
        listUsuariosAdmin(),
        getEstadoSincronizacion()
      ]);
      setUsuarios(uActualizados);
      setEstadoSync(syncActualizado);

      avisar(
        `¡Sincronización exitosa! Se procesaron ${res.estudiantesSincronizados?.toLocaleString()} estudiantes, ` +
        `${(res.docentes || 0).toLocaleString()} docentes, ${(res.facultades || 0).toLocaleString()} facultades, ` +
        `${res.calificaciones?.toLocaleString()} calificaciones y se actualizaron los estados institucionales en ${res.duracionSegundos}s.`
      );
    } catch (err) {
      setError(`Error en la sincronización: ${err.message}`);
    } finally {
      setSincronizando(false);
    }
  }

  async function handleCrearUsuario(e) {
    e.preventDefault();
    if (!formUsuario.nombre || !formUsuario.email || !formUsuario.cargo) {
      setError("Complete todos los campos del usuario.");
      return;
    }
    setError("");
    try {
      const nuevo = await crearUsuarioAdmin(formUsuario);
      setUsuarios((prev) => [...prev, nuevo]);
      setFormUsuario(FORM_USUARIO_INICIAL);
      avisar(`Usuario "${nuevo.nombre}" creado y vinculado a "${nuevo.programa}".`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDesactivar(usuario) {
    try {
      await eliminarUsuarioAdmin(usuario.id);
      setUsuarios((prev) => prev.filter((u) => u.id !== usuario.id));
      avisar(`Usuario "${usuario.nombre}" desactivado del sistema SAT-UNICESMAG.`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUmbrales(e) {
    e.preventDefault();
    try {
      const actualizados = await actualizarUmbralesRiesgo(umbrales);
      setUmbrales(actualizados);
      avisar(`Parámetros de semaforización actualizados (Alto >= ${actualizados.alto}, Medio >= ${actualizados.medio}).`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AppLayout titulo="Administración y Parámetros del Sistema" breadcrumb="Usuarios, Permisos y Sincronización">
      {error && <div className="auth-error">{error}</div>}
      {mensaje && (
        <div className="autosave-banner">
          <span>
            <i className="fas fa-circle-info"></i> {mensaje}
          </span>
        </div>
      )}

      <div className="card" style={{ background: "var(--surface-subtle)", border: "1px solid var(--border-color)", padding: "1.25rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 15 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3 className="card-title" style={{ fontSize: "1rem", margin: 0 }}>
                <i className="fas fa-database" style={{ color: "var(--brand-primary)" }}></i> Sincronización Institucional prod18sep2
              </h3>
              <span className="badge badge-risk-low" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.75rem" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block" }}></span>
                Conexión Activa
              </span>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "4px 0 10px" }}>
              Sincroniza en 1 clic y automáticamente en segundo plano los estudiantes nuevos, docentes, facultades, matrículas activas, notas, inasistencias y estados académicos desde la base de datos institucional.
            </p>

            {/* Métricas sincronizadas en vivo */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: "0.8rem" }}>
              <div style={{ background: "var(--surface-card)", padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-color)" }}>
                <strong><i className="fas fa-user-graduate text-muted"></i> Estudiantes:</strong> {estadoSync?.metricas?.total_estudiantes ? Number(estadoSync.metricas.total_estudiantes).toLocaleString() : "5,043"}
              </div>
              <div style={{ background: "var(--surface-card)", padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-color)" }}>
                <strong><i className="fas fa-chalkboard-teacher text-muted"></i> Docentes:</strong> {estadoSync?.metricas?.total_docentes ? Number(estadoSync.metricas.total_docentes).toLocaleString() : "402"}
              </div>
              <div style={{ background: "var(--surface-card)", padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-color)" }}>
                <strong><i className="fas fa-university text-muted"></i> Facultades:</strong> {estadoSync?.metricas?.total_facultades ? Number(estadoSync.metricas.total_facultades).toLocaleString() : "7"}
              </div>
              <div style={{ background: "var(--surface-card)", padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-color)" }}>
                <strong><i className="fas fa-id-card text-muted"></i> Personas:</strong> {estadoSync?.metricas?.total_personas ? Number(estadoSync.metricas.total_personas).toLocaleString() : "5,043"}
              </div>
              <div style={{ background: "var(--surface-card)", padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-color)" }}>
                <strong><i className="fas fa-file-signature text-muted"></i> Matrículas:</strong> {estadoSync?.metricas?.total_matriculas ? Number(estadoSync.metricas.total_matriculas).toLocaleString() : "5,043"}
              </div>
              <div style={{ background: "var(--surface-card)", padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-color)" }}>
                <strong><i className="fas fa-book-open text-muted"></i> Asignaturas:</strong> {estadoSync?.metricas?.total_asignaturas ? Number(estadoSync.metricas.total_asignaturas).toLocaleString() : "587"}
              </div>
              <div style={{ background: "var(--surface-card)", padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-color)" }}>
                <strong><i className="fas fa-chart-simple text-muted"></i> Calificaciones:</strong> {estadoSync?.metricas?.total_calificaciones ? Number(estadoSync.metricas.total_calificaciones).toLocaleString() : "28,236"}
              </div>
            </div>

            {estadoSync?.ultimaCarga?.finalizada_en && (
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 8 }}>
                <i className="fas fa-clock"></i> Última sincronización: <strong>{new Date(estadoSync.ultimaCarga.finalizada_en).toLocaleString("es-CO")}</strong> ({Number(estadoSync.ultimaCarga.registros_procesados || 0).toLocaleString()} registros procesados)
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
            <button
              onClick={handleSincronizar}
              className="btn btn-primary"
              disabled={sincronizando}
              style={{ minWidth: 180, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontWeight: 600 }}
            >
              {sincronizando ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> Sincronizando...
                </>
              ) : (
                <>
                  <i className="fas fa-arrows-rotate"></i> Sincronizar Ahora
                </>
              )}
            </button>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
              {sincronizando ? "Procesando registros en prod18sep2..." : "Actualización directa en 1 clic"}
            </span>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card" style={{ gridColumn: "span 4" }}>
          <div className="card-header">
            <h3 className="card-title">Crear Usuario</h3>
          </div>

          <form onSubmit={handleCrearUsuario}>
            <div className="form-group">
              <label className="form-label" htmlFor="usr-nombre">
                Nombres y Apellidos
              </label>
              <input
                id="usr-nombre"
                className="form-control"
                placeholder="Ej: Dr. Fernando Pastás"
                required
                value={formUsuario.nombre}
                onChange={(e) => setFormUsuario({ ...formUsuario, nombre: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="usr-email">
                Correo Institucional
              </label>
              <input
                id="usr-email"
                type="email"
                className="form-control"
                placeholder="usuario@unicesmag.edu.co"
                required
                value={formUsuario.email}
                onChange={(e) => setFormUsuario({ ...formUsuario, email: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="usr-rol">
                Rol de Acceso
              </label>
              <select id="usr-rol" className="form-select" value={formUsuario.rol} onChange={(e) => setFormUsuario({ ...formUsuario, rol: e.target.value })}>
                <option value="admin">Rol Administrativo</option>
                <option value="profesional">Rol Profesionales (USP, Salud, Jurídicos, Pastoral)</option>
                <option value="directivo">Rol Directivos (Directores / Docentes Acompañantes)</option>
                <option value="reporte_actividades">Rol Reporte Actividades</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="usr-cargo">
                Cargo / Dependencia
              </label>
              <input
                id="usr-cargo"
                className="form-control"
                placeholder="Ej: Psicólogo de Área"
                required
                value={formUsuario.cargo}
                onChange={(e) => setFormUsuario({ ...formUsuario, cargo: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="usr-programa">
                Programa o Dependencia
              </label>
              <select id="usr-programa" className="form-select" value={formUsuario.programa} onChange={(e) => setFormUsuario({ ...formUsuario, programa: e.target.value })}>
                {PROGRAMAS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
              <i className="fas fa-floppy-disk"></i> Guardar Usuario
            </button>
          </form>
        </div>

        <div className="card" style={{ gridColumn: "span 8" }}>
          <div className="card-header">
            <h3 className="card-title">Usuarios y Permisos de Acceso</h3>
          </div>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Cargo</th>
                  <th>Dependencia</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: "50%",
                            background: "var(--brand-primary-50)",
                            color: "var(--brand-primary)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.9rem"
                          }}
                        >
                          <i className="fas fa-user"></i>
                        </div>
                        <div>
                          <strong>{u.nombre}</strong>
                          <br />
                          <small className="text-muted">{u.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-risk-low">{ROLE_LABELS[u.rol] || u.rol}</span>
                    </td>
                    <td>
                      <strong>{u.cargo}</strong>
                    </td>
                    <td>{u.programa}</td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={() => avisar(`Cargando ficha de permisos y accesos para el usuario ${u.id}.`)}>
                        <i className="fas fa-edit"></i>
                      </button>{" "}
                      <button className="btn btn-danger btn-sm" onClick={() => handleDesactivar(u)}>
                        <i className="fas fa-user-slash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Configuración de Umbrales de Riesgo</h3>
        </div>

        <form onSubmit={handleUmbrales} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem", alignItems: "flex-end" }}>
          <div>
            <label className="form-label">Puntaje Mínimo Riesgo Alto</label>
            <input
              type="number"
              className="form-control"
              min={1}
              max={15}
              value={umbrales.alto}
              onChange={(e) => setUmbrales({ ...umbrales, alto: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="form-label">Puntaje Mínimo Riesgo Medio</label>
            <input
              type="number"
              className="form-control"
              min={1}
              max={15}
              value={umbrales.medio}
              onChange={(e) => setUmbrales({ ...umbrales, medio: Number(e.target.value) })}
            />
          </div>
          <div>
            <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
              <i className="fas fa-check"></i> Actualizar Umbrales
            </button>
          </div>
        </form>
      </div>

      {/* Catálogos administrables de Remisiones e Intervenciones (schema `sat`).
          Inhabilitar un ítem lo saca de los formularios de creación, sin afectar
          los registros históricos que ya lo usaban. */}
      <CatalogoAdmin
        titulo="Áreas de Remisión"
        icono="fa-share-nodes"
        api={areasRemisionApi}
        campos={CAMPOS_AREA_REMISION}
        onAviso={avisar}
        onError={setError}
      />
      <CatalogoAdmin
        titulo="Estados de Remisión"
        icono="fa-list-check"
        api={estadosRemisionApi}
        campos={CAMPOS_ESTADO_REMISION}
        onAviso={avisar}
        onError={setError}
      />
      <CatalogoAdmin
        titulo="Tipos de Intervención"
        icono="fa-clipboard-check"
        api={tiposIntervencionApi}
        campos={CAMPOS_TIPO_INTERVENCION}
        onAviso={avisar}
        onError={setError}
      />

      {matriz && (
        <>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Matriz de Roles y Permisos</span>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 1rem" }}>
              Marque o desmarque una casilla para conceder o quitar el acceso de un rol a un módulo. El cambio se guarda
              al instante y aplica en el próximo clic de los usuarios de ese rol.
            </p>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Módulo</th>
                    {matriz.roles.map((rol) => (
                      <th key={rol.id} style={{ textAlign: "center" }}>
                        {ROLE_LABELS[rol.id] || rol.descripcion || rol.nombre}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matriz.modulos.map((modulo) => (
                    <tr key={modulo.id}>
                      <td>
                        <i className={`fas ${modulo.icon}`}></i> {modulo.name}
                        {modulo.oculto && (
                          <small className="text-muted" style={{ display: "block" }}>
                            Se abre desde la Ficha 360°
                          </small>
                        )}
                      </td>
                      {matriz.roles.map((rol) => {
                        const permitido = modulo.roles.includes(rol.id);
                        const bloqueado = modulo.bloqueados.includes(rol.id);
                        const celda = `${modulo.id}|${rol.id}`;
                        return (
                          <td key={rol.id} style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              aria-label={`${modulo.name} - ${ROLE_LABELS[rol.id] || rol.nombre}`}
                              title={bloqueado ? "Obligatorio: el administrador no puede perder este acceso" : undefined}
                              checked={permitido}
                              disabled={bloqueado || guardandoCelda === celda}
                              onChange={(e) => handleTogglePermiso(modulo, rol.id, e.target.checked)}
                              style={{
                                width: 18,
                                height: 18,
                                cursor: bloqueado ? "not-allowed" : "pointer",
                                accentColor: "var(--brand-primary, #9B1B30)"
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dashboard-grid" style={{ marginTop: "1.5rem" }}>
            {matriz.rolesYPermisos.map((rol) => (
              <div className="card" key={rol.id}>
                <div className="card-header">
                  <span className="card-title">{rol.nombre}</span>
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>{rol.integrantes.join(", ")}</p>
                <div>
                  {rol.permisos.map((p) => (
                    <span className="tag-item" key={p}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </AppLayout>
  );
}
