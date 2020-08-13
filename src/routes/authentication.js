const express = require('express');
const router = express.Router();
const passport = require('passport');
const {isloggedin} = require('../lib/auth');
const {isnotloggedin}=require('../lib/auth');


//SIGNUP
router.get('/signup', (req, res) => {
    res.render('auth/signup');
});

router.post('/signup', passport.authenticate('local.signup', {
    successRedirect: '/profile',
    failureRedirect: '/signup',
    failureFlash: true
}));
//SIGNIN

router.get('/signin',isnotloggedin, (req, res) => {
    res.render('auth/signin');
});

router.post('/signin', (req, res, next) => {
    passport.authenticate('local.signin', {
        successRedirect: '/profile',
        failureRedirect: '/signin',
        failureFlash: true
    })(req, res, next);
});


router.get('/profile',isloggedin, (req, res) => {
    res.render('profile');
});

router.get('/logout',isloggedin, (req, res) => {
    req.logout();
    res.redirect('/signin');

})






module.exports = router;


