// Importación de dependencias principales
const express = require('express');         // Framework para crear el servidor web
const cors = require('cors');               // Middleware para habilitar CORS (acceso entre dominios)
const jwt = require('jsonwebtoken');        // Para generar y verificar tokens JWT
const bcrypt = require('bcryptjs');         // Para encriptar y comparar contraseñas
const db = require('./config/database');    // Configuración de la conexión a la base de datos
require('dotenv').config();                 // Carga variables de entorno desde el archivo .env

const app = express();                      // Inicialización de la aplicación Express
app.use(cors());                            // Permitir solicitudes desde otros orígenes
app.use(express.json());                    // Habilitar el análisis de solicitudes con JSON

// Importación de rutas desde la carpeta /routes
const solicitudesRoutes = require('./routes/solicitudes');
const reportesRoutes = require('./routes/reportes');
const stockRoutes = require('./routes/stock');
const dashboardRoutes = require('./routes/dashboard');
const supervisionRoutes = require('./routes/supervision');
const authRoutes = require('./routes/auth');
const insumosCriticosRoutes = require('./routes/insumos_criticos');
const sugerenciasRoutes = require('./routes/sugerencias');

// Asociación de rutas al servidor (montaje de rutas base)
app.use('/supervision/solicitudes', solicitudesRoutes);
app.use('/supervision/reportes', reportesRoutes);
app.use('/supervision/stock', stockRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/supervision', supervisionRoutes);
app.use('/usuarios', authRoutes);
app.use('/solicitudes', solicitudesRoutes); // Ruta adicional necesaria para uso directo desde el modal
app.use('/insumos-criticos', insumosCriticosRoutes);
app.use('/sugerencias', sugerenciasRoutes);

// Verificación de la existencia de la clave secreta para JWT
const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
  console.error('❌ Falta la variable JWT_SECRET en el archivo .env');
  process.exit(1); // Finaliza el servidor si falta la clave secreta
}

// Ruta de inicio de sesión (login)
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Validación de campos obligatorios
  if (!email || !password) return res.status(400).json({ message: 'Email y contraseña requeridos' });

  try {
    // Consulta del usuario y su rol desde la base de datos
    const [rows] = await db.query(`
      SELECT u.*, r.rol 
      FROM usuarios u 
      JOIN roles r ON u.id_rol = r.id_rol 
      WHERE u.email = ?
    `, [email]);

    if (rows.length === 0) return res.status(401).json({ message: 'Usuario no encontrado' });

    const user = rows[0];

    // Comparación de la contraseña con la almacenada
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Contraseña incorrecta' });

    // Generación del token JWT con duración de 8 horas
    const token = jwt.sign({ id: user.id_usuario, role: user.rol }, SECRET_KEY, { expiresIn: '8h' });

    // Respuesta exitosa con el token y datos del usuario
    res.json({
      token,
      role: user.rol,
      nombre_usuario: user.nombre_usuario,
      id_rol: user.id_rol
    });

  } catch (error) {
    console.error('🔥 Error en login:', error);
    res.status(500).json({ message: 'Error en el servidor' });
  }
});

// Middleware para verificar el token JWT
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).json({ message: 'Token requerido' });

  const tokenParts = token.split(' ');
  if (tokenParts[0] !== 'Bearer' || tokenParts.length !== 2) {
    return res.status(401).json({ message: 'Formato de token inválido' });
  }

  jwt.verify(tokenParts[1], SECRET_KEY, (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Token inválido' });
    req.user = decoded; // Almacena los datos decodificados en la solicitud
    next();
  });
};

// Ruta protegida de ejemplo para verificar token
app.get('/perfil', verifyToken, (req, res) => {
  res.json({ message: 'Acceso concedido', user: req.user });
});

// Levanta el servidor en el puerto definido en el .env o 5000 por defecto
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en el puerto ${PORT}`);
});
