const express = require('express');
const router = express.Router();
const pool = require('../database'); //debería llamarlo db 
const { isloggedin } = require('../lib/auth');

router.get('/introducir', isloggedin, (req, res) => {
    res.render('users/introducir');
})
router.get('/list', isloggedin, (req, res) => {
    res.render('users/list');
})


router.post('/introducir', async (req, res) => {

    const { username, Password, fullname } = req.body;
    const newuser = {
        username,
        Password,
        fullname
    }
    console.log(newuser);
    await pool.query('INSERT INTO users set ?', [newuser])
    res.redirect('/users');
    req.flash('success', 'usuario agregado correctamente');

});


router.get('/', isloggedin, async (req, res) => {
    const datosusuario = await pool.query('SELECT * FROM users');//WHERE fecha BETWEEN value1 AND value2
    //console.log(datos); //mete por consola todos los datos de la tabla
    res.render('users/list', { datosusuario: datosusuario });
})
router.get('/delete/:ID', isloggedin, async (req, res) => {
    const { ID } = req.params;
    await pool.query('DELETE FROM users WHERE ID=?', [ID])
    res.redirect('/users');
    req.flash('success', 'Eliminado satisfactoriamente')

})
router.get('/edit/:ID', isloggedin, async (req, res) => {
    const { ID } = req.params;
    const usuarios = await pool.query('SELECT*FROM users WHERE ID=?', [ID])
    console.log(usuarios[0]);
    res.render('users/edit', { usuarios: usuarios[0] })
})

router.post('/edit/:ID', isloggedin, async (req, res) => {
    const { ID } = req.params;
    const { username, Password, fullname } = req.body
    const newuser = {
        username,
        Password,
        fullname
    };
    await pool.query('UPDATE users set ? WHERE ID=?', [newuser, ID]);
    res.redirect('/users')
    res.flash('success', 'Editado')
})

module.exports = router;
