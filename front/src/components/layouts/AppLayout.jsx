/* ==========================================================================
   AppLayout - el "chrome" (sidebar + topbar + .content-area) que se
   repetía copiado y pegado en cada .html original dentro de
   <div class="app-container">. Cada página de cada feature solo pone su
   contenido dentro de <AppLayout>.
   ========================================================================== */

import { useState } from "react";
import Sidebar from "@components/layouts/Sidebar.jsx";
import Topbar from "@components/layouts/Topbar.jsx";
import CambiarPasswordModal from "@components/layouts/CambiarPasswordModal.jsx";

export default function AppLayout({ titulo, breadcrumb, children }) {
  const [modalPasswordAbierto, setModalPasswordAbierto] = useState(false);

  return (
    <div className="app-container">
      <Sidebar onCambiarPassword={() => setModalPasswordAbierto(true)} />
      <div className="main-wrapper">
        <Topbar
          titulo={titulo}
          breadcrumb={breadcrumb}
          onCambiarPassword={() => setModalPasswordAbierto(true)}
        />
        <main className="content-area">{children}</main>
      </div>
      <CambiarPasswordModal
        abierto={modalPasswordAbierto}
        onClose={() => setModalPasswordAbierto(false)}
      />
    </div>
  );
}
