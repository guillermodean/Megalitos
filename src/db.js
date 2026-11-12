'use strict';

const mysql = require('mysql2/promise');

function createPool(db) {
  return mysql.createPool({
    host: db.host,
    port: db.port,
    database: db.database,
    user: db.user,
    password: db.password,
    charset: 'utf8mb4',
    connectionLimit: 5,
    queueLimit: 50,
    connectTimeout: 5000,
    namedPlaceholders: false,
    multipleStatements: false,
    dateStrings: true,
    decimalNumbers: true,
  });
}

module.exports = { createPool };
