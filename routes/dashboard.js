// Importación de módulos necesarios
const express = require('express');
const router = express.Router();
const db = require('../config/database');         // Conexión a la base de datos
const verifyToken = require('../middleware/verifyToken'); // Middleware para proteger el acceso

// Ruta GET principal del dashboard
router.get('/', verifyToken, async (req, res) => {
  try {
    // ==================== Estadísticas generales ====================
    // Total de solicitudes registradas
    const [solicitudesTotales] = await db.query('SELECT COUNT(*) AS total FROM solicitudes');

    // Total de solicitudes pendientes
    const [pendientes] = await db.query("SELECT COUNT(*) AS total FROM solicitudes WHERE estatus = 'pendiente'");

    // Total de solicitudes aprobadas
    const [aprobadas] = await db.query("SELECT COUNT(*) AS total FROM solicitudes WHERE estatus = 'aprobada'");

    // Total de solicitudes rechazadas
    const [rechazadas] = await db.query("SELECT COUNT(*) AS total FROM solicitudes WHERE estatus = 'rechazada'");

    // ==================== Estadísticas de insumos solicitados ====================
    // Agrupa los insumos por nombre y suma su cantidad solicitada
    const [insumos] = await db.query(`
      SELECT insumo AS nombre, SUM(cantidad_solicitada) AS cantidad
      FROM solicitudes
      GROUP BY insumo
    `);

    // ==================== Respuesta al cliente ====================
    res.json({
      stats: {
        total: solicitudesTotales[0].total,
        pendientes: pendientes[0].total,
        aprobadas: aprobadas[0].total,
        rechazadas: rechazadas[0].total
      },
      insumos // Lista de insumos solicitados con su cantidad total
    });

  } catch (err) {
    // Manejo de errores
    console.error('Error en /dashboard:', err);
    res.status(500).json({ message: 'Error al obtener datos del dashboard' });
  }
});

// Exportación del enrutador para ser usado en server.js
module.exports = router;
