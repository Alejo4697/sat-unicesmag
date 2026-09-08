/* ==========================================================================
   Envoltorio mínimo de Chart.js para React: crea el Chart en el <canvas>
   al montar, lo destruye al desmontar y lo actualiza cuando cambian type
   o data/options (comparados por referencia, así que el llamador debe
   pasar objetos nuevos cuando los datos cambien). Reemplaza al patrón
   `new Chart(ctx, {...})` que usaba dashboard.js directamente sobre el DOM.
   ========================================================================== */

import { useEffect, useRef } from "react";
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

export default function ChartCanvas({ type, data, options, height = 260 }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current = new Chart(canvasRef.current, { type, data, options });
    return () => chartRef.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, data, options]);

  return (
    <div style={{ height, position: "relative" }}>
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}
