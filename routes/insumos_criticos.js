  const express = require('express');
  const router = express.Router();
  const db = require('../config/database');
  const verificarToken = require('../middleware/authMiddleware');

  // 🔍 Obtener todos los insumos críticos
  router.get('/', verificarToken, async (req, res) => {
    try {
      const [rows] = await db.query(`
        SELECT 
          ic.id_insumo_critico,
          ic.nombre,
          ic.presentacion,
          ic.cantidad,
          ic.id_laboratorio,
          l.nombre AS nombre_laboratorio,
          ic.id_lote,
          lo.fecha_vencimiento,
          ic.fecha_registro,
          ic.observaciones
        FROM insumos_criticos ic
        LEFT JOIN laboratorios l ON ic.id_laboratorio = l.id_laboratorio
        LEFT JOIN lotes lo ON ic.id_lote = lo.id_lote
      `);
      res.json(rows);
    } catch (err) {
      console.error('Error al obtener insumos críticos:', err);
      res.status(500).json({ mensaje: 'Error del servidor' });
    }
  });

  // ➕ Registrar un nuevo insumo crítico
  router.post('/', verificarToken, async (req, res) => {
    try {
      const { nombre, presentacion, cantidad, id_laboratorio, id_lote, observaciones } = req.body;
      const [result] = await db.query(`
        INSERT INTO insumos_criticos (nombre, presentacion, cantidad, id_laboratorio, id_lote, observaciones)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [nombre, presentacion, cantidad, id_laboratorio, id_lote, observaciones]);
      res.status(201).json({ id: result.insertId, mensaje: 'Insumo crítico registrado correctamente' });
    } catch (err) {
      console.error('Error al registrar insumo crítico:', err);
      res.status(500).json({ mensaje: 'Error al registrar insumo crítico' });
    }
  });

  // ✏️ Editar un insumo crítico
  router.put('/:id', verificarToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { nombre, presentacion, cantidad, id_laboratorio, id_lote, observaciones } = req.body;
      await db.query(`
        UPDATE insumos_criticos
        SET nombre = ?, presentacion = ?, cantidad = ?, id_laboratorio = ?, id_lote = ?, observaciones = ?
        WHERE id_insumo_critico = ?
      `, [nombre, presentacion, cantidad, id_laboratorio, id_lote, observaciones, id]);
      res.json({ mensaje: 'Insumo crítico actualizado correctamente' });
    } catch (err) {
      console.error('Error al actualizar insumo crítico:', err);
      res.status(500).json({ mensaje: 'Error al actualizar insumo crítico' });
    }
  });

  // ❌ Eliminar un insumo crítico
  router.delete('/:id', verificarToken, async (req, res) => {
    try {
      const { id } = req.params;
      await db.query('DELETE FROM insumos_criticos WHERE id_insumo_critico = ?', [id]);
      res.json({ mensaje: 'Insumo crítico eliminado correctamente' });
    } catch (err) {
      console.error('Error al eliminar insumo crítico:', err);
      res.status(500).json({ mensaje: 'Error al eliminar insumo crítico' });
    }
  });

  // 🚨 Obtener insumos en alerta: caducados o con bajo stock
router.get('/alertas', verificarToken, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        ic.id_insumo_critico,
        ic.nombre,
        ic.presentacion,
        ic.cantidad,
        ic.id_lote,
        lo.fecha_vencimiento
      FROM insumos_criticos ic
      LEFT JOIN lotes lo ON ic.id_lote = lo.id_lote
      WHERE ic.cantidad < 20 OR lo.fecha_vencimiento < CURDATE()
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener alertas:', error);
    res.status(500).json({ mensaje: 'Error al obtener alertas de insumos' });
  }
});

  module.exports = router;
