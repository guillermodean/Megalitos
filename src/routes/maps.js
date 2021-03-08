const express = require('express');
const router = express.Router();
const pool = require('../database');

router.get('/', async(req, res) => {
    const coordenadas = await pool.query('SELECT Id, Nombre, Coordenadas FROM `fichas`');
    module.exports={coordenadas}
    res.render('maps/maps',{coordenadas:JSON.stringify(coordenadas)});
})

module.exports = router;

