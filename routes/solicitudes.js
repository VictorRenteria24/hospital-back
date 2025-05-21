// Importación de módulos necesarios
const express = require('express')
const router = express.Router()
const db = require('../config/database')
const dayjs = require('dayjs'); // Librería para manejar fechas

// 🔹 Obtener todas las solicitudes agrupadas por ID de solicitud
router.get('/', async (req, res) => {
  try {
    // Aumenta el límite de caracteres de GROUP_CONCAT para evitar truncamientos
    await db.query(`SET SESSION group_concat_max_len = 1000000`);

    // Consulta principal que une múltiples tablas y agrupa insumos de cada solicitud
    const [rows] = await db.query(`
      SELECT 
        s.id_solicitud,
        s.nombre_solicitante,
        CONCAT(p.nombre, ' ', p.ap_paterno, ' ', p.ap_materno) AS paciente,
        COALESCE(sa.nombre, sh.nombre) AS servicio,
        s.diagnostico,
        GROUP_CONCAT(i.nombre SEPARATOR '||') AS nombre_insumo,
        GROUP_CONCAT(ds.presentacion SEPARATOR '||') AS presentacion,
        GROUP_CONCAT(ds.cantidad_solicitada SEPARATOR '||') AS cantidad_solicitada,
        GROUP_CONCAT(ds.cantidad_surtida SEPARATOR '||') AS cantidad_surtida,
        GROUP_CONCAT(ds.id_insumo SEPARATOR '||') AS id_insumo,
        GROUP_CONCAT(DATE_FORMAT(l.fecha_vencimiento, '%Y-%m-%d') SEPARATOR '||') AS fecha_vencimiento,
        s.estatus,
        s.justificacion,
        s.fecha,
        s.fecha_atendido,
        s.prioridad
      FROM solicitudes s
      LEFT JOIN detalle_solicitud ds ON s.id_solicitud = ds.id_solicitud
      LEFT JOIN pacientes p ON s.id_paciente = p.id_paciente
      LEFT JOIN insumos i ON ds.id_insumo = i.id_insumo
      LEFT JOIN lotes l ON i.id_lote = l.id_lote
      LEFT JOIN servicios se ON s.id_servicio = se.id_servicio
      LEFT JOIN serv_ambulatorios sa ON se.id_ambulatorio = sa.id_ambulatorio
      LEFT JOIN serv_hospitalarios sh ON se.id_hospitalario = sh.id_hospitalario
      GROUP BY s.id_solicitud
      ORDER BY s.fecha DESC
    `)

    console.log('✅ Total solicitudes encontradas:', rows.length)
    res.json(rows)
  } catch (error) {
    console.error('❌ Error al obtener solicitudes:', error.message)
    res.status(500).json({ error: 'Error al obtener solicitudes' })
  }
})

// ✅ Actualizar múltiples insumos de una solicitud
router.put('/', async (req, res) => {
  const { insumos, estatus } = req.body
  if (!Array.isArray(insumos) || !estatus) {
    return res.status(400).json({ error: 'Faltan datos o el formato no es válido' })
  }

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()

    const justificacionesValidas = ['Fuera_de_cuadro', 'Compra_directa', 'No_existencia']
    const idSolicitud = insumos[0].id_solicitud

    // Itera sobre todos los insumos de la solicitud para actualizar sus cantidades surtidas
    for (const insumo of insumos) {
      const { cantidad_surtida, justificacion, id_insumo } = insumo

      await conn.query(`
        UPDATE detalle_solicitud
        SET cantidad_surtida = ?
        WHERE id_solicitud = ? AND id_insumo = ?
      `, [cantidad_surtida, idSolicitud, id_insumo])

      // Si fue aprobada, descuenta del stock
      if (estatus === 'aprobada') {
        await conn.query(`
          UPDATE insumos
          SET cantidad = GREATEST(0, cantidad - ?)
          WHERE id_insumo = ?
        `, [cantidad_surtida, id_insumo])
      }
    }

    // Valida justificación si fue rechazada
    let justificacionGlobal = insumos[0].justificacion || ''
    if (estatus === 'rechazada') {
      if (!justificacionesValidas.includes(justificacionGlobal)) {
        throw new Error(`Justificación inválida: ${justificacionGlobal}`)
      }
    }

    // Actualiza la solicitud con estatus final, justificación y fecha de atención
    await conn.query(`
      UPDATE solicitudes
      SET estatus = ?, justificacion = ?, fecha_atendido = NOW()
      WHERE id_solicitud = ?
    `, [estatus, justificacionGlobal, idSolicitud])

    await conn.commit()
    res.json({ mensaje: '✅ Solicitud actualizada correctamente' })
  } catch (err) {
    await conn.rollback()
    console.error('❌ Error al actualizar solicitud:', err.message)
    res.status(500).json({ error: 'Error al actualizar solicitud', detalle: err.message })
  } finally {
    conn.release()
  }
})

// 🔍 Obtener lista de servicios (ambulatorios y hospitalarios)
router.get('/servicios', async (req, res) => {
  try {
    const [ambulatorios] = await db.query(`SELECT id_ambulatorio AS id, nombre FROM serv_ambulatorios`)
    const [hospitalarios] = await db.query(`SELECT id_hospitalario AS id, nombre FROM serv_hospitalarios`)

    const servicios = [
      ...ambulatorios.map(s => ({ tipo: 'Ambulatoria', id_servicio: s.id, nombre: s.nombre })),
      ...hospitalarios.map(s => ({ tipo: 'Hospitalaria', id_servicio: s.id, nombre: s.nombre }))
    ]

    res.json(servicios)
  } catch (error) {
    console.error('❌ Error al obtener servicios:', error.message)
    res.status(500).json({ error: 'Error al obtener servicios' })
  }
})

// 🔍 Búsqueda de pacientes por CURP
router.get('/pacientes/buscar', async (req, res) => {
  const { curp } = req.query
  if (!curp) return res.status(400).json({ error: 'Falta CURP' })

  try {
    const [result] = await db.query(`
      SELECT * FROM pacientes WHERE curp LIKE ?
      LIMIT 5
    `, [`%${curp}%`])
    res.json(result)
  } catch (err) {
    console.error('❌ Error al buscar pacientes:', err.message)
    res.status(500).json({ error: 'Error al buscar pacientes' })
  }
})

// 🔍 Búsqueda de insumos por nombre
router.get('/insumos', async (req, res) => {
  const { q } = req.query
  try {
    const [rows] = await db.query(`
      SELECT id_insumo, nombre, presentacion
      FROM insumos
      WHERE nombre LIKE ?
      LIMIT 10
    `, [`%${q}%`])
    res.json(rows)
  } catch (error) {
    console.error('❌ Error al buscar insumos:', error.message)
    res.status(500).json({ error: 'Error al buscar insumos' })
  }
})

// ✅ Registrar nueva solicitud con múltiples insumos
router.post('/', async (req, res) => {
  const { paciente, solicitud, insumos, tipoServicio } = req.body
  if (!paciente || !solicitud || !Array.isArray(insumos)) {
    return res.status(400).json({ error: 'Datos incompletos' })
  }

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()

    // Verifica si el paciente ya existe, si no, lo registra
    const [existe] = await conn.query('SELECT id_paciente FROM pacientes WHERE curp = ?', [paciente.curp])
    let id_paciente = existe.length ? existe[0].id_paciente : null

    if (!id_paciente) {
      const [resPaciente] = await conn.query(`
        INSERT INTO pacientes (nombre, ap_paterno, ap_materno, genero, edad, curp, fecha_nacimiento, domicilio)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        paciente.nombre,
        paciente.ap_paterno,
        paciente.ap_materno,
        paciente.genero,
        paciente.edad,
        paciente.curp,
        paciente.fecha_nacimiento,
        paciente.domicilio
      ])
      id_paciente = resPaciente.insertId
    }

    // Determina ID del servicio en base a tipo
    const queryServicio = tipoServicio === 'Ambulatoria'
      ? 'SELECT id_servicio FROM servicios WHERE tipo = ? AND id_ambulatorio = ?'
      : 'SELECT id_servicio FROM servicios WHERE tipo = ? AND id_hospitalario = ?'

    const [resServicio] = await conn.query(queryServicio, [tipoServicio, solicitud.id_servicio])
    if (resServicio.length === 0) throw new Error('Servicio no encontrado')
    const id_servicio = resServicio[0].id_servicio

    // Registra la solicitud
    const [resSolicitud] = await conn.query(`
      INSERT INTO solicitudes (id_paciente, id_servicio, nombre_solicitante, diagnostico, justificacion, prioridad, estatus, fecha)
      VALUES (?, ?, ?, ?, '', ?, 'pendiente', NOW())
    `, [
      id_paciente,
      id_servicio,
      solicitud.nombre_solicitante,
      solicitud.diagnostico,
      solicitud.prioridad
    ])
    const id_solicitud = resSolicitud.insertId

    // Registra cada insumo solicitado en la tabla detalle_solicitud
    for (const insumo of insumos) {
      const [check] = await conn.query('SELECT 1 FROM insumos WHERE id_insumo = ?', [insumo.id_insumo])
      if (!check.length) throw new Error(`El insumo con ID ${insumo.id_insumo} no existe`)

      await conn.query(`
        INSERT INTO detalle_solicitud (id_solicitud, id_insumo, presentacion, cantidad_solicitada)
        VALUES (?, ?, ?, ?)
      `, [
        id_solicitud,
        insumo.id_insumo,
        insumo.presentacion,
        insumo.cantidad_solicitada
      ])
    }

    await conn.commit()
    res.status(201).json({ mensaje: '✅ Solicitud registrada correctamente', id_solicitud })
  } catch (err) {
    await conn.rollback()
    console.error('❌ Error al registrar solicitud:', err.message)
    res.status(500).json({ error: 'Error al registrar solicitud', detalles: err.message })
  } finally {
    conn.release()
  }
})

// 🔍 Obtener detalles del insumo (cantidad disponible y vencimiento)
router.get('/insumos/detalle/:id', async (req, res) => {
  const id_insumo = req.params.id

  try {
    const [result] = await db.query(`
      SELECT 
        i.cantidad,
        l.fecha_vencimiento
      FROM insumos i
      LEFT JOIN lotes l ON i.id_lote = l.id_lote
      WHERE i.id_insumo = ?
      LIMIT 1
    `, [id_insumo])

    if (result.length === 0) return res.status(404).json({ error: 'Insumo no encontrado' })

    res.json(result[0])
  } catch (error) {
    console.error('❌ Error al obtener detalle del insumo:', error.message)
    res.status(500).json({ error: 'Error al obtener detalle del insumo' })
  }
})

// 📊 Obtener estadísticas de insumos solicitados (periodo: semanal, mensual, anual)
function obtenerRango(periodo, fechaStr) {
  const fecha = dayjs(fechaStr);

  if (periodo === 'semanal') {
    return {
      inicio: fecha.startOf('week').format('YYYY-MM-DD'),
      fin: fecha.endOf('week').format('YYYY-MM-DD')
    };
  }

  if (periodo === 'mensual') {
    const mes = fecha.month();
    const anio = fecha.year();
    return {
      inicio: dayjs(`${anio}-${mes + 1}-01`).startOf('month').format('YYYY-MM-DD'),
      fin: dayjs(`${anio}-${mes + 1}-01`).endOf('month').format('YYYY-MM-DD')
    };
  }

  if (periodo === 'anual') {
    const anio = fecha.year();
    return {
      inicio: dayjs(`${anio}-01-01`).format('YYYY-MM-DD'),
      fin: dayjs(`${anio}-12-31`).format('YYYY-MM-DD')
    };
  }

  return null;
}

// Consulta agregada de insumos solicitados/surtidos entre dos fechas
async function obtenerEstadisticas(inicio, fin) {
  const [result] = await db.query(`
    SELECT
      i.nombre AS insumo,
      SUM(ds.cantidad_solicitada) AS solicitado,
      SUM(ds.cantidad_surtida) AS surtido
    FROM solicitudes s
    JOIN detalle_solicitud ds ON s.id_solicitud = ds.id_solicitud
    JOIN insumos i ON ds.id_insumo = i.id_insumo
    WHERE s.fecha BETWEEN ? AND ?
    GROUP BY ds.id_insumo
    ORDER BY solicitado DESC
  `, [inicio, fin]);
  return result;
}

// Endpoint principal para estadísticas por periodo
router.get('/estadisticas/:periodo', async (req, res) => {
  const { periodo } = req.params;
  const { fecha, mes, anio } = req.query;

  try {
    let rango;
    if (periodo === 'semanal' && fecha) {
      rango = obtenerRango('semanal', fecha);
    } else if (periodo === 'mensual' && mes && anio) {
      rango = obtenerRango('mensual', `${anio}-${mes}-01`);
    } else if (periodo === 'anual' && anio) {
      rango = obtenerRango('anual', `${anio}-01-01`);
    } else {
      return res.status(400).json({ message: 'Parámetros inválidos' });
    }

    const datos = await obtenerEstadisticas(rango.inicio, rango.fin);
    res.json({ periodo, ...rango, datos });
  } catch (err) {
    console.error('❌ Error en estadísticas:', err);
    res.status(500).json({ message: 'Error al generar estadísticas' });
  }
});

// Endpoint para obtener insumos no surtidos en el periodo dado
router.get('/estadisticas/no-surtidos/:periodo', async (req, res) => {
  const { periodo } = req.params;
  const { fecha, mes, anio } = req.query;
  let rango;

  if (periodo === 'semanal' && fecha) {
    rango = obtenerRango('semanal', fecha);
  } else if (periodo === 'mensual' && mes && anio) {
    rango = obtenerRango('mensual', `${anio}-${mes}-01`);
  } else if (periodo === 'anual' && anio) {
    rango = obtenerRango('anual', `${anio}-01-01`);
  } else {
    return res.status(400).json({ message: 'Parámetros inválidos' });
  }

  try {
    const [sinSurtir] = await db.query(`
      SELECT
        i.nombre AS insumo,
        SUM(ds.cantidad_solicitada) AS solicitado
      FROM solicitudes s
      JOIN detalle_solicitud ds ON s.id_solicitud = ds.id_solicitud
      JOIN insumos i ON ds.id_insumo = i.id_insumo
      WHERE s.fecha BETWEEN ? AND ?
        AND ds.cantidad_surtida = 0
      GROUP BY ds.id_insumo
      ORDER BY solicitado DESC
    `, [rango.inicio, rango.fin]);

    res.json({ periodo, ...rango, insumos_no_surtidos: sinSurtir });
  } catch (err) {
    console.error('❌ Error en no surtidos:', err);
    res.status(500).json({ message: 'Error al obtener no surtidos' });
  }
});

// Exportación del enrutador
module.exports = router;
