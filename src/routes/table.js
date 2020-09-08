const express = require('express');
const router = express.Router();
const pool = require('../database'); //debería llamarlo db 
const { isloggedin } = require('../lib/auth');

router.get('/introducir', (req, res) => {
    res.render('table/introducir');
})
router.get('/list', (req, res) => {
    res.render('table/list');
})

router.get('/vista/:ID', async (req, res) => {
    const { ID } = req.params;
    //console.log(req.params);
    const card= await pool.query('SELECT `Id`, `Nombre`,`Des_clas`, `Municipio`, `Ubicacion`, `Itinerario texto`, `Itinerario`, `UTM_X`, `UTM_Y`, `UTM_Z`, `Coordenadas`, `Localizado_fecha`, `Localizado_autor`, `Descripcion`, `Excavacion`, `Observaciones`, `Características`, `Otros aspectos`, `Anexo_tipo_1`, `Anexo_path_1`, `Anexo_tipo_2`, `Anexo_path_2`, `Anexo_tipo_3`, `Anexo_path_3`, `Anexo_tipo_4`, `Anexo_path_4`, `Anexo_tipo_5`, `Anexo_path_5`, `Anexo_tipo_6`, `Anexo_path_6`, `Anexo_tipo_7`, `Anexo_path_7`, `Anexo_tipo_8`, `Anexo_path_8` FROM fichas WHERE ID=?', [ID]);
    //console.log(card);
    res.render('table/vista',{ card: card });

})

router.post('/introducir', async (req, res) => {
    //const {selectorfecha1, selectorfecha2 }=req.body;
    //const F1= {selectorfecha1}
    //const F2={selectorfecha2}
    //yo solo quiero introducir -- esta parte del código es para guardar datos en la BBDD
    const { Fecha, Humedad, Temperatura } = req.body;
    const newvalue = {
        Fecha,
        Humedad,
        Temperatura
    }
    console.log(newvalue);
    await pool.query('INSERT INTO thtable set ?', [newvalue])
    res.redirect('/table');

});


router.post('/',async (req,res)=>{
    const {busqueda}=req.body;
    busqueda1='%'+busqueda+'%';
    //console.log(busqueda);
    const datos=await pool.query('SELECT Id,Nombre,clasificacion.Descripcion,clasificacion.ID_clas,Municipio FROM `fichas` inner join clasificacion ON clasificacion.ID_clas=fichas.ID_clas WHERE Nombre LIKE ?',[busqueda1])
    //console.log(datos);
    res.render('table/list',{datos:datos});

})
router.get('/', async (req, res) => {
    const datos = await pool.query('SELECT Id,Nombre,clasificacion.Descripcion,clasificacion.ID_clas,Municipio FROM `fichas` inner join clasificacion ON clasificacion.ID_clas=fichas.ID_clas ORDER BY Id ASC');//WHERE fecha BETWEEN value1 AND value2
    //console.log(datos); //mete por consola todos los datos de la tabla
    //const datos_clasificacion = Object.assign(datos, clasificacion  );
    //const tipo= await pool.query('SELECT ID_clas,Descripcion FROM `clasificacion`');
    //console.log(tipo);
    res.render('table/list',{datos:datos});//{clasificacion:clasificacion});//{ datos: datos });
    
})

router.get('/delete/:ID', async (req, res) => {
    const { ID } = req.params;
    await pool.query('DELETE FROM thtable WHERE ID=?', [ID])
    res.redirect('/table');

})



module.exports = router;
