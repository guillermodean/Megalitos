const passport = require('passport');
const Strategy = require('passport-local').Strategy;

const pool = require('../database');
const helpers = require('../lib/helpers');

passport.use('local.signin', new Strategy({
    usernameField: 'username',
    passwordField: 'password',
    passReqToCallback: true
}, async (req, username, password, done) => {

    const rows = await pool.query('SELECT * FROM users WHERE username=?', [username])

    if (rows.length > 0) {
        const user = rows[0];
        const validpassword = helpers.matchPassword(password, user.password);
        if (validpassword) {
            done(null, user, req.flash('success','welcome garruler '));
        } else {
            done(null, false, req.flash('message','contraseña incorrecta'));
        }
    } else {
        return done(null, false, req.flash('el nombre de user no existe'));
    }
}));

passport.use('local.signup', new Strategy({
    usernameField: 'username',
    passwordField: 'password',
    passReqToCallback: true

}, async (req, username, password, done) => {

    const { fullname } = req.body;
    const newuser = {
        fullname,
        username,
        password
    };
    newuser.password = await helpers.encryptpassword(password);
    const result = await pool.query('INSERT INTO users SET ?', [newuser]);
    newuser.id = result.insertId;
    return done(null, newuser);

}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
    const rows = await pool.query('SELECT * FROM users WHERE ID=?', [id]);
    done(null, rows[0]);
});




