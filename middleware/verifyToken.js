// Importa la librería JWT para verificar tokens
const jwt = require('jsonwebtoken');

// Carga las variables de entorno (como JWT_SECRET)
require('dotenv').config();

// Middleware para verificar tokens JWT con formato "Bearer <token>"
const verifyToken = (req, res, next) => {
  // Obtiene el token desde el encabezado "authorization"
  const token = req.headers['authorization'];

  // Si no se proporciona un token, responde con error 403
  if (!token) return res.status(403).json({ message: 'Token requerido' });

  // Separa el encabezado en dos partes: "Bearer" y el valor real del token
  const tokenParts = token.split(' ');

  // Verifica que el formato sea correcto ("Bearer <token>")
  if (tokenParts[0] !== 'Bearer' || tokenParts.length !== 2) {
    return res.status(401).json({ message: 'Formato de token inválido' });
  }

  // Verifica el token usando la clave secreta
  jwt.verify(tokenParts[1], process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Token inválido' });

    // Si es válido, guarda los datos decodificados del usuario en la solicitud
    req.user = decoded;

    // Continúa con la siguiente función/middleware
    next();
  });
};

// Exporta el middleware para ser usado en rutas protegidas
module.exports = verifyToken;
