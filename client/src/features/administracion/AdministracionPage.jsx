/* ==========================================================================
   Feature: Administración
   Migración real de administracion.html + assets/js/administracion.js:
   banner de sincronización académica (RQF08), alta de usuarios (RQF05),
   listado con baja de usuarios, umbrales de riesgo (RQF11), más la matriz
   de roles y permisos que ya se había diseñado como mockup y ahora se sirve
   real desde GET /api/administracion/matriz-permisos.
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
  getMatrizPermisos
} from "./api.js";

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
  const [formUsuario, setFormUsuario] = useState(FORM_USUARIO_INICIAL);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    Promise.all([listUsuariosAdmin(), getMatrizPermisos(), getUmbralesRiesgo()])
      .then(([u, m, um]) => {
        setUsuarios(u);
        setMatriz(m);
        setUmbrales(um);
      })
      .catch((err) => setError(err.message));
  }, []);

  function avisar(texto) {
    setMensaje(texto);
    setTimeout(() => setMensaje(""), 4000);
  }

  async function handleSincronizar() {
    setSincronizando(true);
    avisar("Conectando a base de datos institucional UNICESMAG...");
    try {
      const res = await sincronizarAcademico();
      avisar(`Se sincronizaron ${res.estudiantesSincronizados} estudiantes correctamente.`);
    } catch (err) {
      setError(err.message);
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
      avisar(`Parámetros de semaforización actualizados (Alto >= ${actualizados.alto}, Medio >= ${actualizados.medio}). (RQF11)`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AppLayout titulo="Administración y Parámetros del Sistema" breadcrumb="Usuarios, Permisos y Sincronización RQF05 RQF06">
      {error && <div className="auth-error">{error}</div>}
      {mensaje && (
        <div className="autosave-banner">
          <span>
            <i className="fas fa-circle-info"></i> {mensaje}
          </span>
        </div>
      )}

      <div className="card" style={{ background: "var(--surface-subtle)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 className="card-title" style={{ fontSize: "0.9rem", margin: 0 }}>
              <i className="fas fa-arrows-rotate"></i> Sincronización de Datos Académicos UNICESMAG (RQF08)
            </h3>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "3px 0 0" }}>
              Sincronización de matrículas activas, inasistencias y calificaciones del sistema institucional.
            </p>
          </div>
          <button onClick={handleSincronizar} className="btn btn-outline btn-sm" disabled={sincronizando}>
            <i className="fas fa-plug"></i> {sincronizando ? "Sincronizando..." : "Sincronizar Ahora"}
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card" style={{ gridColumn: "span 4" }}>
          <div className="card-header">
            <h3 className="card-title">Crear Usuario (RQF05)</h3>
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
                      <button className="btn btn-outline btn-sm" onClick={() => avisar(`Cargando ficha de permisos y accesos para el usuario ${u.id} (RQF06).`)}>
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
          <h3 className="card-title">Configuración de Umbrales de Riesgo (RQF11)</h3>
        </div>

        <form onSubmit={handleUmbrales} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem", alignItems: "flex-end" }}>
          <div>
            <label className="form-label">Puntaje Mínimo Riesgo Alto 🔴</label>
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
            <label className="form-label">Puntaje Mínimo Riesgo Medio 🟠</label>
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

      {matriz && (
        <>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Matriz de Roles y Permisos</span>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Módulo</th>
                    {Object.values(ROLE_LABELS).map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matriz.accesoModulos.map((section) =>
                    section.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <i className={`fas ${item.icon}`}></i> {item.name}
                        </td>
                        {Object.keys(ROLE_LABELS).map((roleId) => (
                          <td key={roleId} style={{ textAlign: "center" }}>
                            {section.roles.includes(roleId) ? (
                              <i className="fas fa-check" style={{ color: "var(--risk-low, #16A34A)" }}></i>
                            ) : (
                              <i className="fas fa-xmark" style={{ color: "var(--text-muted)" }}></i>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
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
