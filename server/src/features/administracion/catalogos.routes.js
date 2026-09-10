/* ==========================================================================
   Feature: Administración - Catálogos administrables (solo admin)
   ==========================================================================
   CRUD de los catálogos que antes estaban hardcodeados en los paneles de
   Remisiones e Intervenciones. Mismo patrón que administracion.routes.js
   /usuarios: PostgreSQL real (schema `sat`) vía shared/db/pool.js, y el
   "borrado" es un soft-flag sobre la columna `activo` (no hay DELETE real).

   Estas rutas cuelgan de /api/administracion (se montan dentro de
   administracion.routes.js), así que heredan su guard (identifyUser +
   requireModule("administracion")).

     GET    /areas-remision            -> lista (incluye inhabilitadas)
     POST   /areas-remision            -> alta   { nombre, esConfidencialidad? }
     PUT    /areas-remision/:id         -> editar { nombre?, esConfidencialidad? }
     PATCH  /areas-remision/:id         -> activar/inhabilitar { activo }
     ... idem /estados-remision y /tipos-intervencion

   Inhabilitar (activo=false) solo saca el ítem de los <select> de creación
   de registros nuevos; los registros históricos que ya lo referencian lo
   siguen mostrando (mismo criterio que /usuarios).

     - areas-remision     <-> sat.dependencias  (tipo = 'AREA_ATENCION')
     - estados-remision   <-> sat.estados_remision
     - tipos-intervencion <-> sat.tipos_intervencion
   ========================================================================== */

import { Router } from "express";
import { query } from "../../shared/db/pool.js";

// `tipo` con el que se marcan las filas de sat.dependencias que son áreas de
// atención destino de remisión: la misma tabla modela también programas
// académicos y unidades administrativas, que NO se administran desde acá.
const TIPO_AREA_REMISION = "AREA_ATENCION";

const txt = (v) => (typeof v === "string" ? v.trim() : "");

// --------------------------------------------------------------------------
// Fábrica de router CRUD para un catálogo simple del schema `sat`.
//   proyeccion  -> lista de columnas (con alias) a la forma JSON del cliente
//   orden       -> ORDER BY del listado
//   filtroLista -> WHERE opcional del listado (constante, no entrada de usuario)
//   buildInsert / buildUpdate -> devuelven { cols, values, raw?, error? }
//                                `raw` = { col: "expr SQL" } para valores no
//                                posicionales (p. ej. MAX(orden)+1).
// --------------------------------------------------------------------------
function routerCatalogo({ tabla, idCol, proyeccion, orden, filtroLista, buildInsert, buildUpdate }) {
  const router = Router();
  const where = filtroLista ? `WHERE ${filtroLista}` : "";
  const selectUno = `SELECT ${proyeccion} FROM sat.${tabla} WHERE ${idCol} = $1`;
  const noEncontrado = { error: "No se encontró el elemento del catálogo solicitado." };

  const mapPg = (err, nombre) => {
    if (err.code === "23505") {
      err.status = 409;
      err.message = `Ya existe un elemento con el nombre "${nombre}".`;
    }
    return err;
  };

  router.get("/", async (req, res, next) => {
    try {
      const { rows } = await query(`SELECT ${proyeccion} FROM sat.${tabla} ${where} ORDER BY ${orden}`);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req, res, next) => {
    const spec = buildInsert(req.body);
    if (spec.error) return res.status(400).json({ error: spec.error });

    const rawEntries = Object.entries(spec.raw || {});
    const cols = [...spec.cols, ...rawEntries.map(([c]) => c)];
    const placeholders = [
      ...spec.cols.map((_, i) => `$${i + 1}`),
      ...rawEntries.map(([, expr]) => expr)
    ];
    try {
      const { rows: creado } = await query(
        `INSERT INTO sat.${tabla} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING ${idCol}`,
        spec.values
      );
      const { rows } = await query(selectUno, [creado[0][idCol]]);
      res.status(201).json(rows[0]);
    } catch (err) {
      next(mapPg(err, req.body.nombre));
    }
  });

  router.put("/:id", async (req, res, next) => {
    const spec = buildUpdate(req.body);
    if (spec.error) return res.status(400).json({ error: spec.error });
    try {
      const sets = spec.cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
      const { rowCount } = await query(
        `UPDATE sat.${tabla} SET ${sets} WHERE ${idCol} = $${spec.cols.length + 1}`,
        [...spec.values, req.params.id]
      );
      if (!rowCount) return res.status(404).json(noEncontrado);
      const { rows } = await query(selectUno, [req.params.id]);
      res.json(rows[0]);
    } catch (err) {
      if (err.code === "22P02") return res.status(404).json(noEncontrado); // id no es uuid
      next(mapPg(err, req.body.nombre));
    }
  });

  router.patch("/:id", async (req, res, next) => {
    if (typeof req.body.activo !== "boolean") {
      return res.status(400).json({ error: "Envíe { activo: true | false }." });
    }
    try {
      const { rowCount } = await query(
        `UPDATE sat.${tabla} SET activo = $1 WHERE ${idCol} = $2`,
        [req.body.activo, req.params.id]
      );
      if (!rowCount) return res.status(404).json(noEncontrado);
      const { rows } = await query(selectUno, [req.params.id]);
      res.json(rows[0]);
    } catch (err) {
      if (err.code === "22P02") return res.status(404).json(noEncontrado);
      next(err);
    }
  });

  return router;
}

// --- Áreas de destino de remisión (sat.dependencias) ---------------------
const areasRemision = routerCatalogo({
  tabla: "dependencias",
  idCol: "id_dependencias",
  proyeccion: `id_dependencias AS id, nombre, activo, es_confidencialidad_especial AS "esConfidencialidad"`,
  orden: "nombre",
  filtroLista: `tipo = '${TIPO_AREA_REMISION}'`,
  buildInsert: (b) => {
    const nombre = txt(b.nombre);
    if (!nombre) return { error: "El nombre del área es obligatorio." };
    return {
      cols: ["nombre", "tipo", "es_confidencialidad_especial"],
      values: [nombre, TIPO_AREA_REMISION, b.esConfidencialidad === true]
    };
  },
  buildUpdate: (b) => {
    const cols = [];
    const values = [];
    if (b.nombre !== undefined) {
      const nombre = txt(b.nombre);
      if (!nombre) return { error: "El nombre del área no puede quedar vacío." };
      cols.push("nombre");
      values.push(nombre);
    }
    if (b.esConfidencialidad !== undefined) {
      cols.push("es_confidencialidad_especial");
      values.push(b.esConfidencialidad === true);
    }
    if (!cols.length) return { error: "No hay cambios para guardar." };
    return { cols, values };
  }
});

// --- Estados de remisión (sat.estados_remision) -------------------------
const estadosRemision = routerCatalogo({
  tabla: "estados_remision",
  idCol: "id_estados_remision",
  proyeccion: `id_estados_remision AS id, nombre, orden, es_final AS "esFinal", activo`,
  orden: "orden",
  buildInsert: (b) => {
    const nombre = txt(b.nombre);
    if (!nombre) return { error: "El nombre del estado es obligatorio." };
    const cols = ["nombre", "es_final"];
    const values = [nombre, b.esFinal === true];
    if (b.orden !== undefined && Number.isFinite(Number(b.orden))) {
      cols.push("orden");
      values.push(Number(b.orden));
      return { cols, values };
    }
    // sin `orden` explícito -> se ubica al final de la secuencia actual
    return { cols, values, raw: { orden: "COALESCE((SELECT MAX(orden) FROM sat.estados_remision), 0) + 1" } };
  },
  buildUpdate: (b) => {
    const cols = [];
    const values = [];
    if (b.nombre !== undefined) {
      const nombre = txt(b.nombre);
      if (!nombre) return { error: "El nombre del estado no puede quedar vacío." };
      cols.push("nombre");
      values.push(nombre);
    }
    if (b.esFinal !== undefined) {
      cols.push("es_final");
      values.push(b.esFinal === true);
    }
    if (b.orden !== undefined && Number.isFinite(Number(b.orden))) {
      cols.push("orden");
      values.push(Number(b.orden));
    }
    if (!cols.length) return { error: "No hay cambios para guardar." };
    return { cols, values };
  }
});

// --- Tipos de intervención (sat.tipos_intervencion) --------------------
const tiposIntervencion = routerCatalogo({
  tabla: "tipos_intervencion",
  idCol: "id_tipos_intervencion",
  proyeccion: `id_tipos_intervencion AS id, nombre, descripcion, activo`,
  orden: "nombre",
  buildInsert: (b) => {
    const nombre = txt(b.nombre);
    if (!nombre) return { error: "El nombre del tipo de intervención es obligatorio." };
    return { cols: ["nombre", "descripcion"], values: [nombre, txt(b.descripcion) || null] };
  },
  buildUpdate: (b) => {
    const cols = [];
    const values = [];
    if (b.nombre !== undefined) {
      const nombre = txt(b.nombre);
      if (!nombre) return { error: "El nombre del tipo de intervención no puede quedar vacío." };
      cols.push("nombre");
      values.push(nombre);
    }
    if (b.descripcion !== undefined) {
      cols.push("descripcion");
      values.push(txt(b.descripcion) || null);
    }
    if (!cols.length) return { error: "No hay cambios para guardar." };
    return { cols, values };
  }
});

const router = Router();
router.use("/areas-remision", areasRemision);
router.use("/estados-remision", estadosRemision);
router.use("/tipos-intervencion", tiposIntervencion);

export default router;
