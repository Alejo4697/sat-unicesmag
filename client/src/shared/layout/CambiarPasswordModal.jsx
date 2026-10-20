/* ==========================================================================
   CambiarPasswordModal - Modal institucional para cambio de contraseña
   Permite a cualquier usuario autenticado actualizar su contraseña de acceso
   validando su contraseña actual y exigiendo requisitos mínimos de seguridad.
   ========================================================================== */

import { useState } from "react";
import { cambiarPassword } from "../../features/autenticacion/api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function CambiarPasswordModal({ abierto, onClose }) {
  const { user, iniciarSesionComo } = useAuth();

  const [passwordActual, setPasswordActual] = useState("");
  const [nuevoPassword, setNuevoPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");

  const [verActual, setVerActual] = useState(false);
  const [verNuevo, setVerNuevo] = useState(false);
  const [verConfirmar, setVerConfirmar] = useState(false);

  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [guardando, setGuardando] = useState(false);

  if (!abierto) return null;

  function limpiarFormulario() {
    setPasswordActual("");
    setNuevoPassword("");
    setConfirmarPassword("");
    setVerActual(false);
    setVerNuevo(false);
    setVerConfirmar(false);
    setError("");
    setExito("");
  }

  function handleCerrar() {
    if (guardando) return;
    limpiarFormulario();
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setExito("");

    if (!passwordActual) {
      setError("Por favor ingrese su contraseña actual.");
      return;
    }

    if (!nuevoPassword || nuevoPassword.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (nuevoPassword === passwordActual) {
      setError("La nueva contraseña debe ser diferente a la contraseña actual.");
      return;
    }

    if (nuevoPassword !== confirmarPassword) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }

    setGuardando(true);
    try {
      const resp = await cambiarPassword({ passwordActual, nuevoPassword });
      setExito(resp?.message || "Contraseña actualizada exitosamente.");

      if (user && user.debeCambiarPassword) {
        iniciarSesionComo({ ...user, debeCambiarPassword: false });
      }

      setPasswordActual("");
      setNuevoPassword("");
      setConfirmarPassword("");

      setTimeout(() => {
        limpiarFormulario();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || "No fue posible actualizar la contraseña.");
    } finally {
      setGuardando(false);
    }
  }

  const cumpleLongitud = nuevoPassword.length >= 8;
  const cumpleDiferente = nuevoPassword.length > 0 && nuevoPassword !== passwordActual;
  const cumpleCoincidencia = confirmarPassword.length > 0 && nuevoPassword === confirmarPassword;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-cambiar-password-titulo"
      onClick={handleCerrar}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(3px)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem"
      }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "460px",
          margin: 0,
          padding: "1.75rem",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
          borderTop: "4px solid var(--brand-primary, #002855)"
        }}
      >
        <div
          className="card-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1rem",
            paddingBottom: "0.75rem"
          }}
        >
          <h3 id="modal-cambiar-password-titulo" className="card-title" style={{ fontSize: "1.05rem", margin: 0 }}>
            <i className="fas fa-key" style={{ color: "var(--brand-primary)" }}></i> Cambiar Contraseña
          </h3>
          <button
            type="button"
            onClick={handleCerrar}
            disabled={guardando}
            aria-label="Cerrar ventana"
            style={{
              background: "transparent",
              border: "none",
              fontSize: "1.1rem",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "4px 8px"
            }}
          >
            <i className="fas fa-xmark"></i>
          </button>
        </div>

        {user && (
          <div
            style={{
              background: "var(--surface-subtle, #f8fafc)",
              border: "1px solid var(--border-light, #e2e8f0)",
              borderRadius: "6px",
              padding: "0.65rem 0.85rem",
              marginBottom: "1.15rem",
              fontSize: "0.8rem"
            }}
          >
            <div style={{ fontWeight: 700, color: "var(--text-main)" }}>{user.nombre}</div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{user.email}</div>
          </div>
        )}

        {error && (
          <div
            style={{
              background: "var(--risk-high-bg, #fef2f2)",
              color: "var(--risk-high-text, #991b1b)",
              border: "1px solid var(--risk-high-border, #fecaca)",
              borderRadius: "6px",
              padding: "0.7rem 0.9rem",
              marginBottom: "1rem",
              fontSize: "0.8125rem",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <i className="fas fa-circle-exclamation"></i>
            <span>{error}</span>
          </div>
        )}

        {exito && (
          <div
            style={{
              background: "var(--risk-low-bg, #ecfdf5)",
              color: "var(--risk-low-text, #065f46)",
              border: "1px solid var(--risk-low-border, #a7f3d0)",
              borderRadius: "6px",
              padding: "0.7rem 0.9rem",
              marginBottom: "1rem",
              fontSize: "0.8125rem",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <i className="fas fa-circle-check"></i>
            <span>{exito}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="pwd-actual">
              Contraseña Actual
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="pwd-actual"
                type={verActual ? "text" : "password"}
                className="form-control"
                required
                autoFocus
                autoComplete="current-password"
                value={passwordActual}
                onChange={(e) => setPasswordActual(e.target.value)}
                placeholder="Ingrese su contraseña actual"
                style={{ paddingRight: "2.5rem" }}
              />
              <button
                type="button"
                onClick={() => setVerActual(!verActual)}
                tabIndex={-1}
                title={verActual ? "Ocultar" : "Mostrar"}
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "4px"
                }}
              >
                <i className={`fas ${verActual ? "fa-eye-slash" : "fa-eye"}`}></i>
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="pwd-nuevo">
              Nueva Contraseña
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="pwd-nuevo"
                type={verNuevo ? "text" : "password"}
                className="form-control"
                required
                minLength={8}
                autoComplete="new-password"
                value={nuevoPassword}
                onChange={(e) => setNuevoPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                style={{ paddingRight: "2.5rem" }}
              />
              <button
                type="button"
                onClick={() => setVerNuevo(!verNuevo)}
                tabIndex={-1}
                title={verNuevo ? "Ocultar" : "Mostrar"}
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "4px"
                }}
              >
                <i className={`fas ${verNuevo ? "fa-eye-slash" : "fa-eye"}`}></i>
              </button>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "0.85rem" }}>
            <label className="form-label" htmlFor="pwd-confirmar">
              Confirmar Nueva Contraseña
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="pwd-confirmar"
                type={verConfirmar ? "text" : "password"}
                className="form-control"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmarPassword}
                onChange={(e) => setConfirmarPassword(e.target.value)}
                placeholder="Repita la nueva contraseña"
                style={{ paddingRight: "2.5rem" }}
              />
              <button
                type="button"
                onClick={() => setVerConfirmar(!verConfirmar)}
                tabIndex={-1}
                title={verConfirmar ? "Ocultar" : "Mostrar"}
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "4px"
                }}
              >
                <i className={`fas ${verConfirmar ? "fa-eye-slash" : "fa-eye"}`}></i>
              </button>
            </div>
          </div>

          {/* Indicadores de seguridad */}
          <div
            style={{
              background: "var(--surface-subtle, #f8fafc)",
              borderRadius: "6px",
              padding: "0.65rem 0.85rem",
              marginBottom: "1.25rem",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              display: "flex",
              flexDirection: "column",
              gap: "4px"
            }}
          >
            <div style={{ color: cumpleLongitud ? "#059669" : "var(--text-muted)" }}>
              <i className={`fas ${cumpleLongitud ? "fa-check-circle" : "fa-circle"}`} style={{ marginRight: 6 }}></i>
              Mínimo 8 caracteres
            </div>
            <div style={{ color: cumpleDiferente ? "#059669" : "var(--text-muted)" }}>
              <i className={`fas ${cumpleDiferente ? "fa-check-circle" : "fa-circle"}`} style={{ marginRight: 6 }}></i>
              Diferente a la contraseña actual
            </div>
            <div style={{ color: cumpleCoincidencia ? "#059669" : "var(--text-muted)" }}>
              <i className={`fas ${cumpleCoincidencia ? "fa-check-circle" : "fa-circle"}`} style={{ marginRight: 6 }}></i>
              Las contraseñas nuevas coinciden
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.65rem" }}>
            <button type="button" className="btn btn-outline" onClick={handleCerrar} disabled={guardando}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={guardando}>
              {guardando ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> Guardando...
                </>
              ) : (
                <>
                  <i className="fas fa-floppy-disk"></i> Actualizar Contraseña
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
