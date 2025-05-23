const express = require("express");
const router = express.Router();
const pool = require("../database");

router.get("/list", (req, res) => {
  res.render("table/list");
});

router.get("/vista/:ID", async (req, res) => {
  const { ID } = req.params;
  try {
    const card = await pool.query(
      "SELECT `Id`, `Nombre`,`Des_clas`, `Municipio`, `Ubicacion`, `Itinerario_texto`, `Itinerario`, `UTM_X`, `UTM_Y`, `UTM_Z`, `Coordenadas`, `Localizado_fecha`, `Localizado_autor`, `Descripcion`, `Excavacion`, `Observaciones`, `Características`, `Otros_aspectos`, `Anexo_path_1`, `Anexo_path_2`, `Anexo_path_3`, `Anexo_path_4`, `Anexo_path_5`, `Anexo_path_6`, `Anexo_path_7`, `Anexo_path_8` FROM fichas WHERE ID=?",
      [ID]
    );
    if (Object.keys(card).length) {
      res.render("table/vista", { card: card });
    } else res.render("table/404", res.status(404));
  } catch (error) {
    console.log("Database query error", error);
    throw error;
  }
});

router.post("/", async (req, res) => {
  const { busqueda } = req.body;
  busqueda1 = "%" + busqueda + "%";
  const datos = await pool.query(
    "SELECT Id,Nombre,clasificacion.Descripcion,clasificacion.ID_clas,Municipio FROM `fichas` inner join clasificacion ON clasificacion.ID_clas=fichas.ID_clas WHERE Nombre LIKE ?",
    [busqueda1]
  );
  res.render("table/list", { datos: datos });
});
router.get("/", async (req, res) => {
  const datos = await pool.query(
    "SELECT Id, Nombre, ID_clas, Des_clas, Municipio, Ubicacion, Itinerario_texto, Itinerario, UTM_X, UTM_Y, UTM_Z, Coordenadas, Localizado_fecha, Localizado_autor, Descripcion, Excavacion, Observaciones, Características, Otros_aspectos, Anexo_path_1, Anexo_path_2, Anexo_path_3, Anexo_path_4, Anexo_path_5, Anexo_path_6, Anexo_path_7, Anexo_path_8, Anexo_path_9, Anexo_path_10, Anexo_path_11, Anexo_path_12, Anexo_path_13, Anexo_path_14, Anexo_path_15, Anexo_path_16, Anexo_path_17, Anexo_path_18, Anexo_path_19, Anexo_path_20, Anexo_path_21, Anexo_path_22, Anexo_path_23, Anexo_path_24, Anexo_path_25, Anexo_path_26, Anexo_path_27, Anexo_path_28, Anexo_path_29, Anexo_path_30, Anexo_path_31, Anexo_path_32, Anexo_path_33, Anexo_path_34, Anexo_path_35, Anexo_path_36, Anexo_path_37, Anexo_path_38, Anexo_path_39, Anexo_path_40, Anexo_path_41, Anexo_path_42, Anexo_path_43, Anexo_path_44, Anexo_path_45, Anexo_path_46, Anexo_path_47, Anexo_path_48, Anexo_path_49, Anexo_path_50, Anexo_path_51, Anexo_path_52, Anexo_path_53 FROM `fichas`"
  );
  res.render("table/list", { datos: datos });
});

module.exports = router;
