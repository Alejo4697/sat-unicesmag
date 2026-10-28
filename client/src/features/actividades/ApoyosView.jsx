import { useEffect, useState } from "react";
import { getBeneficiariosApoyo, getCatalogosEstudiante } from "./participantesApi.js";

const ETIQUETAS_ROL = {
  ESTUDIANTE: "Estudiante",
  COLABORADOR: "Colaborador",
  ADMINISTRATIVO: "Administrativo",
  EGRESADO: "Egresado",
  EXTERNO: "Externo",
};

export default function ApoyosView() {
  const [tiposApoyo, setTiposApoyo] = useState([]);
  const [tipoApoyoId, setTipoApoyoId] = useState("todos");
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState(null);
  const [cargandoTipos, setCargandoTipos] = useState(true);
  const [cargandoBeneficiarios, setCargandoBeneficiarios] = useState(true);
  const [error, setError] = useState("");
  const totalPaginas = resultado ? Math.max(1, Math.ceil(resultado.total / resultado.limite)) : 1;

  const listItems = (items) => (items || []).filter(Boolean);

  useEffect(() => {
    const controller = new AbortController();
    getCatalogosEstudiante({ signal: controller.signal })
      .then((catalogos) => setTiposApoyo(catalogos.tiposApoyo || []))
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(requestError.message || "No se pudieron cargar los tipos de apoyo.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargandoTipos(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setCargandoBeneficiarios(true);
    setError("");
    getBeneficiariosApoyo({ tipoApoyo: tipoApoyoId, pagina, signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResultado(data);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setResultado(null);
          setError(requestError.message || "No se pudieron consultar los beneficiarios.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargandoBeneficiarios(false);
      });
    return () => controller.abort();
  }, [tipoApoyoId, pagina]);

  return (
    <section className="vec-support-page" aria-labelledby="vec-apoyos-title">
      <header className="vec-support-hero">
        <span className="vec-support-hero__icon" aria-hidden="true">
          <i className="fas fa-hand-holding-heart"></i>
        </span>
        <div>
          <span className="vec-support-hero__eyebrow">ACTIVIDADES VEC</span>
          <h1 id="vec-apoyos-title">Consulta de apoyos</h1>
          <p>Explora quiénes reciben apoyos, beneficios y servicios institucionales.</p>
        </div>
      </header>

      <section className="vec-support-filter-card" aria-label="Filtro de consulta">
        <label className="vec-support-filter-card__field" htmlFor="vec-apoyo-tipo">
          <span>Tipo de apoyo</span>
          <select
            className="form-select"
            id="vec-apoyo-tipo"
            value={tipoApoyoId}
            onChange={(event) => {
              setTipoApoyoId(event.target.value);
              setPagina(1);
              setResultado(null);
            }}
            disabled={cargandoTipos || tiposApoyo.length === 0}
          >
            <option value="todos">Todos los tipos de apoyo</option>
            {tiposApoyo.map((tipo, index) => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.numero ?? index + 1}. {tipo.nombre}
              </option>
            ))}
          </select>
        </label>
        {cargandoTipos && <span className="vec-support-filter-card__hint">Cargando opciones...</span>}
        {!cargandoTipos && tiposApoyo.length === 0 && (
          <span className="vec-support-filter-card__hint">No hay tipos de apoyo disponibles.</span>
        )}
      </section>

      {error && <div className="auth-error vec-support-error" role="alert">{error}</div>}

      <section className="vec-support-results" aria-label="Personas beneficiarias" aria-live="polite">
        <div className="vec-support-results__header">
          <div>
            <span className="vec-support-results__eyebrow">RESULTADOS</span>
            <h2>Personas beneficiarias</h2>
          </div>
          {resultado && !cargandoBeneficiarios && (
            <span className="vec-support-results__count">
              {resultado.total} {resultado.total === 1 ? "persona" : "personas"}
            </span>
          )}
        </div>

        {cargandoBeneficiarios ? (
          <div className="vec-support-state" role="status">
            <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>
            <span>Consultando personas y apoyos registrados...</span>
          </div>
        ) : resultado && resultado.beneficiarios.length === 0 ? (
          <div className="vec-support-state vec-support-state--empty" role="status">
            <span className="vec-support-state__icon"><i className="fas fa-magnifying-glass" aria-hidden="true"></i></span>
            <strong>No hay beneficiarios para este filtro</strong>
            <span>Prueba con otro tipo de apoyo o consulta todas las categorías.</span>
          </div>
        ) : resultado ? (
          <>
            <div className="table-responsive vec-support-table-wrap">
              <table className="table vec-support-table">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Rol</th>
                    <th>Apoyos registrados</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.beneficiarios.map((persona) => (
                    <tr key={persona.id}>
                      <td>
                        <div className="vec-support-person">
                          <span className="vec-support-person__avatar" aria-hidden="true">
                            {(persona.nombres || persona.apellidos || "P").trim().charAt(0).toLocaleUpperCase("es")}
                          </span>
                          <span className="vec-support-person__details">
                            <strong>{[persona.apellidos, persona.nombres].filter(Boolean).join(" ") || "Nombre no registrado"}</strong>
                            <small><i className="far fa-id-card" aria-hidden="true"></i>{persona.identificacion || "Identificación no registrada"}</small>
                            {persona.codigo && <small><i className="fas fa-graduation-cap" aria-hidden="true"></i>Código {persona.codigo}</small>}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="vec-support-tags">
                          {(persona.roles || []).length > 0
                            ? persona.roles.map((rol) => (
                              <span className="vec-support-tag" key={rol}>{ETIQUETAS_ROL[rol] || rol}</span>
                            ))
                            : <span className="vec-support-table__muted">Sin rol</span>}
                        </div>
                      </td>
                      <td>
                        <div className="vec-support-summary">
                          <div className="vec-support-summary__types">
                            {listItems(persona.tiposApoyo).map((item) => <span className="vec-support-chip" key={item}>{item}</span>)}
                            {listItems(persona.clasificaciones).map((item) => <span className="vec-support-summary__classification" key={item}>{item}</span>)}
                            {!persona.tiposApoyo?.length && !persona.clasificaciones?.length && (
                              <span className="vec-support-table__muted">Sin clasificar</span>
                            )}
                          </div>
                          <div className="vec-support-summary__details">
                            {listItems(persona.apoyos).map((item) => <strong key={item}>{item}</strong>)}
                            {listItems(persona.periodos).map((item) => <small key={item}><i className="far fa-calendar" aria-hidden="true"></i>{item}</small>)}
                            {listItems(persona.porcentajes).map((item) => <small key={`p-${item}`}>{item}%</small>)}
                            {listItems(persona.valores).map((item) => <small key={`v-${item}`}>{item}</small>)}
                            {listItems(persona.fuentes).length > 0 && (
                              <small><i className="fas fa-arrow-right-from-bracket" aria-hidden="true"></i>{listItems(persona.fuentes).join(" · ")}</small>
                            )}
                            {!persona.apoyos?.length && !persona.periodos?.length && !persona.porcentajes?.length
                              && !persona.valores?.length && !persona.fuentes?.length && (
                                <span className="vec-support-table__muted">Sin detalle adicional</span>
                              )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPaginas > 1 && (
              <div className="vec-support-pagination">
                <span>Página <strong>{resultado.pagina}</strong> de <strong>{totalPaginas}</strong></span>
                <div>
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => setPagina((current) => Math.max(1, current - 1))}
                    disabled={pagina <= 1 || cargandoBeneficiarios}
                  ><i className="fas fa-arrow-left" aria-hidden="true"></i> Anterior</button>
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => setPagina((current) => Math.min(totalPaginas, current + 1))}
                    disabled={pagina >= totalPaginas || cargandoBeneficiarios}
                  >Siguiente <i className="fas fa-arrow-right" aria-hidden="true"></i></button>
                </div>
              </div>
            )}
            {resultado.sinTipoApoyo > 0 && (
              <p className="vec-support-unclassified" role="note">
                <i className="fas fa-circle-info" aria-hidden="true"></i>
                {resultado.sinTipoApoyo} {resultado.sinTipoApoyo === 1 ? "registro" : "registros"} sin tipo de apoyo clasificado.
              </p>
            )}
          </>
        ) : null}
      </section>

      {resultado && resultado.rutas?.length > 0 && (
        <details className="vec-support-routes">
          <summary className="vec-support-routes__summary">
            <span>
              <i className="fas fa-route" aria-hidden="true"></i>
              Servicios y rutas asociadas
            </span>
            <small>{resultado.rutas.length} {resultado.rutas.length === 1 ? "ruta" : "rutas"}</small>
          </summary>
          <div className="vec-support-route-grid">
            {resultado.rutas.map((ruta) => (
              <article className="vec-support-route-card" key={ruta.id}>
                <span className="vec-support-route-card__icon" aria-hidden="true">
                  <i className="fas fa-hand-holding-heart"></i>
                </span>
                <div className="vec-support-route-card__content">
                  <h3>{ruta.nombre}</h3>
                  {ruta.observaciones && <p>{ruta.observaciones}</p>}
                  <dl>
                    <div><dt>Programa</dt><dd>{ruta.programa || "No especificado"}</dd></div>
                    <div><dt>Dependencia</dt><dd>{ruta.dependencia || "No especificada"}</dd></div>
                    <div><dt>Responsable</dt><dd>{ruta.responsable || "No especificado"}</dd></div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
