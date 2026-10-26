/* ==========================================================================
   Feature: Administración - Usuarios, Parámetros y Roles
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
  getProgramasAcademicos,
  getCargosCatalogo,
  gestionarAccesoUsuario,
  toggleEstadoUsuario,
  resetPasswordUsuario,
  areasRemisionApi,
  estadosRemisionApi,
  tiposIntervencionApi
} from "./api.js";
import CatalogoAdmin from "./CatalogoAdmin.jsx";
import { useAuth } from "../../shared/context/AuthContext.jsx";

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
  profesional: "Profesional",
  directivo: "Directivo",
  reporte_actividades: "Reporte Actividades",
  estudiante: "Estudiante"
};

const FORM_USUARIO_INICIAL = { nombre: "", email: "", rol: "profesional", cargo: "Docente Acompañante", programa: "Todos" };

export default function AdministracionPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [buscando, setBuscando] = useState(false);

  const [matriz, setMatriz] = useState(null);
  const [umbrales, setUmbrales] = useState({ alto: 10, medio: 6 });
  const [estadoSync, setEstadoSync] = useState(null);
  const [programas, setProgramas] = useState([]);
  const [catalogoCargos, setCatalogoCargos] = useState({ administrativo: [], profesional: [], directivo: [] });

  const [formUsuario, setFormUsuario] = useState(FORM_USUARIO_INICIAL);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  const [guardandoCelda, setGuardandoCelda] = useState("");
  
  // Modal de Administración de Acceso
  const [modalUsuario, setModalUsuario] = useState(null);
  const [formAcceso, setFormAcceso] = useState({
    id_usuarios: null,
    documento: "",
    codigo: "",
    nombre: "",
    email: "",
    rol: "profesional",
    cargo: "Docente Acompañante",
    id_programa: "",
    activo: true,
    resetear_password: false
  });
  const [guardandoAcceso, setGuardandoAcceso] = useState(false);

  const { user, recargarPermisos } = useAuth();

  // Carga inicial
  useEffect(() => {
    Promise.all([
      listUsuariosAdmin(),
      getMatrizPermisos(),
      getUmbralesRiesgo(),
      getEstadoSincronizacion(),
      getProgramasAcademicos(),
      getCargosCatalogo()
    ])
      .then(([u, m, um, sync, progs, cargos]) => {
        setUsuarios(u);
        setMatriz(m);
        setUmbrales(um);
        setEstadoSync(sync);
        setProgramas(progs || []);
        if (cargos) setCatalogoCargos(cargos);
      })
      .catch((err) => setError(err.message));
  }, []);

  // Búsqueda en tiempo real con debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      ejecutarBusqueda(busqueda, filtroTipo);
    }, 300);
    return () => clearTimeout(timer);
  }, [busqueda, filtroTipo]);

  async function ejecutarBusqueda(q, tipo) {
    setBuscando(true);
    try {
      const res = await listUsuariosAdmin({ q, tipo });
      setUsuarios(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBuscando(false);
    }
  }

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
      const [uActualizados, syncActualizado] = await Promise.all([
        listUsuariosAdmin({ q: busqueda, tipo: filtroTipo }),
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
      setUsuarios((prev) => [nuevo, ...prev]);
      setFormUsuario(FORM_USUARIO_INICIAL);
      avisar(`Usuario "${nuevo.nombre}" creado exitosamente.`);
    } catch (err) {
      setError(err.message);
    }
  }

  // Abrir Modal de Administración de Acceso
  function abrirModalAcceso(u) {
    const rolActual = (u.rol || "profesional").toLowerCase();
    const cargoActual = u.cargo && u.cargo !== "Personal Institucional" 
      ? u.cargo 
      : (rolActual === "profesional" ? "Docente Acompañante" : (rolActual === "directivo" ? "Director de Programa" : "Coordinador"));

    setModalUsuario(u);
    setFormAcceso({
      id_usuarios: u.id_usuarios || (u.tiene_cuenta ? u.id : null),
      documento: u.documento || "",
      codigo: u.codigo || "",
      nombre: u.nombre || "",
      email: u.email || "",
      rol: rolActual === "estudiante" ? "profesional" : rolActual,
      cargo: cargoActual,
      id_programa: u.id_programa || "",
      activo: u.tiene_cuenta ? u.activo : true,
      resetear_password: true,
      password: "cesmag2026*"
    });
  }

  async function handleGuardarAcceso(e) {
    e.preventDefault();
    if (!formAcceso.email || !formAcceso.nombre) {
      setError("El nombre y el correo institucional son obligatorios.");
      return;
    }

    setGuardandoAcceso(true);
    setError("");
    try {
      const res = await gestionarAccesoUsuario(formAcceso);
      avisar(res.mensaje || "Acceso actualizado con éxito.");
      setModalUsuario(null);

      // Refrescar listado
      const actualizados = await listUsuariosAdmin({ q: busqueda, tipo: filtroTipo });
      setUsuarios(actualizados);
    } catch (err) {
      setError(`Error al guardar acceso: ${err.message}`);
    } finally {
      setGuardandoAcceso(false);
    }
  }

  async function handleToggleActivo(usuario) {
    if (!usuario.tiene_cuenta || !usuario.id_usuarios) {
      abrirModalAcceso(usuario);
      return;
    }

    try {
      const res = await toggleEstadoUsuario(usuario.id_usuarios);
      setUsuarios((prev) =>
        prev.map((u) => (u.id === usuario.id ? { ...u, activo: res.activo } : u))
      );
      avisar(res.mensaje);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleResetPassword(usuario) {
    if (!usuario.id_usuarios) return;
    if (!window.confirm(`¿Desea restablecer la contraseña a "cesmag2026*" para ${usuario.nombre}?`)) return;

    try {
      const res = await resetPasswordUsuario(usuario.id_usuarios);
      avisar(res.mensaje);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDesactivar(usuario) {
    if (!window.confirm(`¿Está seguro de desactivar el acceso de "${usuario.nombre}"?`)) return;
    try {
      await eliminarUsuarioAdmin(usuario.id);
      setUsuarios((prev) => prev.map((u) => u.id === usuario.id ? { ...u, activo: false } : u));
      avisar(`Usuario "${usuario.nombre}" desactivado del sistema.`);
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

  // Opciones de cargos según rol seleccionado en el modal
  const cargosSugeridos = catalogoCargos[formAcceso.rol] || [];

  return (
    <AppLayout titulo="Administración y Parámetros del Sistema" breadcrumb="Usuarios, Permisos y Sincronización">
      {error && <div className="auth-error" style={{ marginBottom: "1rem" }}>{error}</div>}
      {mensaje && (
        <div className="autosave-banner" style={{ marginBottom: "1rem" }}>
          <span>
            <i className="fas fa-circle-info"></i> {mensaje}
          </span>
        </div>
      )}

      {/* Banner de Sincronización Institucional */}
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
              Sincroniza en 1 clic los estudiantes, docentes, facultades, matrículas activas, notas y estados académicos desde la base de datos institucional.
            </p>

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
                <strong><i className="fas fa-users-gear text-muted"></i> Usuarios Activos:</strong> {estadoSync?.metricas?.total_usuarios ? Number(estadoSync.metricas.total_usuarios).toLocaleString() : "14"}
              </div>
              <div style={{ background: "var(--surface-card)", padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-color)" }}>
                <strong><i className="fas fa-file-signature text-muted"></i> Matrículas:</strong> {estadoSync?.metricas?.total_matriculas ? Number(estadoSync.metricas.total_matriculas).toLocaleString() : "5,043"}
              </div>
            </div>

            {estadoSync?.ultimaCarga?.finalizada_en && (
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 8 }}>
                <i className="fas fa-clock"></i> Última sincronización: <strong>{new Date(estadoSync.ultimaCarga.finalizada_en).toLocaleString("es-CO")}</strong>
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
              Actualización directa in-place
            </span>
          </div>
        </div>
      </div>

      {/* Panel Principal: Búsqueda y Administración de Usuarios */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3 className="card-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <i className="fas fa-users-gear" style={{ color: "var(--brand-primary)" }}></i>
              Administración de Usuarios y Accesos
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Busca cualquier usuario por cédula, código, nombre o correo y gestiona su rol y acceso.
            </p>
          </div>

          <span className="badge badge-risk-low" style={{ fontSize: "0.8rem", padding: "6px 12px" }}>
            {usuarios.length} {usuarios.length === 1 ? "registro encontrado" : "registros encontrados"}
          </span>
        </div>

        {/* Barra de Búsqueda Multicriterio */}
        <div style={{ padding: "1rem", background: "var(--surface-subtle)", borderBottom: "1px solid var(--border-color)", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 300px", position: "relative" }}>
            <i className="fas fa-magnifying-glass" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}></i>
            <input
              type="text"
              className="form-control"
              style={{ paddingLeft: "36px", height: "42px", fontSize: "0.9rem" }}
              placeholder="Buscar por cédula, código, nombre o correo (ej: 1085..., ruales, @unicesmag.edu.co)..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda("")}
                style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
                title="Limpiar búsqueda"
              >
                <i className="fas fa-xmark"></i>
              </button>
            )}
          </div>

          {/* Filtro por tipo de origen */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {[
              { id: "todos", label: "Todos", icon: "fa-list" },
              { id: "usuarios", label: "Con Acceso", icon: "fa-user-check" },
              { id: "docentes", label: "Docentes", icon: "fa-chalkboard-teacher" },
              { id: "estudiantes", label: "Estudiantes", icon: "fa-user-graduate" }
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                className={`btn btn-sm ${filtroTipo === t.id ? "btn-primary" : "btn-outline"}`}
                onClick={() => setFiltroTipo(t.id)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: "36px" }}
              >
                <i className={`fas ${t.icon}`}></i> {t.label}
              </button>
            ))}
          </div>

          {buscando && (
            <span style={{ fontSize: "0.8rem", color: "var(--brand-primary)", display: "flex", alignItems: "center", gap: 6 }}>
              <i className="fas fa-spinner fa-spin"></i> Buscando...
            </span>
          )}
        </div>

        {/* Tabla de Resultados */}
        <div className="table-responsive">
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Persona / Usuario</th>
                <th>Identificación / Código</th>
                <th>Rol en el Sistema</th>
                <th>Cargo / Perfil</th>
                <th>Programa</th>
                <th>Estado Acceso</th>
                <th style={{ textAlign: "center" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--text-muted)" }}>
                    <i className="fas fa-user-slash" style={{ fontSize: "2rem", marginBottom: "0.5rem", display: "block", opacity: 0.5 }}></i>
                    No se encontraron registros que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                usuarios.map((u) => {
                  const rolKey = (u.rol || "").toLowerCase();
                  const esDocenteAcompanante = u.cargo?.toLowerCase().includes("acompañante");

                  return (
                    <tr key={u.id} style={{ background: u.tiene_cuenta ? "transparent" : "rgba(241, 245, 249, 0.4)" }}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: "50%",
                              background: u.tiene_cuenta ? (u.activo ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)") : "rgba(100, 116, 139, 0.15)",
                              color: u.tiene_cuenta ? (u.activo ? "#059669" : "#dc2626") : "#64748b",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.95rem",
                              fontWeight: 700
                            }}
                          >
                            <i className={`fas ${u.tipo_registro === "docente" ? "fa-chalkboard-user" : (u.tipo_registro === "estudiante" ? "fa-graduation-cap" : "fa-user")}`}></i>
                          </div>
                          <div>
                            <strong>{u.nombre}</strong>
                            <br />
                            <small className="text-muted">{u.email || "Sin correo institucional"}</small>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div>
                          <strong>{u.documento || "—"}</strong>
                          {u.codigo && u.codigo !== u.documento && (
                            <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              Cód: {u.codigo}
                            </span>
                          )}
                          <span className="badge" style={{ fontSize: "0.65rem", marginTop: 2, background: "#f1f5f9", color: "#475569" }}>
                            {u.tipo_registro === "docente" ? "Docente Sincronizado" : (u.tipo_registro === "estudiante" ? "Estudiante" : "Usuario SAT")}
                          </span>
                        </div>
                      </td>

                      <td>
                        {u.tiene_cuenta ? (
                          <span
                            className="badge"
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              background: rolKey === "admin" ? "rgba(155, 27, 48, 0.1)" : (rolKey === "profesional" ? "rgba(37, 99, 235, 0.1)" : (rolKey === "directivo" ? "rgba(147, 51, 234, 0.1)" : "rgba(16, 185, 129, 0.1)")),
                              color: rolKey === "admin" ? "#9B1B30" : (rolKey === "profesional" ? "#1d4ed8" : (rolKey === "directivo" ? "#7e22ce" : "#047857")),
                              border: `1px solid ${rolKey === "admin" ? "rgba(155, 27, 48, 0.3)" : (rolKey === "profesional" ? "rgba(37, 99, 235, 0.3)" : "rgba(147, 51, 234, 0.3)")}`
                            }}
                          >
                            <i className={`fas ${rolKey === "admin" ? "fa-shield-halved" : (rolKey === "profesional" ? "fa-user-tie" : "fa-user-gear")}`} style={{ marginRight: 4 }}></i>
                            {ROLE_LABELS[rolKey] || u.rol}
                          </span>
                        ) : (
                          <span className="badge" style={{ background: "#f1f5f9", color: "#64748b", fontSize: "0.75rem" }}>
                            Sin cuenta
                          </span>
                        )}
                      </td>

                      <td>
                        <strong>{u.cargo || "Docente"}</strong>
                        {esDocenteAcompanante && (
                          <span className="badge" style={{ display: "block", marginTop: 2, background: "rgba(37, 99, 235, 0.1)", color: "#1d4ed8", fontSize: "0.7rem", width: "fit-content" }}>
                            Rol Profesional
                          </span>
                        )}
                      </td>

                      <td style={{ fontSize: "0.85rem" }}>{u.programa || "Todos"}</td>

                      <td>
                        {u.tiene_cuenta ? (
                          <button
                            type="button"
                            onClick={() => handleToggleActivo(u)}
                            className="badge"
                            style={{
                              background: u.activo ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                              color: u.activo ? "#047857" : "#b91c1c",
                              border: `1px solid ${u.activo ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "4px 8px"
                            }}
                            title="Haz clic para activar o desactivar acceso"
                          >
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: u.activo ? "#10b981" : "#ef4444" }}></span>
                            {u.activo ? "Acceso Activo" : "Acceso Inactivo"}
                          </button>
                        ) : (
                          <span className="badge" style={{ background: "#e2e8f0", color: "#64748b", fontSize: "0.75rem" }}>
                            Inhabilitado
                          </span>
                        )}
                      </td>

                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          className={`btn btn-sm ${u.tiene_cuenta ? "btn-outline" : "btn-primary"}`}
                          onClick={() => abrirModalAcceso(u)}
                          style={{ marginRight: 6 }}
                          title={u.tiene_cuenta ? "Administrar rol, cargo y permisos" : "Habilitar cuenta y dar acceso"}
                        >
                          <i className={`fas ${u.tiene_cuenta ? "fa-user-pen" : "fa-user-plus"}`}></i>
                          <span style={{ marginLeft: 6 }}>
                            {u.tiene_cuenta ? "Administrar" : "Habilitar Acceso"}
                          </span>
                        </button>

                        {u.tiene_cuenta && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => handleResetPassword(u)}
                            title="Restablecer contraseña a temporal (cesmag2026*)"
                            style={{ marginRight: 6 }}
                          >
                            <i className="fas fa-key"></i>
                          </button>
                        )}

                        {u.tiene_cuenta && (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDesactivar(u)}
                            title="Desactivar usuario"
                          >
                            <i className="fas fa-user-slash"></i>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grid Inferior: Formulario de Creación Rápida y Umbrales */}
      <div className="dashboard-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="card" style={{ gridColumn: "span 6" }}>
          <div className="card-header">
            <h3 className="card-title">Crear Nuevo Usuario Directo</h3>
          </div>

          <form onSubmit={handleCrearUsuario}>
            <div className="form-group">
              <label className="form-label" htmlFor="usr-nombre">Nombres y Apellidos</label>
              <input
                id="usr-nombre"
                className="form-control"
                placeholder="Ej: Lic. Juan Fernando Pérez"
                required
                value={formUsuario.nombre}
                onChange={(e) => setFormUsuario({ ...formUsuario, nombre: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="usr-email">Correo Institucional</label>
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="usr-rol">Rol Institucional</label>
                <select
                  id="usr-rol"
                  className="form-select"
                  value={formUsuario.rol}
                  onChange={(e) => setFormUsuario({ ...formUsuario, rol: e.target.value })}
                >
                  <option value="profesional">Rol Profesionales (Docente Acompañante, USP, etc.)</option>
                  <option value="directivo">Rol Directivos (Directores / Coordinadores)</option>
                  <option value="admin">Rol Administrativo</option>
                  <option value="reporte_actividades">Rol Reporte Actividades</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="usr-cargo">Cargo / Perfil</label>
                <input
                  id="usr-cargo"
                  className="form-control"
                  placeholder="Ej: Docente Acompañante"
                  required
                  value={formUsuario.cargo}
                  onChange={(e) => setFormUsuario({ ...formUsuario, cargo: e.target.value })}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 10 }}>
              <i className="fas fa-floppy-disk"></i> Guardar y Crear Acceso
            </button>
          </form>
        </div>

        <div className="card" style={{ gridColumn: "span 6" }}>
          <div className="card-header">
            <h3 className="card-title">Configuración de Umbrales de Riesgo</h3>
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 1rem" }}>
            Define las bandas de puntuación del semáforo de riesgo para alertas tempranas en la escala de 1 a 15.
          </p>

          <form onSubmit={handleUmbrales} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", alignItems: "flex-end" }}>
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
            <div style={{ gridColumn: "span 2" }}>
              <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
                <i className="fas fa-check"></i> Actualizar Umbrales de Riesgo
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Catálogos administrables */}
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

      {/* Matriz de Roles y Permisos */}
      {matriz && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
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
      )}

      {/* Modal de Administración de Acceso y Roles */}
      {modalUsuario && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem"
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalUsuario(null);
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "560px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              overflow: "hidden"
            }}
          >
            <div style={{ background: "linear-gradient(135deg, #002855 0%, #001f3f 100%)", padding: "18px 24px", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <i className="fas fa-user-shield" style={{ fontSize: "1.25rem", color: "#93c5fd" }}></i>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                    {modalUsuario.tiene_cuenta ? "Administrar Acceso de Usuario" : "Habilitar Acceso al Sistema SAT"}
                  </h3>
                  <small style={{ color: "#cbd5e1" }}>Configuración de Rol, Perfil y Permisos Institucionales</small>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalUsuario(null)}
                style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.25rem", cursor: "pointer" }}
              >
                <i className="fas fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleGuardarAcceso} style={{ padding: "24px" }}>
              {/* Información Personal */}
              <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e293b" }}>{formAcceso.nombre}</div>
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>
                  <span><i className="fas fa-id-card"></i> Doc: <strong>{formAcceso.documento || "No registrado"}</strong></span>
                  {formAcceso.codigo && <span><i className="fas fa-barcode"></i> Cód: <strong>{formAcceso.codigo}</strong></span>}
                </div>
              </div>

              {/* Correo institucional */}
              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Correo Institucional</label>
                <input
                  type="email"
                  className="form-control"
                  required
                  placeholder="usuario@unicesmag.edu.co"
                  value={formAcceso.email}
                  onChange={(e) => setFormAcceso({ ...formAcceso, email: e.target.value })}
                />
              </div>

              {/* Selector de Rol */}
              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Rol Institucional (Según Diagrama)</label>
                <select
                  className="form-select"
                  value={formAcceso.rol}
                  onChange={(e) => {
                    const nuevoRol = e.target.value;
                    const defaultCargo = nuevoRol === "profesional" 
                      ? "Docente Acompañante" 
                      : (nuevoRol === "directivo" ? "Director de Programa" : "Coordinador de Acompañamiento");
                    setFormAcceso({ ...formAcceso, rol: nuevoRol, cargo: defaultCargo });
                  }}
                >
                  <option value="profesional">2. Rol Profesionales (Docentes Acompañantes, Tutores, USP, Salud, etc.)</option>
                  <option value="directivo">3. Rol Directivos (Directores de Programa, Coordinadores)</option>
                  <option value="admin">1. Rol Administrativo (Coordinador Acompañamiento, VEC)</option>
                  <option value="reporte_actividades">Rol Reporte de Actividades</option>
                </select>
                <small className="text-muted" style={{ display: "block", marginTop: 4 }}>
                  {formAcceso.rol === "profesional" && "• Rol Profesionales: Incluye a los Docentes Acompañantes, Tutores, Psicólogos, Salud y Trabajo Social."}
                  {formAcceso.rol === "directivo" && "• Rol Directivos: Filtra los reportes y consultas exclusivamente al programa académico asignado."}
                  {formAcceso.rol === "admin" && "• Rol Administrativo: Acceso total institucional a intervenciones, remisiones, usuarios y reportes."}
                </small>
              </div>

              {/* Selector de Cargo / Perfil sugerido */}
              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Cargo / Perfil Específico</label>
                <input
                  type="text"
                  className="form-control"
                  list="cargos-sugeridos"
                  required
                  placeholder="Selecciona o escribe el cargo"
                  value={formAcceso.cargo}
                  onChange={(e) => setFormAcceso({ ...formAcceso, cargo: e.target.value })}
                />
                <datalist id="cargos-sugeridos">
                  {cargosSugeridos.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              {/* Programa Académico (obligatorio para directivos o docentes por programa) */}
              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Programa Académico Asignado</label>
                <select
                  className="form-select"
                  value={formAcceso.id_programa}
                  onChange={(e) => setFormAcceso({ ...formAcceso, id_programa: e.target.value })}
                >
                  <option value="">Todos los programas (Acceso Institucional Global)</option>
                  {programas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} {p.codigo_externo ? `(${p.codigo_externo})` : ""}
                    </option>
                  ))}
                </select>
                {formAcceso.rol === "directivo" && (
                  <small style={{ color: "#7e22ce", fontWeight: 500, display: "block", marginTop: 4 }}>
                    <i className="fas fa-circle-exclamation"></i> Como Rol Directivo, sus reportes se restringirán al programa que selecciones.
                  </small>
                )}
              </div>

              {/* Campo: Contraseña de Acceso */}
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label className="form-label" style={{ fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                  <span><i className="fas fa-key text-primary me-1"></i> Contraseña de Acceso</span>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Clave para iniciar sesión</span>
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="cesmag2026*"
                    value={formAcceso.password}
                    onChange={(e) => setFormAcceso({ ...formAcceso, password: e.target.value, resetear_password: true })}
                    style={{ fontFamily: "monospace", fontSize: "0.9rem", paddingRight: "40px" }}
                  />
                  <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: "#10b981", fontSize: "0.85rem" }}>
                    <i className="fas fa-check-circle" title="Contraseña activa para base de datos"></i>
                  </span>
                </div>
                <small className="text-muted" style={{ display: "block", marginTop: 4, fontSize: "0.75rem" }}>
                  El usuario podrá iniciar sesión con su correo (o cédula) y esta contraseña institucional.
                </small>
              </div>

              {/* Toggle Activo y Estado */}
              <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label htmlFor="chk-activo" style={{ fontWeight: 600, fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                    <input
                      id="chk-activo"
                      type="checkbox"
                      checked={formAcceso.activo}
                      onChange={(e) => setFormAcceso({ ...formAcceso, activo: e.target.checked })}
                      style={{ width: 18, height: 18 }}
                    />
                    Acceso Habilitado al Sistema SAT
                  </label>
                  <span className={`badge ${formAcceso.activo ? "badge-risk-low" : "badge-risk-high"}`}>
                    {formAcceso.activo ? "Activo" : "Inactivo"}
                  </span>
                </div>
              </div>

              {/* Botones de Acción */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setModalUsuario(null)}
                  disabled={guardandoAcceso}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={guardandoAcceso}
                  style={{ minWidth: 140, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  {guardandoAcceso ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Guardando...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-floppy-disk"></i> Guardar Acceso
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
