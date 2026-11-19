import assert from "node:assert/strict";
import test from "node:test";
import { agruparAdministrativos } from "./administrativosSync.service.js";

test("consolida cargos y dependencias de filas repetidas por identificación", () => {
  const { administrativos, sinIdentificacion } = agruparAdministrativos([
    {
      identificacion: "123",
      primerNombre: "Ana",
      segundoNombre: "Maria",
      primerApellido: "Perez",
      segundoApellido: "Lopez",
      correo: "ANA@EXAMPLE.ORG ",
      cargo: "Auxiliar",
      vinculacion: "Planta",
      dependencia: "Bienestar",
    },
    {
      identificacion: "123",
      primerNombre: "Ana",
      segundoNombre: "Maria",
      primerApellido: "Perez",
      segundoApellido: "Lopez",
      correo: "ana@example.org",
      cargo: "Coordinadora",
      vinculacion: "Contrato",
      dependencia: "Rectoría",
    },
    { identificacion: "", primerNombre: "Sin identificación" },
  ]);

  assert.equal(sinIdentificacion, 1);
  assert.equal(administrativos.length, 1);
  assert.equal(administrativos[0].nombrePartes.primero, "Ana");
  assert.equal(administrativos[0].nombrePartes.segundo, "Maria");
  assert.equal(administrativos[0].apellidos, "Perez Lopez");
  assert.equal(administrativos[0].correo, "ana@example.org");
  assert.equal(
    administrativos[0].cargo,
    "Auxiliar (Planta) · Coordinadora (Contrato)",
  );
  assert.equal(administrativos[0].dependencia, "Bienestar · Rectoría");
});

test("rechaza datos que no caben en los campos del perfil", () => {
  assert.throws(
    () => agruparAdministrativos([
      {
        identificacion: "123",
        primerNombre: "A".repeat(31),
      },
    ]),
    /límite de 30 caracteres/,
  );
});
