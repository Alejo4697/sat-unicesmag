import { useEffect, useState } from "react";
import { getBeneficiariosApoyo, getCatalogosEstudiante } from "./participantesApi.js";

const ETIQUETAS_ROL = {
  ESTUDIANTE: "Estudiante",
  COLABORADOR: "Colaborador",
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
    <section className="card" aria-labelledby="vec-apoyos-title">
      <div className="card-header">
        <h2 className="card-title" id="vec-apoyos-title">
          <i className="fas fa-hand-holding-heart" aria-hidden="true"></i>
          Consultar personas por tipo de apoyo
        </h2>
      </div>
      <p className="text-muted">
        Consulta todas las personas que tienen apoyos o beneficios registrados. Cada persona aparece una sola vez, con sus apoyos reunidos.
      </p>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <div className="vec-support-filters">
        <div className="form-group">
          <label className="form-label" htmlFor="vec-apoyo-tipo">Tipo de apoyo</label>
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
        </div>
      </div>
      {cargandoBeneficiarios ? (
        <p className="text-muted" role="status">Consultando personas y apoyos registrados...</p>
      ) : resultado && resultado.beneficiarios.length === 0 ? (
        <p className="text-muted" role="status">No hay personas beneficiarias registradas para este filtro.</p>
      ) : resultado ? (
        <div className="vec-support-local-notice" role="region" aria-live="polite">
          <strong>{resultado.total} {resultado.total === 1 ? "persona beneficiaria" : "personas beneficiarias"}</strong>
          <div className="table-responsive" style={{ marginTop: "0.75rem" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Identificación</th>
                  <th>Rol</th>
                  <th>Tipo(s) de apoyo</th>
                  <th>Clasificación</th>
                  <th>Apoyo(s) o beneficio(s)</th>
                  <th>Periodo(s)</th>
                  <th>Porcentaje / valor</th>
                  <th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {resultado.beneficiarios.map((persona) => (
                  <tr key={persona.id}>
                    <td>
                      <strong>{[persona.apellidos, persona.nombres].filter(Boolean).join(" ") || "—"}</strong>
                      {persona.codigo && <div className="text-muted">Código: {persona.codigo}</div>}
                    </td>
                    <td>{persona.identificacion || "—"}</td>
                    <td>
                      {(persona.roles || []).length > 0
                        ? persona.roles.map((rol) => ETIQUETAS_ROL[rol] || rol).join(" · ")
                        : "—"}
                    </td>
                    <td>{(persona.tiposApoyo || []).join(" · ") || "Sin clasificar"}</td>
                    <td>{(persona.clasificaciones || []).join(" · ") || "Sin dato"}</td>
                    <td>{(persona.apoyos || []).join(" · ") || "—"}</td>
                    <td>{(persona.periodos || []).join(" · ") || "—"}</td>
                    <td>
                      {persona.porcentajes?.length > 0 && <div>{persona.porcentajes.join(" · ")}%</div>}
                      {persona.valores?.length > 0 && <div>{persona.valores.join(" · ")}</div>}
                      {!persona.porcentajes?.length && !persona.valores?.length && "—"}
                    </td>
                    <td>{(persona.fuentes || []).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPaginas > 1 && (
            <div className="vec-support-pagination">
              <span>Página {resultado.pagina} de {totalPaginas}</span>
              <div>
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => setPagina((current) => Math.max(1, current - 1))}
                  disabled={pagina <= 1 || cargandoBeneficiarios}
                >Anterior</button>
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => setPagina((current) => Math.min(totalPaginas, current + 1))}
                  disabled={pagina >= totalPaginas || cargandoBeneficiarios}
                >Siguiente</button>
              </div>
            </div>
          )}
          {resultado.sinTipoApoyo > 0 && (
            <p className="text-muted" style={{ margin: "0.75rem 0 0" }}>
              Hay {resultado.sinTipoApoyo} {resultado.sinTipoApoyo === 1 ? "registro de actividad sin tipo de apoyo explícito" : "registros de actividad sin tipo de apoyo explícito"}. Cuando hay una ruta activa que coincide, se muestra su categoría; los demás quedan como sin clasificar.
            </p>
          )}
        </div>
      ) : null}
      {resultado && resultado.rutas?.length > 0 && (
        <div className="vec-support-local-notice" style={{ marginTop: "1rem" }}>
          <h3 className="card-title">Apoyos y servicios disponibles</h3>
          <p className="text-muted">Rutas institucionales asociadas a este tipo de apoyo.</p>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Apoyo / servicio</th>
                  <th>Programa</th>
                  <th>Dependencia</th>
                  <th>Responsable</th>
                </tr>
              </thead>
              <tbody>
                {resultado.rutas.map((ruta) => (
                  <tr key={ruta.id}>
                    <td>
                      <strong>{ruta.nombre}</strong>
                      {ruta.observaciones && <div className="text-muted">{ruta.observaciones}</div>}
                    </td>
                    <td>{ruta.programa || "—"}</td>
                    <td>{ruta.dependencia || "—"}</td>
                    <td>{ruta.responsable || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
