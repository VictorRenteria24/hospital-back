// Importación de módulos necesarios
const jwt = require('jsonwebtoken');         // Para generación de tokens JWT
const bcrypt = require('bcryptjs');          // Para comparar contraseñas encriptadas
const db = require('../config/database');    // Conexión a la base de datos
require('dotenv').config();                  // Carga variables de entorno desde .env

// Exportación de la función login (controlador)
exports.login = async (req, res) => {
    const { email, password } = req.body;    // Extrae credenciales del cuerpo de la solicitud

    try {
        // Busca al usuario por su correo electrónico
        const [rows] = await db.query('SELECT * FROM usuarios WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(401).json({ message: 'Usuario no encontrado' });

        const user = rows[0];

        // Compara la contraseña ingresada con la almacenada (encriptada)
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Contraseña incorrecta' });

        // Obtiene el nombre del rol a partir del ID de rol
        const [roleData] = await db.query('SELECT nombre FROM roles WHERE id = ?', [user.id_rol]);
        const role = roleData[0].nombre;

        // Genera el token JWT con duración de 8 horas
        const token = jwt.sign({ id: user.id, role }, process.env.JWT_SECRET, { expiresIn: '8h' });

        // Devuelve el token y el rol en la respuesta
        res.json({ token, role });

    } catch (error) {
        // En caso de error, devuelve estado 500 con mensaje
        res.status(500).json({ message: 'Error en el servidor', error });
    }
};
