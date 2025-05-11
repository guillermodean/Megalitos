const mysql = require('mysql2');
const { database } = require('./keys');

const pool = mysql.createPool({
  ...database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false } // Recomendado para Railway
});

// Promisify queries
const { promisify } = require('util');
pool.query = promisify(pool.query);

// Prueba de conexión
pool.getConnection((err, connection) => {
  if (err) {
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
      console.error('Database connection was closed.');
    }
    if (err.code === 'ER_CON_COUNT_ERROR') {
      console.error('Database has too many connections.');
    }
    if (err.code === 'ECONNREFUSED') {
      console.error('Database connection was refused.');
    }
    return;
  }
  if (connection) {
    connection.release();
    console.log('DB is connected');
  }
});

module.exports = pool;
