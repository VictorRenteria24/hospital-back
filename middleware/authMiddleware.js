// Importación de JWT para verificación de tokens
const jwt = require('jsonwebtoken');

// Carga de variables de entorno desde el archivo .env
require('dotenv').config();

// Middleware de autenticación para verificar el token JWT
const authMiddleware = (req, res, next) => {
    // Obtiene el token del encabezado de autorización
    const token = req.headers['authorization'];
    
    // Si no hay token, se responde con error 403 (prohibido)
    if (!token) return res.status(403).json({ message: 'Token requerido' });

    // Verifica el token usando la clave secreta definida en el .env
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        // Si el token no es válido, responde con error 401 (no autorizado)
        if (err) return res.status(401).json({ message: 'Token inválido' });

        // Si es válido, guarda los datos del usuario decodificados en la solicitud
        req.user = decoded;

        // Pasa al siguiente middleware o ruta
        next();
    });
};

// Exporta el middleware para ser usado en rutas protegidas
module.exports = authMiddleware;
