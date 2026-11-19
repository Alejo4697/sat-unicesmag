/* ==========================================================================
   SAT-UNICESMAG - Conexiones y Pools de PostgreSQL
   ==========================================================================
   Configuración centralizada de conexiones a bases de datos desde .env:
   - Base de datos local SAT (DataBasePractica): pool principal exportado como `pool`
   - Base de datos académica institucional (prod18sep2): `createAcademicClient()` y `hasAcademicConfig()`
   ========================================================================== */

import "dotenv/config";
import pg from "pg";

const { Pool, Client } = pg;

// 1. Pool principal de PostgreSQL (Base de datos local SAT)
export const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

pool.on("error", (err) => {
  console.error("Error inesperado en un cliente inactivo del pool de PostgreSQL", err);
});

export function query(text, params) {
  return pool.query(text, params);
}

// 2. Configuración y cliente para la Base de Datos Académica Institucional (prod18sep2)
export const academicConfig = {
  host: process.env.ACADEMIC_DB_HOST,
  port: process.env.ACADEMIC_DB_PORT ? Number(process.env.ACADEMIC_DB_PORT) : 5432,
  database: process.env.ACADEMIC_DB_NAME,
  user: process.env.ACADEMIC_DB_USER,
  password: process.env.ACADEMIC_DB_PASSWORD
};

export function hasAcademicConfig() {
  return Boolean(
    academicConfig.host &&
    academicConfig.user &&
    academicConfig.password &&
    academicConfig.database
  );
}

export function createAcademicClient() {
  if (!hasAcademicConfig()) {
    throw new Error(
      "Credenciales de la base de datos institucional no configuradas en variables de entorno (ACADEMIC_DB_*)."
    );
  }
  return new Client(academicConfig);
}
