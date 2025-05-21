// Importación de módulos necesarios
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const multer = require('multer'); // Para manejo de archivos
const xlsx = require('xlsx');     // Para leer archivos Excel

// Configuración de multer para manejar archivos en memoria
const upload = multer({ storage: multer.memoryStorage() });

// Función para quitar acentos y normalizar texto
const quitarAcentos = (texto) => {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
};

// Diccionario de presentaciones con sinónimos para detectar automáticamente
const presentacionesEnum = {
  'TABLETA': ['TABLETA', 'PASTILLA', 'COMPRIMIDO', 'GRAGEA', 'PÍLDORA'],
  'CAPSULA': ['CAPSULA', 'CÁPSULA BLANDA', 'CÁPSULA DURA'],
  'COMPRIMIDO': ['COMPRIMIDO'],
  'POLVO': ['POLVO', 'POLVILLO', 'POLVO PARA RECONSTITUIR'],
  'SUPOSITORIO': ['SUPOSITORIO', 'INSERTO RECTAL', 'TORPEDO'],
  'OVULO': ['ÓVULO', 'INSERTO VAGINAL', 'SUPOSITORIO VAGINAL'],
  'IMPLANTE': ['IMPLANTE', 'DISPOSITIVO SUBDÉRMICO', 'SISTEMA IMPLANTABLE'],
  'POMADA': ['POMADA', 'UNGUENTO', 'CREMA DENSA'],
  'GEL': ['GEL', 'GEL TÓPICO', 'GELATINA MEDICINAL'],
  'CREMA': ['CREMA', 'EMULSIÓN TÓPICA', 'POMADA LIGERA'],
  'AMPOLLETA': ['AMPOLLETA', 'AMPOLLA', 'FRASCO ÁMPULA'],
  'JARABE': ['JARABE', 'SOLUCIÓN ORAL', 'LÍQUIDO AZUCARADO'],
  'SOLUCIONES': ['SOLUCIONES', 'SOLUCIÓN LÍQUIDA', 'MEZCLA LÍQUIDA'],
  'EMULSIONES': ['EMULSIONES', 'SUSPENSIÓN OLEOSA', 'MEZCLA ACEITE-AGUA'],
  'NEBULIZADOR': ['NEBULIZADOR', 'AEROSOL', 'SOLUCIÓN PARA NEBULIZAR'],
  'PAQUETE': ['PAQUETE', 'KIT', 'CONJUNTO', 'SET'],
  'BULTO': ['BULTO', 'FARDO', 'PAQUETE GRANDE'],
  'CAJA': ['CAJA', 'ESTUCHE', 'CONTENEDOR'],
  'PIEZA': ['PIEZA', 'UNIDAD', 'ARTÍCULO INDIVIDUAL']
};

// Función que detecta la presentación a partir del nombre del medicamento
function detectarPresentacion(texto) {
  const clean = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

  for (const [clave, sinonimos] of Object.entries(presentacionesEnum)) {
    for (const sin of sinonimos) {
      if (clean.includes(sin)) {
        return clave.charAt(0).toUpperCase() + clave.slice(1).toLowerCase(); // Ej: Tableta
      }
    }
  }

  return 'Otro'; // Si no se reconoce, asigna "Otro"
}

// Ruta POST para cargar stock desde un archivo Excel
router.post('/upload-excel', upload.single('file'), async (req, res) => {
  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    const conn = await db.getConnection();
    await conn.beginTransaction();

    for (const row of data) {
      const id_lote = row['Lote']?.toString().trim();
      const laboratorio_nombre = row['Laboratorio']?.trim();
      const rawFecha = row['Caducidad'];

      // Manejo de fecha de vencimiento (Excel puede enviarla como número o fecha)
      let fecha_vencimiento;
      if (typeof rawFecha === 'number') {
        const epoch = new Date(Date.UTC(1899, 11, 30));
        fecha_vencimiento = new Date(epoch.getTime() + rawFecha * 86400000);
      } else {
        fecha_vencimiento = new Date(rawFecha);
      }

      if (isNaN(fecha_vencimiento)) {
        console.warn(`❗ Fecha inválida en fila: ${JSON.stringify(row)}`);
        continue;
      }

      const id_insumo = row['Clave CLIENTE']?.toString().trim();
      const medicamento = row['Medicamento']?.trim();
      const cantidad = parseInt(row['Existencia total']) || 0;

      if (!id_lote || !laboratorio_nombre || !medicamento || !id_insumo) continue;

      const presentacion = detectarPresentacion(medicamento);

      // Normaliza el nombre del medicamento
      const nombre_normalizado = quitarAcentos(medicamento)
        .replace(/[^A-Z0-9 ,.:()\-]/gi, '')
        .trim();

      // Buscar o registrar laboratorio
      let [lab] = await conn.query('SELECT id_laboratorio FROM laboratorios WHERE nombre = ?', [laboratorio_nombre]);
      let id_laboratorio;
      if (lab.length === 0) {
        const result = await conn.query('INSERT INTO laboratorios (nombre) VALUES (?)', [laboratorio_nombre]);
        id_laboratorio = result[0].insertId;
      } else {
        id_laboratorio = lab[0].id_laboratorio;
      }

      // Insertar o actualizar lote
      await conn.query(`
        INSERT INTO lotes (id_lote, codigo_lote, fecha_recepcion, fecha_vencimiento)
        VALUES (?, ?, CURDATE(), ?)
        ON DUPLICATE KEY UPDATE fecha_vencimiento = VALUES(fecha_vencimiento)
      `, [id_lote, id_lote, fecha_vencimiento]);

      // Insertar o actualizar insumo
      const [ins] = await conn.query('SELECT * FROM insumos WHERE id_insumo = ?', [id_insumo]);

      if (ins.length > 0) {
        await conn.query('UPDATE insumos SET cantidad = cantidad + ? WHERE id_insumo = ?', [cantidad, id_insumo]);
      } else {
        await conn.query(`
          INSERT INTO insumos (id_insumo, nombre, id_laboratorio, id_lote, presentacion, cantidad)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [id_insumo, nombre_normalizado, id_laboratorio, id_lote, presentacion, cantidad]);
      }
    }

    await conn.commit();
    conn.release();

    res.json({ message: '✅ Stock cargado correctamente desde Excel' });
  } catch (err) {
    console.error('❌ Error al procesar Excel:', err);
    res.status(500).json({ message: 'Error al procesar Excel' });
  }
});

// Obtener listado completo de insumos con información de lote
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT i.id_insumo, i.nombre, i.presentacion, i.cantidad, i.id_lote,
             l.fecha_recepcion, l.fecha_vencimiento 
      FROM insumos i
      LEFT JOIN lotes l ON i.id_lote = l.id_lote
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener insumos:', error);
    res.status(500).json({ message: 'Error en el servidor' });
  }
});

// Obtener los valores ENUM posibles de presentaciones
router.get('/presentaciones', async (req, res) => {
  try {
    const [rows] = await db.query(`SHOW COLUMNS FROM insumos LIKE 'presentacion'`);
    const enumStr = rows[0].Type;
    const presentaciones = enumStr
      .replace(/^enum\(|\)$/g, '')
      .split(',')
      .map(val => val.replace(/'/g, ''));
    res.json(presentaciones);
  } catch (error) {
    console.error('Error al obtener presentaciones:', error);
    res.status(500).json({ message: 'Error al obtener presentaciones' });
  }
});

// Crear o actualizar un insumo manualmente
router.post('/', async (req, res) => {
  let { id_insumo, nombre, presentacion, cantidad, id_lote, fecha_recepcion, fecha_vencimiento } = req.body;

  if (!id_insumo || !cantidad) {
    return res.status(400).json({ message: 'ID de insumo y cantidad son obligatorios' });
  }

  nombre = nombre ? quitarAcentos(nombre.trim()) : '';
  presentacion = presentacion ? quitarAcentos(presentacion.trim()) : '';

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [existente] = await conn.query('SELECT * FROM insumos WHERE id_insumo = ?', [id_insumo]);

    if (existente.length > 0) {
      await conn.query(`
        UPDATE insumos 
        SET cantidad = cantidad + ? 
        WHERE id_insumo = ?
      `, [cantidad, id_insumo]);
    } else {
      const camposFaltantes = [];
      if (!nombre) camposFaltantes.push('nombre');
      if (!presentacion) camposFaltantes.push('presentacion');
      if (!id_lote) camposFaltantes.push('id_lote');
      if (!fecha_recepcion || isNaN(Date.parse(fecha_recepcion))) camposFaltantes.push('fecha_recepcion');
      if (!fecha_vencimiento || isNaN(Date.parse(fecha_vencimiento))) camposFaltantes.push('fecha_vencimiento');

      if (camposFaltantes.length > 0) {
        return res.status(400).json({
          message: `Faltan campos obligatorios o con formato incorrecto: ${camposFaltantes.join(', ')}`
        });
      }

      await conn.query(`
        INSERT INTO lotes (id_lote, fecha_recepcion, fecha_vencimiento)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          fecha_recepcion = VALUES(fecha_recepcion), 
          fecha_vencimiento = VALUES(fecha_vencimiento)
      `, [id_lote, fecha_recepcion, fecha_vencimiento]);

      await conn.query(`
        INSERT INTO insumos (id_insumo, nombre, id_laboratorio, id_lote, presentacion, cantidad)
        VALUES (?, ?, 1, ?, ?, ?)
      `, [id_insumo, nombre, id_lote, presentacion, cantidad]);
    }

    await conn.commit();
    res.json({ message: '✅ Insumo guardado correctamente' });

  } catch (error) {
    await conn.rollback();
    console.error('❌ Error al guardar insumo:', error);
    res.status(500).json({ message: 'Error al guardar insumo en el servidor' });
  } finally {
    conn.release();
  }
});

// Actualizar manualmente la cantidad o presentación de un insumo
router.put('/:id', async (req, res) => {
  const { cantidad, presentacion } = req.body;
  const { id } = req.params;

  if (!cantidad) {
    return res.status(400).json({ message: 'Cantidad obligatoria' });
  }

  try {
    const presentacionNormalizada = presentacion ? quitarAcentos(presentacion) : null;

    await db.query(
      `UPDATE insumos 
       SET cantidad = ?, 
           presentacion = IF(? IS NOT NULL, ?, presentacion)
       WHERE id_insumo = ?`,
      [cantidad, presentacionNormalizada, presentacionNormalizada, id]
    );

    res.json({ message: '✅ Insumo actualizado' });

  } catch (error) {
    console.error('Error al actualizar insumo:', error);
    res.status(500).json({ message: 'Error al actualizar' });
  }
});

// Eliminar insumo por ID
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM insumos WHERE id_insumo = ?', [id]);
    res.json({ message: '🗑️ Insumo eliminado' });
  } catch (error) {
    console.error('Error al eliminar insumo:', error);
    res.status(500).json({ message: 'Error al eliminar' });
  }
});

// Obtener listado paginado de insumos
router.get('/paginado', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 30;
  const offset = (page - 1) * limit;

  try {
    const [data] = await db.query(`
      SELECT i.id_insumo, i.nombre, i.presentacion, i.cantidad, i.id_lote,
             l.fecha_recepcion, l.fecha_vencimiento 
      FROM insumos i
      LEFT JOIN lotes l ON i.id_lote = l.id_lote
      ORDER BY i.nombre ASC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const [countResult] = await db.query('SELECT COUNT(*) AS total FROM insumos');
    const total = countResult[0].total;

    res.json({ data, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('❌ Error en paginación de stock:', error);
    res.status(500).json({ message: 'Error en el servidor' });
  }
});

// Exportación del router
module.exports = router;
