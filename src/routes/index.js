const express = require ( 'express');
const router = express.Router(); //devuelve un objeto en la constate router

router.get('/', (req,res)=>{
res.render('./index.hbs');

})
module.exports = router;
