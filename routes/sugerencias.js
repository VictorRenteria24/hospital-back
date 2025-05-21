const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verificarToken } = require('../middleware/authMiddleware');

// ✅ Agregar sugerencia
router.post('/', verificarToken, async (req, res) => {
  try {
    const { id_insumo_critico, nombre, presentacion, cantidad, fecha_vencimiento } = req.body;
    await db.query(`
      INSERT INTO sugerencias (id_insumo_critico, nombre, presentacion, cantidad, fecha_vencimiento)
      VALUES (?, ?, ?, ?, ?)
    `, [id_insumo_critico, nombre, presentacion, cantidad, fecha_vencimiento]);
    res.status(201).json({ mensaje: 'Sugerencia agregada correctamente' });
  } catch (err) {
    console.error('Error al agregar sugerencia:', err);
    res.status(500).json({ mensaje: 'Error al agregar sugerencia' });
  }
});

// 📥 Obtener todas las sugerencias
router.get('/', verificarToken, async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM sugerencias`);
    res.json(rows);
  } catch (err) {
    console.error('Error al obtener sugerencias:', err);
    res.status(500).json({ mensaje: 'Error al obtener sugerencias' });
  }
});

// 🧹 Limpiar sugerencias después de imprimir y guardar en histórico
router.post('/guardar-historico', verificarToken, async (req, res) => {
  try {
    const [sugerencias] = await db.query(`SELECT * FROM sugerencias`);

    for (const sugerencia of sugerencias) {
      await db.query(`
        INSERT INTO historico_compras (id_insumo_critico, nombre, presentacion, cantidad, fecha_vencimiento)
        VALUES (?, ?, ?, ?, ?)
      `, [
        sugerencia.id_insumo_critico,
        sugerencia.nombre,
        sugerencia.presentacion,
        sugerencia.cantidad,
        sugerencia.fecha_vencimiento
      ]);
    }

    await db.query(`DELETE FROM sugerencias`);
    res.json({ mensaje: 'Sugerencias archivadas en histórico y limpiadas correctamente' });
  } catch (err) {
    console.error('Error al guardar en histórico:', err);
    res.status(500).json({ mensaje: 'Error al guardar histórico' });
  }
});

module.exports = router;
