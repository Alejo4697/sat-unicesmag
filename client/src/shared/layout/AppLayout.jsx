/* ==========================================================================
   AppLayout - el "chrome" (sidebar + topbar + .content-area) que se
   repetía copiado y pegado en cada .html original dentro de
   <div class="app-container">. Cada página de cada feature solo pone su
   contenido dentro de <AppLayout>.
   ========================================================================== */

import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";

export default function AppLayout({ titulo, breadcrumb, children }) {
  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-wrapper">
        <Topbar titulo={titulo} breadcrumb={breadcrumb} />
        <main className="content-area">{children}</main>
      </div>
    </div>
  );
}
