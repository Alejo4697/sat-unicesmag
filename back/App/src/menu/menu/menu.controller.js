import * as menuService from "./menu.service.js";

/**
 * Controlador de Menú
 */
export async function getMenu(req, res, next) {
  try {
    const menu = await menuService.obtenerMenuPorRol(req.user.rol);
    res.json(menu);
  } catch (err) {
    next(err);
  }
}

export async function getPermisos(req, res, next) {
  try {
    const permisos = await menuService.obtenerMapaPermisos();
    res.json(permisos);
  } catch (err) {
    next(err);
  }
}
