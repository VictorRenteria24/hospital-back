// Importación de módulos necesarios
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const verifyToken = require('../middleware/authMiddleware'); // Middleware para proteger rutas

// ========================== USUARIOS ==========================

// Obtener todos los usuarios (solo administrador)
router.get('/usuarios', verifyToken, async (req, res) => {
  if (req.user.role !== 'administrador') return res.status(403).json({ message: 'Acceso denegado' });

  try {
    const [result] = await db.query('SELECT id, nombre, correo, rol FROM usuarios');
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener usuarios', error });
  }
});

// Crear nuevo usuario (solo administrador)
router.post('/usuarios', verifyToken, async (req, res) => {
  if (req.user.role !== 'administrador') return res.status(403).json({ message: 'Acceso denegado' });

  try {
    const { nombre, correo, rol } = req.body;
    await db.query('INSERT INTO usuarios (nombre, correo, rol) VALUES (?, ?, ?)', [nombre, correo, rol]);
    res.json({ message: 'Usuario creado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear usuario', error });
  }
});

// Actualizar el rol de un usuario (solo administrador)
router.put('/usuarios/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'administrador') return res.status(403).json({ message: 'Acceso denegado' });

  try {
    const { rol } = req.body;
    await db.query('UPDATE usuarios SET rol = ? WHERE id = ?', [rol, req.params.id]);
    res.json({ message: 'Usuario actualizado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar usuario', error });
  }
});

// ======================= SOLICITUDES DE INSUMOS =======================

// Registrar solicitud (médico o enfermero)
router.post('/solicitudes', verifyToken, async (req, res) => {
  if (!['medico', 'enfermero'].includes(req.user.role)) return res.status(403).json({ message: 'Acceso denegado' });

  try {
    const { insumo, cantidad } = req.body;
    await db.query('INSERT INTO solicitudes_insumos (insumo, cantidad, estado) VALUES (?, ?, "Pendiente")', [insumo, cantidad]);
    res.json({ message: 'Solicitud creada' });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear solicitud', error });
  }
});

// Actualizar estado de solicitud (solo administrativo 1)
router.put('/solicitudes/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'administrativo 1') return res.status(403).json({ message: 'Acceso denegado' });

  try {
    const { estado } = req.body;
    await db.query('UPDATE solicitudes_insumos SET estado = ? WHERE id = ?', [estado, req.params.id]);
    res.json({ message: 'Solicitud actualizada' });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar solicitud', error });
  }
});

// Obtener todas las solicitudes (sin restricción de rol)
router.get('/solicitudes', verifyToken, async (req, res) => {
  try {
    const [result] = await db.query('SELECT * FROM solicitudes_insumos');
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener solicitudes', error });
  }
});

// Registrar solicitud con motivo (genérica)
router.post('/solicitud-insumos', verifyToken, async (req, res) => {
  const { insumo, cantidad, motivo } = req.body;
  const userId = req.user.id;

  try {
    await db.query(
      'INSERT INTO solicitudes_insumos (id_usuario, insumo, cantidad, motivo) VALUES (?, ?, ?, ?)',
      [userId, insumo, cantidad, motivo]
    );
    res.json({ message: 'Solicitud registrada con éxito' });
  } catch (error) {
    res.status(500).json({ message: 'Error al registrar la solicitud', error });
  }
});

// Obtener solicitudes con datos de usuario (solo administrativo 1)
router.get('/solicitudes-insumos', verifyToken, async (req, res) => {
  if (req.user.role !== 'administrativo 1') return res.status(403).json({ message: 'Acceso denegado' });

  try {
    const [solicitudes] = await db.query(`
      SELECT si.id, u.email AS usuario, si.insumo, si.cantidad, si.motivo, si.estado
      FROM solicitudes_insumos si
      JOIN usuarios u ON si.id_usuario = u.id
    `);
    res.json(solicitudes);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener solicitudes', error });
  }
});

// Actualizar estado de una solicitud específica (administrativo 1)
router.put('/solicitudes-insumos/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'administrativo 1') return res.status(403).json({ message: 'Acceso denegado' });

  const { id } = req.params;
  const { estado } = req.body;

  try {
    await db.query('UPDATE solicitudes_insumos SET estado = ? WHERE id = ?', [estado, id]);
    res.json({ message: 'Estado actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar estado', error });
  }
});

// ======================= DASHBOARD =======================

// Estadísticas de solicitudes por estado (solo administrativo 1)
router.get('/dashboard', verifyToken, async (req, res) => {
  if (req.user.role !== 'administrativo 1') return res.status(403).json({ message: 'Acceso denegado' });

  try {
    const [stats] = await db.query(`
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN estado = 'Pendiente' THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN estado = 'Aprobada' THEN 1 ELSE 0 END) AS aprobadas,
        SUM(CASE WHEN estado = 'Rechazada' THEN 1 ELSE 0 END) AS rechazadas
      FROM solicitudes_insumos
    `);
    res.json(stats[0]);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener datos del dashboard', error });
  }
});

// ======================= REPORTES =======================

// Reporte de solicitudes por área
router.get('/reportes/solicitudes', verifyToken, async (req, res) => {
  try {
    const [result] = await db.query(`
      SELECT area, COUNT(*) AS total 
      FROM solicitudes 
      GROUP BY area
    `);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener reporte', error });
  }
});

// Reporte de usuarios por rol
router.get('/reportes/usuarios', verifyToken, async (req, res) => {
  try {
    const [result] = await db.query(`
      SELECT rol, COUNT(*) AS total 
      FROM usuarios 
      GROUP BY rol
    `);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener reporte', error });
  }
});

// ======================= GESTIÓN DE INSUMOS =======================

// Obtener solicitudes de insumos con nombre
router.get('/gestion-insumos', verifyToken, async (req, res) => {
  try {
    const [result] = await db.query(`
      SELECT s.id, i.nombre AS insumo, s.cantidad, s.estado
      FROM solicitudes s
      JOIN insumos i ON s.insumo_id = i.id
    `);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener solicitudes', error });
  }
});

// Crear nueva solicitud de insumos
router.post('/gestion-insumos', verifyToken, async (req, res) => {
  try {
    const { insumo, cantidad } = req.body;
    await db.query(`INSERT INTO solicitudes (insumo_id, cantidad, estado) VALUES (?, ?, 'Pendiente')`, [insumo, cantidad]);
    res.json({ message: 'Solicitud creada exitosamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear solicitud', error });
  }
});

// Actualizar estado de una solicitud
router.put('/gestion-insumos/:id', verifyToken, async (req, res) => {
  try {
    const { estado } = req.body;
    const { id } = req.params;
    await db.query(`UPDATE solicitudes SET estado = ? WHERE id = ?`, [estado, id]);
    res.json({ message: 'Solicitud actualizada' });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar solicitud', error });
  }
});

// ======================= INFO DE USUARIO =======================

// Obtener nombre y cargo desde email (útil para autocompletar)
router.get('/info', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email requerido' });

  try {
    const [rows] = await db.query(`
      SELECT nombre_usuario AS nombre, r.rol AS cargo
      FROM usuarios u
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE u.email = ?
    `, [email]);

    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json(rows[0]);
  } catch (err) {
    console.error('❌ Error al obtener info del usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Exporta todas las rutas para usarlas en server.js
module.exports = router;
