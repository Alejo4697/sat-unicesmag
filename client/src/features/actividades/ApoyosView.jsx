import { useEffect, useState } from "react";
import {
  getCatalogoApoyosFinancieros,
  getCatalogosEstudiante,
  getListadoApoyos,
} from "./participantesApi.js";

const EMPTY_RESULT = { rows: [], total: 0 };

export default function ApoyosView() {
  const [catalogos, setCatalogos] = useState({ periodos: [], apoyos: [] });
  const [apoyoSeleccionado, setApoyoSeleccionado] = useState("");
  const [idPeriodo, setIdPeriodo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(0);
  const [resultado, setResultado] = useState(EMPTY_RESULT);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");
  const [consultaRealizada, setConsultaRealizada] = useState(false);

  useEffect(() => {
    let activa = true;
    Promise.all([getCatalogosEstudiante(), getCatalogoApoyosFinancieros()])
      .then(([data, apoyos]) => {
        if (!activa) return;
        setCatalogos({ periodos: data.periodos || [], apoyos: apoyos || [] });
      })
      .catch((requestError) => {
        if (activa) setError(requestError.message || "No se pudieron cargar los apoyos institucionales.");
      })
      .finally(() => {
        if (activa) setCargandoCatalogos(false);
      });
    return () => { activa = false; };
  }, []);

  const apoyoActual = catalogos.apoyos.find((apoyo) => (
    JSON.stringify([apoyo.nombre, apoyo.concepto]) === apoyoSeleccionado
  ));

  async function buscar(event, paginaSolicitada = 0) {
    event?.preventDefault();
    if (!apoyoActual) {
      setError("Selecciona un apoyo financiero para consultar.");
      return;
    }
    setError("");
    setBuscando(true);
    try {
      const data = await getListadoApoyos({
        nombreApoyo: apoyoActual.nombre,
        conceptoApoyo: apoyoActual.concepto,
        idPeriodo: idPeriodo || undefined,
        busqueda: busqueda.trim() || undefined,
        pagina: paginaSolicitada,
      });
      setResultado(data);
      setPagina(paginaSolicitada);
      setConsultaRealizada(true);
    } catch (requestError) {
      setError(requestError.message || "No se pudo consultar el listado de beneficiarios.");
    } finally {
      setBuscando(false);
    }
  }

  const totalPaginas = Math.ceil(resultado.total / 100);

  return (
    <>
      <section className="card" aria-labelledby="vec-apoyos-title">
        <div className="card-header">
          <h2 className="card-title" id="vec-apoyos-title">
            <i className="fas fa-hand-holding-heart" aria-hidden="true"></i>
            Consultar estudiantes con apoyo financiero
          </h2>
        </div>
        <p className="text-muted">
          Consulta los apoyos registrados en la base institucional y vinculados con estudiantes.
          El resultado cuenta cada estudiante una sola vez, aunque tenga registros repetidos.
        </p>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <form className="vec-support-filters" onSubmit={buscar}>
          <div className="form-group">
            <label className="form-label" htmlFor="vec-apoyo-tipo">Apoyo financiero</label>
            <select
              className="form-select"
              id="vec-apoyo-tipo"
              value={apoyoSeleccionado}
              onChange={(event) => {
                setApoyoSeleccionado(event.target.value);
                setResultado(EMPTY_RESULT);
                setConsultaRealizada(false);
              }}
              disabled={cargandoCatalogos}
              required
            >
              <option value="">
                {cargandoCatalogos ? "Cargando apoyos..." : "Selecciona un apoyo"}
              </option>
              {catalogos.apoyos.map((apoyo) => {
                const value = JSON.stringify([apoyo.nombre, apoyo.concepto]);
                return (
                  <option key={value} value={value}>
                    {apoyo.concepto && apoyo.concepto !== apoyo.nombre
                      ? `${apoyo.nombre} (${apoyo.concepto})`
                      : apoyo.nombre}
                  </option>
                );
              })}
            </select>
            {!cargandoCatalogos && catalogos.apoyos.length === 0 && (
              <small className="text-muted">No hay apoyos financieros sincronizados para consultar.</small>
            )}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="vec-apoyo-periodo">Periodo (opcional)</label>
            <select
              className="form-select"
              id="vec-apoyo-periodo"
              value={idPeriodo}
              onChange={(event) => setIdPeriodo(event.target.value)}
              disabled={cargandoCatalogos}
            >
              <option value="">Todos los periodos</option>
              {catalogos.periodos.map((periodo) => (
                <option key={periodo.id} value={periodo.id}>{periodo.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="vec-apoyo-busqueda">Estudiante (opcional)</label>
            <input
              className="form-control"
              id="vec-apoyo-busqueda"
              type="search"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value.slice(0, 100))}
              maxLength={100}
              placeholder="Nombre, identificación o código"
            />
          </div>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={cargandoCatalogos || buscando || !apoyoActual}
          >
            <i className={`fas ${buscando ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true"></i>
            {buscando ? "Consultando..." : "Consultar estudiantes"}
          </button>
        </form>
      </section>

      {consultaRealizada && (
        <section className="card" aria-labelledby="vec-apoyos-resultados">
          <div className="card-header">
            <div>
              <h3 className="card-title" id="vec-apoyos-resultados">
                Estudiantes con {apoyoActual?.nombre || "este apoyo"}
              </h3>
              <p className="text-muted" style={{ margin: "0.25rem 0 0" }}>
                {resultado.total} estudiante{resultado.total === 1 ? "" : "s"} único{resultado.total === 1 ? "" : "s"}
                {" "}encontrado{resultado.total === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          {buscando ? (
            <p className="text-muted" role="status">Cargando resultados...</p>
          ) : resultado.rows.length === 0 ? (
            <p className="text-muted">No se encontraron estudiantes con los filtros seleccionados.</p>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Estudiante</th>
                      <th>Identificación</th>
                      <th>Código</th>
                      <th>Periodos</th>
                      <th>Porcentaje de descuento</th>
                      <th>Valor de descuento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.rows.map((row) => (
                      <tr key={row.idEstudiante}>
                        <td><strong>{row.estudiante || "—"}</strong></td>
                        <td>{row.identificacion || "—"}</td>
                        <td>{row.codigo || "—"}</td>
                        <td>{row.periodos || "—"}</td>
                        <td>{row.porcentajes || "—"}</td>
                        <td>{row.valores || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPaginas > 1 && (
                <div className="vec-support-pagination">
                  <span className="text-muted">Página {pagina + 1} de {totalPaginas}</span>
                  <div>
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={() => buscar(null, pagina - 1)}
                      disabled={pagina === 0 || buscando}
                    >
                      Anterior
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={() => buscar(null, pagina + 1)}
                      disabled={pagina + 1 >= totalPaginas || buscando}
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}
