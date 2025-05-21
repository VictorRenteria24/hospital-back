// Importación de módulos necesarios
const express = require('express');
const router = express.Router();
const db = require('../config/database'); // Conexión a la base de datos

// GET: Listar solicitudes pendientes
router.get('/solicitudes', async (req, res) => {
  try {
    // Consulta todas las solicitudes que estén en estado 'pendiente'
    const [rows] = await db.query(`
      SELECT 
        id_solicitud,
        nombre_solicitante,
        edad,
        genero,
        diagnostico,
        insumo,
        presentacion,
        cantidad_solicitada,
        justificacion,
        estatus
      FROM solicitudes
      WHERE estatus = 'pendiente'
    `);
    // Devuelve el resultado en formato JSON
    res.json(rows);
  } catch (error) {
    // Manejo de errores en caso de falla en la base de datos
    console.error('Error al obtener solicitudes:', error);
    res.status(500).json({ error: 'Error al obtener solicitudes' });
  }
});

// Exportación del enrutador para su uso en server.js
module.exports = router;
