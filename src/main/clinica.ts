import { app, BrowserWindow, dialog, ipcMain, nativeImage } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'
import { agrupar, getDb, opcional, registrarMovimiento, texto, transaccion, type Uso } from './db'

type Item = Uso & { indicacion: string }

const EXT = ['.jpg', '.jpeg', '.png']
const MAX_BYTES = 25 * 1024 * 1024
// Solo se aceptan rutas que el usuario eligió en el diálogo de archivos
const permitidos = new Set<string>()

const dirAdj = (): string => join(app.getPath('userData'), 'adjuntos')
const dirMini = (): string => join(dirAdj(), 'miniaturas')
const mimeDe = (ext: string): string => (ext === '.png' ? 'image/png' : 'image/jpeg')
const dataUrl = (ruta: string, mime: string): string =>
  `data:${mime};base64,${readFileSync(ruta).toString('base64')}`

function miniaturaDe(archivo: string): string {
  const p = join(dirMini(), archivo + '.jpg')
  return existsSync(p) ? dataUrl(p, 'image/jpeg') : ''
}

function borrarArchivos(archivo: string): void {
  for (const p of [join(dirAdj(), archivo), join(dirMini(), archivo + '.jpg')]) {
    try {
      unlinkSync(p)
    } catch {
      /* el archivo ya no existe */
    }
  }
}

function guardarImagen(
  ruta: string,
  pacienteId: number,
  consultaId: number | null,
  creados: string[]
): void {
  if (!permitidos.has(ruta)) throw new Error('Archivo no autorizado. Volvé a elegir la imagen')
  const ext = extname(ruta).toLowerCase()
  if (!EXT.includes(ext)) throw new Error('Formato no soportado: usá JPG o PNG')
  if (statSync(ruta).size > MAX_BYTES) throw new Error(`${basename(ruta)} pesa más de 25 MB`)
  const img = nativeImage.createFromPath(ruta)
  if (img.isEmpty()) throw new Error(`No se pudo leer la imagen ${basename(ruta)}`)

  mkdirSync(dirMini(), { recursive: true })
  const archivo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
  copyFileSync(ruta, join(dirAdj(), archivo))
  creados.push(archivo)
  const ancho = Math.min(img.getSize().width, 320)
  writeFileSync(join(dirMini(), archivo + '.jpg'), img.resize({ width: ancho }).toJPEG(80))

  getDb()
    .prepare(
      'INSERT INTO adjunto (paciente_id, consulta_id, nombre, archivo, fecha) VALUES (?, ?, ?, ?, ?)'
    )
    .run(pacienteId, consultaId, basename(ruta), archivo, new Date().toISOString())
}

function numeroOpcional(v: unknown, etiqueta: string, min: number, max: number): number | null {
  const t = String(v ?? '').trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${etiqueta} fuera de rango (de ${min} a ${max})`)
  }
  return n
}

function normalizarItems(v: unknown): Item[] {
  return (Array.isArray(v) ? v : []).map((u) => ({
    productoId: Number(u.productoId),
    cantidad: Number(u.cantidad),
    indicacion: opcional(u.indicacion)
  }))
}

// Guarda las indicaciones (dosis) de cada medicamento y borra las de los que se quitaron
function guardarIndicaciones(consultaId: number, items: Item[]): void {
  const db = getDb()
  const ids = items.map((i) => i.productoId)
  const actuales = db
    .prepare('SELECT producto_id FROM consulta_producto WHERE consulta_id = ?')
    .all(consultaId) as unknown as { producto_id: number }[]
  for (const a of actuales) {
    if (!ids.includes(a.producto_id)) {
      db.prepare('DELETE FROM consulta_producto WHERE consulta_id = ? AND producto_id = ?').run(
        consultaId,
        a.producto_id
      )
    }
  }
  const up = db.prepare(
    'INSERT OR REPLACE INTO consulta_producto (consulta_id, producto_id, indicacion) VALUES (?, ?, ?)'
  )
  for (const i of items) up.run(consultaId, i.productoId, i.indicacion)
}

// Borra una consulta con todo lo que depende de ella y devuelve los archivos a borrar del disco.
// Al borrar sus movimientos de stock, el stock vuelve solo (se calcula a partir de los movimientos).
function borrarConsulta(id: number): string[] {
  const db = getDb()
  const adj = db
    .prepare('SELECT archivo FROM adjunto WHERE consulta_id = ?')
    .all(id) as unknown as { archivo: string }[]
  db.prepare('DELETE FROM adjunto WHERE consulta_id = ?').run(id)
  db.prepare('DELETE FROM consulta_producto WHERE consulta_id = ?').run(id)
  db.prepare("DELETE FROM movimiento_stock WHERE origen = 'consulta' AND referencia_id = ?").run(id)
  db.prepare('DELETE FROM consulta WHERE id = ?').run(id)
  return adj.map((a) => a.archivo)
}

export function registerClinica(): void {
  // ---------- Pacientes ----------
  ipcMain.handle('pacientes:listar', (_e, q: string) => {
    const like = `%${q}%`
    return getDb()
      .prepare(
        `SELECT p.id, p.nombre, p.especie, p.raza,
                o.nombre AS propietario, o.telefono,
                (SELECT MAX(c.fecha) FROM consulta c WHERE c.paciente_id = p.id) AS ultima_consulta
         FROM paciente p JOIN propietario o ON o.id = p.propietario_id
         WHERE p.nombre LIKE ? OR o.nombre LIKE ?
         ORDER BY p.nombre`
      )
      .all(like, like)
  })

  ipcMain.handle('pacientes:crear', (_e, d) => {
    const propietario = texto(d.propietario, 'nombre del dueño')
    const nombre = texto(d.nombre, 'nombre de la mascota')
    return transaccion(() => {
      const db = getDb()
      const o = db
        .prepare('INSERT INTO propietario (nombre, telefono) VALUES (?, ?)')
        .run(propietario, opcional(d.telefono))
      const p = db
        .prepare('INSERT INTO paciente (propietario_id, nombre, especie, raza) VALUES (?, ?, ?, ?)')
        .run(o.lastInsertRowid, nombre, opcional(d.especie), opcional(d.raza))
      return Number(p.lastInsertRowid)
    })
  })

  ipcMain.handle('pacientes:editar', (_e, d) => {
    const propietario = texto(d.propietario, 'nombre del dueño')
    const nombre = texto(d.nombre, 'nombre de la mascota')
    transaccion(() => {
      const db = getDb()
      const p = db
        .prepare('SELECT propietario_id FROM paciente WHERE id = ?')
        .get(d.id) as unknown as { propietario_id: number } | undefined
      if (!p) throw new Error('Paciente no encontrado')
      db.prepare('UPDATE paciente SET nombre = ?, especie = ?, raza = ? WHERE id = ?').run(
        nombre,
        opcional(d.especie),
        opcional(d.raza),
        d.id
      )
      db.prepare('UPDATE propietario SET nombre = ?, telefono = ? WHERE id = ?').run(
        propietario,
        opcional(d.telefono),
        p.propietario_id
      )
    })
  })

  // ---------- Consultas ----------
  ipcMain.handle('consultas:listar', (_e, pacienteId: number) => {
    const db = getDb()
    const productos = db.prepare(
      `SELECT pr.id AS productoId, pr.nombre, pr.unidad, cp.indicacion,
              SUM(CASE m.tipo WHEN 'salida' THEN m.cantidad ELSE -m.cantidad END) AS cantidad
       FROM movimiento_stock m
       JOIN producto pr ON pr.id = m.producto_id
       LEFT JOIN consulta_producto cp
              ON cp.consulta_id = m.referencia_id AND cp.producto_id = m.producto_id
       WHERE m.origen = 'consulta' AND m.referencia_id = ?
       GROUP BY pr.id HAVING cantidad > 0`
    )
    const adjuntos = db.prepare('SELECT id, nombre, archivo FROM adjunto WHERE consulta_id = ? ORDER BY id')
    return db
      .prepare('SELECT * FROM consulta WHERE paciente_id = ? ORDER BY fecha DESC')
      .all(pacienteId)
      .map((c) => ({
        ...c,
        productos: productos.all(c.id as number),
        adjuntos: adjuntos.all(c.id as number).map((a) => ({
          id: a.id,
          nombre: a.nombre,
          miniatura: miniaturaDe(a.archivo as string)
        }))
      }))
  })

  ipcMain.handle('consultas:crear', (_e, d) => {
    const motivo = texto(d.motivo, 'motivo')
    const peso = numeroOpcional(d.pesoKg, 'El peso', 0.01, 1000)
    const temp = numeroOpcional(d.temperatura, 'La temperatura', 30, 45)
    const items = normalizarItems(d.productos)
    const creados: string[] = []
    try {
      return transaccion(() => {
        const r = getDb()
          .prepare(
            `INSERT INTO consulta (paciente_id, fecha, motivo, peso_kg, temperatura, diagnostico, tratamiento)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            d.pacienteId,
            new Date().toISOString(),
            motivo,
            peso,
            temp,
            opcional(d.diagnostico),
            opcional(d.tratamiento)
          )
        const consultaId = Number(r.lastInsertRowid)
        for (const [productoId, cantidad] of agrupar(items)) {
          registrarMovimiento({
            productoId,
            tipo: 'salida',
            cantidad,
            origen: 'consulta',
            referenciaId: consultaId,
            nota: `Consulta #${consultaId}`
          })
        }
        guardarIndicaciones(consultaId, items)
        for (const ruta of (d.imagenes ?? []) as string[]) {
          guardarImagen(ruta, d.pacienteId, consultaId, creados)
        }
        return consultaId
      })
    } catch (err) {
      creados.forEach(borrarArchivos)
      throw err
    }
  })

  ipcMain.handle('consultas:editar', (_e, d) => {
    const motivo = texto(d.motivo, 'motivo')
    const peso = numeroOpcional(d.pesoKg, 'El peso', 0.01, 1000)
    const temp = numeroOpcional(d.temperatura, 'La temperatura', 30, 45)
    const items = normalizarItems(d.productos)
    const creados: string[] = []
    const aBorrar: string[] = []
    try {
      transaccion(() => {
        const db = getDb()
        const id = Number(d.id)
        const c = db
          .prepare('SELECT paciente_id FROM consulta WHERE id = ?')
          .get(id) as unknown as { paciente_id: number } | undefined
        if (!c) throw new Error('Consulta no encontrada')

        db.prepare(
          `UPDATE consulta SET motivo = ?, peso_kg = ?, temperatura = ?, diagnostico = ?,
                  tratamiento = ?, modificada = ?
           WHERE id = ?`
        ).run(
          motivo,
          peso,
          temp,
          opcional(d.diagnostico),
          opcional(d.tratamiento),
          new Date().toISOString(),
          id
        )

        // Stock: se registra solo la diferencia contra lo que ya estaba descontado
        const actuales = new Map<number, number>()
        const filas = db
          .prepare(
            `SELECT producto_id,
                    SUM(CASE tipo WHEN 'salida' THEN cantidad ELSE -cantidad END) AS neto
             FROM movimiento_stock
             WHERE origen = 'consulta' AND referencia_id = ?
             GROUP BY producto_id`
          )
          .all(id) as unknown as { producto_id: number; neto: number }[]
        for (const f of filas) actuales.set(f.producto_id, f.neto)

        const nuevos = agrupar(items)
        for (const productoId of new Set([...actuales.keys(), ...nuevos.keys()])) {
          const dif = (nuevos.get(productoId) ?? 0) - (actuales.get(productoId) ?? 0)
          if (dif === 0) continue
          registrarMovimiento({
            productoId,
            tipo: dif > 0 ? 'salida' : 'entrada',
            cantidad: Math.abs(dif),
            origen: 'consulta',
            referenciaId: id,
            nota: `Corrección de la consulta #${id}`
          })
        }
        guardarIndicaciones(id, items)

        // Imágenes
        for (const aid of (d.quitar ?? []) as number[]) {
          const a = db
            .prepare('SELECT archivo FROM adjunto WHERE id = ? AND consulta_id = ?')
            .get(aid, id) as unknown as { archivo: string } | undefined
          if (a) {
            db.prepare('DELETE FROM adjunto WHERE id = ?').run(aid)
            aBorrar.push(a.archivo)
          }
        }
        for (const ruta of (d.imagenes ?? []) as string[]) {
          guardarImagen(ruta, c.paciente_id, id, creados)
        }
      })
    } catch (err) {
      creados.forEach(borrarArchivos)
      throw err
    }
    aBorrar.forEach(borrarArchivos)
  })

  // ---------- Imágenes ----------
  ipcMain.handle('archivos:elegir', async () => {
    const opciones = {
      title: 'Elegir imágenes',
      properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[],
      filters: [{ name: 'Imágenes (JPG, PNG)', extensions: ['jpg', 'jpeg', 'png'] }]
    }
    const win = BrowserWindow.getFocusedWindow()
    const r = win
      ? await dialog.showOpenDialog(win, opciones)
      : await dialog.showOpenDialog(opciones)
    if (r.canceled) return []
    return r.filePaths.map((ruta) => {
      permitidos.add(ruta)
      const img = nativeImage.createFromPath(ruta)
      const vista = img.isEmpty()
        ? ''
        : img.resize({ width: Math.min(img.getSize().width, 200) }).toDataURL()
      return { ruta, nombre: basename(ruta), vista }
    })
  })

  ipcMain.handle('adjuntos:paciente', (_e, pacienteId: number) =>
    getDb()
      .prepare(
        `SELECT a.id, a.nombre, a.archivo, a.fecha, a.consulta_id,
                c.fecha AS fecha_consulta, c.motivo
         FROM adjunto a LEFT JOIN consulta c ON c.id = a.consulta_id
         WHERE a.paciente_id = ? ORDER BY a.fecha DESC`
      )
      .all(pacienteId)
      .map(({ archivo, ...resto }) => ({ ...resto, miniatura: miniaturaDe(archivo as string) }))
  )

  ipcMain.handle('adjuntos:agregar', (_e, d: { pacienteId: number; rutas: string[] }) => {
    const creados: string[] = []
    try {
      transaccion(() => {
        for (const ruta of d.rutas) guardarImagen(ruta, d.pacienteId, null, creados)
      })
    } catch (err) {
      creados.forEach(borrarArchivos)
      throw err
    }
  })

  ipcMain.handle('adjuntos:ver', (_e, id: number) => {
    const a = getDb()
      .prepare('SELECT nombre, archivo FROM adjunto WHERE id = ?')
      .get(id) as unknown as { nombre: string; archivo: string } | undefined
    if (!a) throw new Error('Imagen no encontrada')
    const ruta = join(dirAdj(), a.archivo)
    if (!existsSync(ruta)) throw new Error('El archivo de la imagen no está en la carpeta de adjuntos')
    return { nombre: a.nombre, url: dataUrl(ruta, mimeDe(extname(a.archivo).toLowerCase())) }
  })

  ipcMain.handle('adjuntos:eliminar', (_e, id: number) => {
    const db = getDb()
    const a = db
      .prepare('SELECT archivo FROM adjunto WHERE id = ?')
      .get(id) as unknown as { archivo: string } | undefined
    if (!a) throw new Error('Imagen no encontrada')
    db.prepare('DELETE FROM adjunto WHERE id = ?').run(id)
    borrarArchivos(a.archivo)
  })
    // ---------- Eliminar ----------
  ipcMain.handle('consultas:eliminar', (_e, id: number) => {
    const archivos = transaccion(() => {
      const existe = getDb().prepare('SELECT 1 AS x FROM consulta WHERE id = ?').get(id)
      if (!existe) throw new Error('Consulta no encontrada')
      return borrarConsulta(id)
    })
    archivos.forEach(borrarArchivos)
  })

  ipcMain.handle('pacientes:eliminar', (_e, id: number) => {
    const archivos = transaccion(() => {
      const db = getDb()
      const p = db
        .prepare('SELECT propietario_id FROM paciente WHERE id = ?')
        .get(id) as unknown as { propietario_id: number } | undefined
      if (!p) throw new Error('Paciente no encontrado')

      const archivos: string[] = []
      const consultas = db
        .prepare('SELECT id FROM consulta WHERE paciente_id = ?')
        .all(id) as unknown as { id: number }[]
      for (const c of consultas) archivos.push(...borrarConsulta(c.id))

      // Imágenes que estaban sueltas en el paciente (sin consulta)
      const sueltas = db
        .prepare('SELECT archivo FROM adjunto WHERE paciente_id = ?')
        .all(id) as unknown as { archivo: string }[]
      db.prepare('DELETE FROM adjunto WHERE paciente_id = ?').run(id)
      archivos.push(...sueltas.map((a) => a.archivo))

      db.prepare('DELETE FROM paciente WHERE id = ?').run(id)
      const otros = db
        .prepare('SELECT COUNT(*) AS n FROM paciente WHERE propietario_id = ?')
        .get(p.propietario_id) as unknown as { n: number }
      if (otros.n === 0) db.prepare('DELETE FROM propietario WHERE id = ?').run(p.propietario_id)
      return archivos
    })
    archivos.forEach(borrarArchivos)
  })
}