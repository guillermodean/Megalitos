// const passport = require('passport');
// const Strategy = require('passport-local').Strategy;

// const pool = require('../database');
// const helpers = require('./helpers');

// passport.use('local.signin', new Strategy({
//   usernameField: 'username',
//   passwordField: 'password',
//   passReqToCallback: true
// }, async (req, username, password, done) => {
//   const rows = await pool.query('SELECT * FROM users WHERE username = ?', [username]);

//   if (rows.length > 0) {
//     const user = rows[0];
//     //console.log(rows);
//     //console.log(password);
//     //console.log(user);
//     const validPassword =  await helpers.matchPassword(password,user.Password);
//     //console.log(validPassword); TRUE
//     if (validPassword) {
//       done(null, user, req.flash('success', 'Welcome ' + user.username));
//     } else {
//       done(null, false, req.flash('message', 'Incorrect Password'));
//     }
//   } else {
//     return done(null, false, req.flash('message', 'The Username does not exists.'));
//   }
// }));

// passport.use('local.signup', new Strategy({
//   usernameField: 'username',
//   passwordField: 'password',
//   passReqToCallback: true
// }, async (req, username, password, done) => {

//   const { fullname } = req.body;
//   let newUser = {
//     fullname,
//     username,
//     password
//   };
//   newUser.password = await helpers.encryptpassword(password);

//   // Saving in the Database
//   const result = await pool.query('INSERT INTO users SET ? ', [newUser]);
//   newUser.ID = result.insertId;
//   return done(null, newUser);
// }));

// passport.serializeUser((user, done) => {
//   //console.log(user);  
//   done(null, user.ID);
// });

// passport.deserializeUser(async (ID, done) => {
//   const rows = await pool.query('SELECT * FROM users WHERE ID = ?', [ID]);
//   done(null, rows[0]);
// });