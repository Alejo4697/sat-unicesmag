export default function Topbar({ titulo, breadcrumb }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="mobile-toggle" onClick={() => document.getElementById("sidebar")?.classList.toggle("show")}>
          <i className="fas fa-bars"></i>
        </button>
        <div>
          <h1 className="topbar-title">{titulo}</h1>
          {breadcrumb && <span className="topbar-breadcrumb">{breadcrumb}</span>}
        </div>
      </div>

      <div className="topbar-right">{/* TODO: acciones específicas de cada página (filtros, botones) van aquí */}</div>
    </header>
  );
}
