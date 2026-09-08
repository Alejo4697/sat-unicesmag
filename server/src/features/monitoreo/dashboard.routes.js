/* ==========================================================================
   Feature: Monitoreo (Tablero General - sección "Monitoreo" del menú)
   GET /api/dashboard                    -> estadísticas para el tablero general
   GET /api/dashboard/riesgo-dimensiones -> conteo de riesgo Alto/Medio/Bajo
                                             por dimensión, agregado de los
                                             envíos reales del instrumento de
                                             Caracterización (MOCK_DATA.caracterizaciones).

   En el mockup original (dashboard.js) este segundo gráfico usaba números
   fijos inventados en el propio JS. Acá se agregan de verdad los envíos
   que ya se guardaron - si todavía no hay ninguno, se responde con ceros
   en vez de inventar datos, y el cliente lo muestra como "aún sin datos".
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";

const router = Router();

router.use(identifyUser, requireModule("dashboard"));

router.get("/", (req, res) => {
  res.json(MOCK_DATA.dashboardStats);
});

router.get("/riesgo-dimensiones", (req, res) => {
  const conteos = {}; // { IND: { Alto: 0, Medio: 0, Bajo: 0 }, ... }

  MOCK_DATA.caracterizaciones.forEach((envio) => {
    Object.entries(envio.porDimension).forEach(([dim, val]) => {
      if (!conteos[dim]) conteos[dim] = { Alto: 0, Medio: 0, Bajo: 0 };
      conteos[dim][val.riesgo] += 1;
    });
  });

  res.json({ dimensiones: conteos, totalEnvios: MOCK_DATA.caracterizaciones.length });
});

export default router;
