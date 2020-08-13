const express = require('express');
const router = express.Router();
const {isloggedin} = require('../lib/auth');

const pool = require('../database');


router.get('/add',isloggedin, async (req, res) => {
    const tipocomercio = await pool.query('SELECT * FROM tipo_comercio');
    console.log(tipocomercio);
    res.render('citaprevia/add', { tipocomercio });
});

router.get('/calendar',isloggedin, async (req, res, next) => {
   
    res.render('citaprevia/calendar',{
        title: "Calendar",
        scripts: ["citaprevia/calendar.js"]
    });
});

router.post('/add', async (req, res) => {
    const { nombre_tienda, telefono, direccion } = req.body;
    const newLink = {
        nombre_tienda,
        telefono,
        direccion,
        user_id:req.user.ID
        
    };
    console.log(newLink);
    await pool.query('INSERT INTO citaprevia set ?', [newLink]);
    req.flash('success', 'Link Saved Successfully');
    res.redirect('/citaprevia');
});
    
router.get('/', isloggedin, async (req, res) => {
    const citaprevia1 = await pool.query('SELECT * FROM citaprevia WHERE user_id = ?', [req.user.ID]);
    res.render('citaprevia/list', { citaprevia1 });
});

/*router.get('/delete/:ID', async (req, res) => {
    const { ID } = req.params;
    await pool.query('DELETE FROM citaprevia WHERE ID = ?', [ID]);
    req.flash('success', 'Link Removed Successfully');
    res.redirect('/citaprevia');
    console.log(req.params);
});*/



/*router.get('/edit/:ID', async (req, res) => {
    console.log(req.params);
    const { ID } = req.params;
    const citaprevia = await pool.query('SELECT * FROM citaprevia WHERE ID = ?', [ID]);
    res.render('citaprevia/edit', { citaprevia: citaprevia[0] });

});

router.post('/edit/:ID', async (req, res) => {
    const { ID } = req.params;
    const { nombre_tienda, direccion, telefono } = req.body;
    const newLink = {
        nombre_tienda,
        direccion,
        telefono
    };
    await pool.query('UPDATE citaprevia set ? WHERE ID = ?', [newLink, ID]);
    req.flash('success', 'Link Updated Successfully');
    res.redirect('/citaprevia');
});*/



module.exports = router;