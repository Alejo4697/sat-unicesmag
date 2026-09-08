/* ==========================================================================
   Helpers de semaforización de riesgo (Alto/Medio/Bajo), reutilizados por
   Ficha 360°, Alertas, Remisiones y el resultado de Caracterización.
   ========================================================================== */

export function riskBadgeClass(nivel) {
  if (nivel === "Alto" || nivel === "Muy Alto") return "badge-risk-high";
  if (nivel === "Medio") return "badge-risk-medium";
  return "badge-risk-low";
}

export function riskBoxStyle(nivel) {
  const key = nivel === "Alto" ? "high" : nivel === "Medio" ? "medium" : "low";
  return {
    background: `var(--risk-${key}-bg)`,
    border: `1px solid var(--risk-${key}-border)`,
    color: `var(--risk-${key}-text)`
  };
}
