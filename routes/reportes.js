// Importación de módulos necesarios
const express = require('express');
const router = express.Router();
const db = require('../config/database'); // Conexión a la base de datos

// ======================== POST: Registrar nuevo reporte ========================
router.post('/', async (req, res) => {
  const { nombre_reportante, cargo, tipo_reporte, descripcion, prioridad } = req.body;

  // Validación de campos obligatorios
  if (!nombre_reportante || !cargo || !tipo_reporte || !descripcion || !prioridad) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  try {
    // Inserta el reporte en la base de datos
    const query = `
      INSERT INTO reportes (nombre_reportante, cargo, tipo_reporte, prioridad, descripcion)
      VALUES (?, ?, ?, ?, ?)
    `;
    const values = [nombre_reportante, cargo, tipo_reporte, prioridad, descripcion];
    await db.query(query, values);

    res.status(201).json({ mensaje: '✅ Reporte registrado correctamente' });
  } catch (error) {
    console.error('❌ Error al registrar reporte:', error);
    res.status(500).json({ error: 'Error al registrar reporte' });
  }
});

// ======================== GET: Obtener todos los reportes ========================
router.get('/', async (req, res) => {
  try {
    // Obtiene todos los reportes ordenados por fecha descendente (recientes primero)
    const [rows] = await db.query('SELECT * FROM reportes ORDER BY fecha DESC');
    res.json(rows);
  } catch (error) {
    console.error('❌ Error al obtener reportes:', error);
    res.status(500).json({ error: 'Error al obtener reportes' });
  }
});

// ======================== GET: Reportes por fecha específica ========================
router.get('/fecha', async (req, res) => {
  const { fecha } = req.query;

  // Verifica que se haya enviado una fecha
  if (!fecha) {
    return res.status(400).json({ error: 'Fecha requerida en formato YYYY-MM-DD' });
  }

  try {
    // Consulta reportes que coincidan con la fecha exacta
    const [rows] = await db.query(`
      SELECT * FROM reportes
      WHERE DATE(fecha) = ?
      ORDER BY fecha DESC
    `, [fecha]);

    res.json(rows);
  } catch (error) {
    console.error('❌ Error al obtener reportes por fecha:', error);
    res.status(500).json({ error: 'Error al obtener reportes por fecha' });
  }
});

// ======================== PUT: Marcar reporte como atendido ========================
router.put('/:id/atendido', async (req, res) => {
  const { id } = req.params;
  const fechaAtendido = new Date(); // Fecha actual del servidor

  try {
    // Actualiza el estado del reporte, lo marca como atendido y registra la fecha
    const [resultado] = await db.query(`
      UPDATE reportes
      SET atendido = 1,
          estatus = 'atendido',
          fecha_atendido = ?
      WHERE id_reporte = ?
    `, [fechaAtendido, id]);

    // Verifica si el reporte existía
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'Reporte no encontrado' });
    }

    res.json({ mensaje: '✅ Reporte marcado como atendido y fecha registrada' });
  } catch (error) {
    console.error('❌ Error al marcar como atendido:', error);
    res.status(500).json({ error: 'Error al marcar como atendido' });
  }
});

// Exportación del enrutador
module.exports = router;
