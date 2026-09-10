/* ==========================================================================
   Feature: Administración - Sección de catálogo administrable (reutilizable)
   ==========================================================================
   Clona el patrón "tabla + alta + toggle" de la tabla de usuarios de
   AdministracionPage.jsx, parametrizado para los 3 catálogos del schema
   `sat` (áreas de remisión, estados de remisión, tipos de intervención).

   Props:
     - titulo, icono   -> encabezado de la card
     - api             -> { list, crear, editar, toggle } de features/administracion/api.js
     - campos          -> columnas extra además de "nombre"/"activo":
                          { key, label, tipo: "text" | "check", enForm?, enTabla?, badgeSi? }
     - onAviso(texto)  -> banner transitorio del padre
     - onError(texto)  -> banner de error del padre

   El "borrado" es siempre soft (toggle activo). Inhabilitar un ítem lo saca
   de los <select> de creación de remisiones/intervenciones, pero los
   registros históricos que ya lo usaban no cambian.
   ========================================================================== */

import { useEffect, useState } from "react";

function valoresIniciales(campos) {
  const base = { nombre: "" };
  campos.forEach((c) => {
    if (c.enForm === false) return;
    base[c.key] = c.tipo === "check" ? false : "";
  });
  return base;
}

export default function CatalogoAdmin({ titulo, icono, api, campos, onAviso, onError }) {
  const [items, setItems] = useState([]);
  const [nuevo, setNuevo] = useState(() => valoresIniciales(campos));
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.list().then(setItems).catch((err) => onError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const camposForm = campos.filter((c) => c.enForm !== false);
  const camposTabla = campos.filter((c) => c.enTabla !== false);

  async function agregar(e) {
    e.preventDefault();
    if (!nuevo.nombre.trim()) {
      onError("El nombre del elemento es obligatorio.");
      return;
    }
    setGuardando(true);
    try {
      const creado = await api.crear(nuevo);
      setItems((prev) => [...prev, creado]);
      setNuevo(valoresIniciales(campos));
      onAviso(`"${creado.nombre}" agregado al catálogo.`);
    } catch (err) {
      onError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  function empezarEdicion(item) {
    setEditId(item.id);
    setEditData({ nombre: item.nombre, ...Object.fromEntries(camposForm.map((c) => [c.key, item[c.key]])) });
  }

  async function guardarEdicion() {
    if (!editData.nombre.trim()) {
      onError("El nombre no puede quedar vacío.");
      return;
    }
    try {
      const actualizado = await api.editar(editId, editData);
      setItems((prev) => prev.map((x) => (x.id === editId ? actualizado : x)));
      setEditId(null);
      onAviso(`"${actualizado.nombre}" actualizado.`);
    } catch (err) {
      onError(err.message);
    }
  }

  async function toggle(item) {
    try {
      const actualizado = await api.toggle(item.id, !item.activo);
      setItems((prev) => prev.map((x) => (x.id === item.id ? actualizado : x)));
      onAviso(`"${actualizado.nombre}" ${actualizado.activo ? "habilitado" : "inhabilitado"}.`);
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">
          <i className={`fas ${icono}`}></i> {titulo}
        </h3>
      </div>

      <form onSubmit={agregar} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1rem" }}>
        <div style={{ flex: "1 1 220px" }}>
          <label className="form-label">Nombre</label>
          <input
            className="form-control"
            value={nuevo.nombre}
            onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            placeholder="Nombre del nuevo elemento"
            required
          />
        </div>
        {camposForm.map((c) =>
          c.tipo === "check" ? (
            <label key={c.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", paddingBottom: 8 }}>
              <input type="checkbox" checked={!!nuevo[c.key]} onChange={(e) => setNuevo({ ...nuevo, [c.key]: e.target.checked })} />
              {c.label}
            </label>
          ) : (
            <div key={c.key} style={{ flex: "1 1 200px" }}>
              <label className="form-label">{c.label}</label>
              <input
                className="form-control"
                value={nuevo[c.key] ?? ""}
                onChange={(e) => setNuevo({ ...nuevo, [c.key]: e.target.value })}
              />
            </div>
          )
        )}
        <button type="submit" className="btn btn-primary" disabled={guardando}>
          <i className="fas fa-plus"></i> Agregar
        </button>
      </form>

      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              {camposTabla.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={3 + camposTabla.length} className="text-muted" style={{ textAlign: "center" }}>
                  Catálogo vacío.
                </td>
              </tr>
            )}
            {items.map((item) => {
              const editando = editId === item.id;
              return (
                <tr key={item.id} style={item.activo ? undefined : { opacity: 0.55 }}>
                  <td>
                    {editando ? (
                      <input
                        className="form-control"
                        value={editData.nombre}
                        onChange={(e) => setEditData({ ...editData, nombre: e.target.value })}
                      />
                    ) : (
                      <strong>{item.nombre}</strong>
                    )}
                  </td>
                  {camposTabla.map((c) => {
                    const editableAqui = editando && c.enForm !== false;
                    return (
                      <td key={c.key}>
                        {editableAqui && c.tipo === "check" && (
                          <input
                            type="checkbox"
                            checked={!!editData[c.key]}
                            onChange={(e) => setEditData({ ...editData, [c.key]: e.target.checked })}
                          />
                        )}
                        {editableAqui && c.tipo !== "check" && (
                          <input
                            className="form-control"
                            value={editData[c.key] ?? ""}
                            onChange={(e) => setEditData({ ...editData, [c.key]: e.target.value })}
                          />
                        )}
                        {!editableAqui && c.tipo === "check" && (
                          item[c.key] ? <span className="badge badge-status-process">{c.badgeSi || "Sí"}</span> : <span className="text-muted">—</span>
                        )}
                        {!editableAqui && c.tipo !== "check" && (item[c.key] || <span className="text-muted">—</span>)}
                      </td>
                    );
                  })}
                  <td>
                    <span className={`badge ${item.activo ? "badge-risk-low" : "badge-status-closed"}`}>
                      {item.activo ? "Activo" : "Inhabilitado"}
                    </span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {editando ? (
                      <>
                        <button className="btn btn-primary btn-sm" onClick={guardarEdicion}>
                          <i className="fas fa-check"></i> Guardar
                        </button>{" "}
                        <button className="btn btn-outline btn-sm" onClick={() => setEditId(null)}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-outline btn-sm" onClick={() => empezarEdicion(item)}>
                          <i className="fas fa-edit"></i>
                        </button>{" "}
                        <button className="btn btn-outline btn-sm" onClick={() => toggle(item)}>
                          {item.activo ? "Inhabilitar" : "Habilitar"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
