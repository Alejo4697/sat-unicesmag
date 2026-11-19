import { query } from "../../../../database/pool.js";

const TIPO_AREA_REMISION = "AREA_ATENCION";
const txt = (v) => (typeof v === "string" ? v.trim() : "");

export async function listarAreas() {
  const { rows } = await query(
    `SELECT id_dependencias AS id, nombre, activo, es_confidencialidad_especial AS "esConfidencialidad"
     FROM sat.dependencias
     WHERE tipo = '${TIPO_AREA_REMISION}'
     ORDER BY nombre`
  );
  return rows;
}

export async function crearArea(body) {
  const nombre = txt(body.nombre);
  if (!nombre) {
    const error = new Error("El nombre del área es obligatorio.");
    error.status = 400;
    throw error;
  }
  const esConf = body.esConfidencialidad === true;
  const { rows: creado } = await query(
    `INSERT INTO sat.dependencias (nombre, tipo, es_confidencialidad_especial)
     VALUES ($1, $2, $3) RETURNING id_dependencias AS id`,
    [nombre, TIPO_AREA_REMISION, esConf]
  );
  const { rows } = await query(
    `SELECT id_dependencias AS id, nombre, activo, es_confidencialidad_especial AS "esConfidencialidad"
     FROM sat.dependencias WHERE id_dependencias = $1`,
    [creado[0].id]
  );
  return rows[0];
}

export async function actualizarArea(id, body) {
  const cols = [];
  const values = [];
  if (body.nombre !== undefined) {
    const nombre = txt(body.nombre);
    if (!nombre) {
      const error = new Error("El nombre del área no puede quedar vacío.");
      error.status = 400;
      throw error;
    }
    cols.push("nombre");
    values.push(nombre);
  }
  if (body.esConfidencialidad !== undefined) {
    cols.push("es_confidencialidad_especial");
    values.push(body.esConfidencialidad === true);
  }
  if (!cols.length) {
    const error = new Error("No hay cambios para guardar.");
    error.status = 400;
    throw error;
  }

  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const { rowCount } = await query(
    `UPDATE sat.dependencias SET ${sets} WHERE id_dependencias = $${cols.length + 1}`,
    [...values, id]
  );
  if (!rowCount) {
    const error = new Error("No se encontró el elemento del catálogo solicitado.");
    error.status = 404;
    throw error;
  }
  const { rows } = await query(
    `SELECT id_dependencias AS id, nombre, activo, es_confidencialidad_especial AS "esConfidencialidad"
     FROM sat.dependencias WHERE id_dependencias = $1`,
    [id]
  );
  return rows[0];
}

export async function toggleArea(id, activo) {
  if (typeof activo !== "boolean") {
    const error = new Error("Envíe { activo: true | false }.");
    error.status = 400;
    throw error;
  }
  const { rowCount } = await query(
    `UPDATE sat.dependencias SET activo = $1 WHERE id_dependencias = $2`,
    [activo, id]
  );
  if (!rowCount) {
    const error = new Error("No se encontró el elemento del catálogo solicitado.");
    error.status = 404;
    throw error;
  }
  const { rows } = await query(
    `SELECT id_dependencias AS id, nombre, activo, es_confidencialidad_especial AS "esConfidencialidad"
     FROM sat.dependencias WHERE id_dependencias = $1`,
    [id]
  );
  return rows[0];
}

export async function listarEstados() {
  const { rows } = await query(
    `SELECT id_estados_remision AS id, nombre, orden, es_final AS "esFinal", activo
     FROM sat.estados_remision
     ORDER BY orden`
  );
  return rows;
}

export async function crearEstado(body) {
  const nombre = txt(body.nombre);
  if (!nombre) {
    const error = new Error("El nombre del estado es obligatorio.");
    error.status = 400;
    throw error;
  }
  const esFinal = body.esFinal === true;
  let cols = ["nombre", "es_final"];
  let values = [nombre, esFinal];
  let placeholders = ["$1", "$2"];

  if (body.orden !== undefined && Number.isFinite(Number(body.orden))) {
    cols.push("orden");
    values.push(Number(body.orden));
    placeholders.push("$3");
  } else {
    cols.push("orden");
    placeholders.push("COALESCE((SELECT MAX(orden) FROM sat.estados_remision), 0) + 1");
  }

  const { rows: creado } = await query(
    `INSERT INTO sat.estados_remision (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING id_estados_remision AS id`,
    values
  );
  const { rows } = await query(
    `SELECT id_estados_remision AS id, nombre, orden, es_final AS "esFinal", activo
     FROM sat.estados_remision WHERE id_estados_remision = $1`,
    [creado[0].id]
  );
  return rows[0];
}

export async function actualizarEstado(id, body) {
  const cols = [];
  const values = [];
  if (body.nombre !== undefined) {
    const nombre = txt(body.nombre);
    if (!nombre) {
      const error = new Error("El nombre del estado no puede quedar vacío.");
      error.status = 400;
      throw error;
    }
    cols.push("nombre");
    values.push(nombre);
  }
  if (body.esFinal !== undefined) {
    cols.push("es_final");
    values.push(body.esFinal === true);
  }
  if (body.orden !== undefined && Number.isFinite(Number(body.orden))) {
    cols.push("orden");
    values.push(Number(body.orden));
  }
  if (!cols.length) {
    const error = new Error("No hay cambios para guardar.");
    error.status = 400;
    throw error;
  }

  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const { rowCount } = await query(
    `UPDATE sat.estados_remision SET ${sets} WHERE id_estados_remision = $${cols.length + 1}`,
    [...values, id]
  );
  if (!rowCount) {
    const error = new Error("No se encontró el elemento del catálogo solicitado.");
    error.status = 404;
    throw error;
  }
  const { rows } = await query(
    `SELECT id_estados_remision AS id, nombre, orden, es_final AS "esFinal", activo
     FROM sat.estados_remision WHERE id_estados_remision = $1`,
    [id]
  );
  return rows[0];
}

export async function toggleEstado(id, activo) {
  if (typeof activo !== "boolean") {
    const error = new Error("Envíe { activo: true | false }.");
    error.status = 400;
    throw error;
  }
  const { rowCount } = await query(
    `UPDATE sat.estados_remision SET activo = $1 WHERE id_estados_remision = $2`,
    [activo, id]
  );
  if (!rowCount) {
    const error = new Error("No se encontró el elemento del catálogo solicitado.");
    error.status = 404;
    throw error;
  }
  const { rows } = await query(
    `SELECT id_estados_remision AS id, nombre, orden, es_final AS "esFinal", activo
     FROM sat.estados_remision WHERE id_estados_remision = $1`,
    [id]
  );
  return rows[0];
}

export async function listarTipos() {
  const { rows } = await query(
    `SELECT id_tipos_intervencion AS id, nombre, descripcion, activo
     FROM sat.tipos_intervencion
     ORDER BY nombre`
  );
  return rows;
}

export async function crearTipo(body) {
  const nombre = txt(body.nombre);
  if (!nombre) {
    const error = new Error("El nombre del tipo de intervención es obligatorio.");
    error.status = 400;
    throw error;
  }
  const { rows: creado } = await query(
    `INSERT INTO sat.tipos_intervencion (nombre, descripcion) VALUES ($1, $2) RETURNING id_tipos_intervencion AS id`,
    [nombre, txt(body.descripcion) || null]
  );
  const { rows } = await query(
    `SELECT id_tipos_intervencion AS id, nombre, descripcion, activo
     FROM sat.tipos_intervencion WHERE id_tipos_intervencion = $1`,
    [creado[0].id]
  );
  return rows[0];
}

export async function actualizarTipo(id, body) {
  const cols = [];
  const values = [];
  if (body.nombre !== undefined) {
    const nombre = txt(body.nombre);
    if (!nombre) {
      const error = new Error("El nombre del tipo de intervención no puede quedar vacío.");
      error.status = 400;
      throw error;
    }
    cols.push("nombre");
    values.push(nombre);
  }
  if (body.descripcion !== undefined) {
    cols.push("descripcion");
    values.push(txt(body.descripcion) || null);
  }
  if (!cols.length) {
    const error = new Error("No hay cambios para guardar.");
    error.status = 400;
    throw error;
  }

  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const { rowCount } = await query(
    `UPDATE sat.tipos_intervencion SET ${sets} WHERE id_tipos_intervencion = $${cols.length + 1}`,
    [...values, id]
  );
  if (!rowCount) {
    const error = new Error("No se encontró el elemento del catálogo solicitado.");
    error.status = 404;
    throw error;
  }
  const { rows } = await query(
    `SELECT id_tipos_intervencion AS id, nombre, descripcion, activo
     FROM sat.tipos_intervencion WHERE id_tipos_intervencion = $1`,
    [id]
  );
  return rows[0];
}

export async function toggleTipo(id, activo) {
  if (typeof activo !== "boolean") {
    const error = new Error("Envíe { activo: true | false }.");
    error.status = 400;
    throw error;
  }
  const { rowCount } = await query(
    `UPDATE sat.tipos_intervencion SET activo = $1 WHERE id_tipos_intervencion = $2`,
    [activo, id]
  );
  if (!rowCount) {
    const error = new Error("No se encontró el elemento del catálogo solicitado.");
    error.status = 404;
    throw error;
  }
  const { rows } = await query(
    `SELECT id_tipos_intervencion AS id, nombre, descripcion, activo
     FROM sat.tipos_intervencion WHERE id_tipos_intervencion = $1`,
    [id]
  );
  return rows[0];
}
