const express = require('express');
const morgan = require('morgan');
const exphbs = require('express-handlebars');
const path = require('path');
const flash = require('connect-flash');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const { database } = require('./keys');
const passport = require('passport');
//const Strategy = require('passport-local').Strategy;
//const validator = require('express-validator');

//initialization

const app = express();
require('./lib/passport');

//settings


app.set('port', process.env.PORT || 8000) //defininos en port el valor 4000 para la aplicación

app.set('views', path.join(__dirname, 'views')); //definimos el path de views

app.engine('.hbs', exphbs({                  //definimos el motor de plantillas y sus paths para luego trabajar más facil con html.
    defaultlayout: 'main.hbs',
    layoutsDir: path.join(app.get('views'), 'layout'),
    partialsDir: path.join(app.get('views'), 'partials'),
    extname: '.hbs',
    helpers: require('./lib/handlebars.js')
}))

app.set('view engine', '.hbs');


//middleware



app.use(flash());

app.use(morgan('dev'));

app.use(express.urlencoded({ extended: false }));

app.use('/table', express.json());

app.use(passport.initialize());

app.use(passport.session());

//app.use(validator());


//global variables

app.use((req, res, next) => {

    app.locals.user=req.user;
    next();

});

//routes


app.use(require('./routes/index.js'));

app.use('/table', require('./routes/table.js'));

app.use('/information',require('./routes/information.js'));




//Public

app.use(express.static(path.join(__dirname, 'public')));

//starting server
let port = process.env.PORT;
if (port == null || port == "") {
  port = 8000;
}
app.listen(port);
//app.listen(app.get('port'), () => {
//    console.log('server funcionando en el puerto', app.get('port'));
//});



