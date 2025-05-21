// Importa el módulo de conexión de MySQL compatible con promesas
const mysql = require('mysql2/promise');

// Carga las variables de entorno desde el archivo .env
require('dotenv').config();

// Crea un pool de conexiones para mejorar el rendimiento y reutilizar conexiones
const pool = mysql.createPool({
    host: process.env.DB_HOST,     // Dirección del servidor de la base de datos (ej. 'localhost')
    user: process.env.DB_USER,     // Usuario de la base de datos
    password: process.env.DB_PASS, // Contraseña del usuario
    database: process.env.DB_NAME  // Nombre de la base de datos a utilizar
});

// Exporta el pool para ser utilizado en las consultas dentro del proyecto
module.exports = pool;
