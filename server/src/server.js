import "dotenv/config";
import { createApp } from "./app.js";
import { setupTables } from "./shared/db/setup_tables.js";
import { iniciarSincronizadorAutomatico } from "./shared/services/autoSyncScheduler.js";

const PORT = process.env.PORT || 4000;
const app = createApp();

setupTables().catch((err) => console.error("Error al inicializar tablas en BD:", err.message));

app.listen(PORT, () => {
  console.log(`[OK] API SAT-UNICESMAG escuchando en http://localhost:${PORT}`);
  // Iniciar servicio de sincronización automática en segundo plano (cada 30 min y por detección de cambios)
  iniciarSincronizadorAutomatico(30);
});

