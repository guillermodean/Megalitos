const mysql= require('mysql');
const {database } = require('./keys');
const pool = mysql.createPool(database);
const {promisify}= require('util')
pool.getConnection((err,connection) =>{
if (err) {
    if (err.code=== 'PROTOCOL_CONNECTION_LOST'){
        console.error('database connection was closed');
           }
    if (err.code === 'ER_CON_COUNT_ERROR'){
        console.error('too many connections');
    }
    if (err.code ==='ECONNREFUSED'){
        console.error('database conection was refused')
    }
}
if (connection) connection.release();
console.log('db is conected');
return;
});
//promisify pool querys lo que antes eran callbacks
pool.query=promisify(pool.query);
module.exports = pool;