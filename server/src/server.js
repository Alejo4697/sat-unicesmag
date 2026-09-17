import "dotenv/config";
import { createApp } from "./app.js";
import { setupTables } from "./shared/db/setup_tables.js";

const PORT = process.env.PORT || 4000;
const app = createApp();

setupTables().catch((err) => console.error("Error al inicializar tablas en BD:", err.message));

app.listen(PORT, () => {
  console.log(`✅ API SAT-UNICESMAG escuchando en http://localhost:${PORT}`);
});

