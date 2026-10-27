import { DatabaseSync } from 'node:sqlite'
import { app, ipcMain } from 'electron'
import { join } from 'path'

let db: DatabaseSync

export type Origen = 'compra' | 'consulta' | 'ajuste'
export interface Uso {
  productoId: number
  cantidad: number
}

export const getDb = (): DatabaseSync => db

export const rutaDb = (): string => join(app.getPath('userData'), 'vetgest.db')

export function cerrarDb(): void {
  if (db) db.close()
}

export function transaccion<T>(fn: () => T): T {
  db.exec('BEGIN')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

function agregarColumna(tabla: string, columna: string, definicion: string): void {
  const cols = db.prepare(`PRAGMA table_info(${tabla})`).all() as unknown as { name: string }[]
  if (!cols.some((c) => c.name === columna)) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`)
  }
}

export function texto(v: unknown, etiqueta: string): string {
  const t = String(v ?? '').trim()
  if (!t) throw new Error(`Falta completar: ${etiqueta}`)
  return t
}

export function opcional(v: unknown): string {
  return String(v ?? '').trim()
}

function nombreLibre(tabla: 'producto' | 'proveedor', nombre: string, exceptoId = 0): void {
  const r = db
    .prepare(`SELECT id FROM ${tabla} WHERE lower(nombre) = lower(?) AND id != ? AND activo = 1`)
    .get(nombre, exceptoId)
  if (r) throw new Error(`Ya existe un ${tabla} con el nombre "${nombre}"`)
}

export function agrupar(lista: Uso[] = []): Map<number, number> {
  const m = new Map<number, number>()
  for (const u of lista) m.set(u.productoId, (m.get(u.productoId) ?? 0) + u.cantidad)
  return m
}

export function stockDe(productoId: number): number {
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(CASE tipo WHEN 'entrada' THEN cantidad ELSE -cantidad END), 0) AS stock
       FROM movimiento_stock WHERE producto_id = ?`
    )
    .get(productoId) as unknown as { stock: number }
  return r.stock
}

export function registrarMovimiento(m: {
  productoId: number
  tipo: 'entrada' | 'salida'
  cantidad: number
  origen: Origen
  referenciaId?: number | null
  anulaA?: number | null
  proveedorId?: number | null
  costoUnitario?: number | null
  nota?: string
}): void {
  if (!Number.isInteger(m.cantidad) || m.cantidad <= 0) {
    throw new Error('La cantidad debe ser un número entero mayor a 0')
  }
  if (m.tipo === 'salida') {
    const actual = stockDe(m.productoId)
    if (actual < m.cantidad) {
      const p = db
        .prepare('SELECT nombre FROM producto WHERE id = ?')
        .get(m.productoId) as unknown as { nombre: string }
      throw new Error(`Stock insuficiente de ${p.nombre} (hay ${actual}, se piden ${m.cantidad})`)
    }
  }
  db.prepare(
    `INSERT INTO movimiento_stock
       (producto_id, tipo, cantidad, origen, referencia_id, anula_a, proveedor_id, costo_unitario, fecha, nota)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    m.productoId,
    m.tipo,
    m.cantidad,
    m.origen,
    m.referenciaId ?? null,
    m.anulaA ?? null,
    m.proveedorId ?? null,
    m.costoUnitario ?? null,
    new Date().toISOString(),
    m.nota ?? ''
  )
}

export function initDb(): void {
  db = new DatabaseSync(rutaDb())
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS propietario (
      id INTEGER PRIMARY KEY,
      nombre TEXT NOT NULL,
      telefono TEXT
    );
    CREATE TABLE IF NOT EXISTS paciente (
      id INTEGER PRIMARY KEY,
      propietario_id INTEGER NOT NULL REFERENCES propietario(id),
      nombre TEXT NOT NULL,
      especie TEXT,
      raza TEXT
    );
    CREATE TABLE IF NOT EXISTS consulta (
      id INTEGER PRIMARY KEY,
      paciente_id INTEGER NOT NULL REFERENCES paciente(id),
      fecha TEXT NOT NULL,
      motivo TEXT,
      diagnostico TEXT,
      tratamiento TEXT
    );
    CREATE TABLE IF NOT EXISTS proveedor (
      id INTEGER PRIMARY KEY,
      nombre TEXT NOT NULL,
      cuit TEXT,
      telefono TEXT,
      email TEXT,
      condiciones TEXT
    );
    CREATE TABLE IF NOT EXISTS producto (
      id INTEGER PRIMARY KEY,
      nombre TEXT NOT NULL,
      categoria TEXT,
      unidad TEXT,
      precio_costo INTEGER NOT NULL DEFAULT 0,
      precio_venta INTEGER NOT NULL DEFAULT 0,
      stock_minimo INTEGER NOT NULL DEFAULT 0,
      proveedor_id INTEGER REFERENCES proveedor(id)
    );
    CREATE TABLE IF NOT EXISTS movimiento_stock (
      id INTEGER PRIMARY KEY,
      producto_id INTEGER NOT NULL REFERENCES producto(id),
      tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida')),
      cantidad INTEGER NOT NULL CHECK (cantidad > 0),
      origen TEXT NOT NULL CHECK (origen IN ('compra', 'consulta', 'ajuste')),
      referencia_id INTEGER,
      fecha TEXT NOT NULL,
      nota TEXT
    );
    CREATE TABLE IF NOT EXISTS consulta_producto (
      consulta_id INTEGER NOT NULL REFERENCES consulta(id),
      producto_id INTEGER NOT NULL REFERENCES producto(id),
      indicacion TEXT,
      PRIMARY KEY (consulta_id, producto_id)
    );
    CREATE TABLE IF NOT EXISTS adjunto (
      id INTEGER PRIMARY KEY,
      paciente_id INTEGER NOT NULL REFERENCES paciente(id),
      consulta_id INTEGER REFERENCES consulta(id),
      nombre TEXT NOT NULL,
      archivo TEXT NOT NULL,
      fecha TEXT NOT NULL
    );
  `)

  // Migraciones: agregan columnas nuevas a bases ya existentes sin perder datos
  agregarColumna('movimiento_stock', 'anula_a', 'INTEGER')
  agregarColumna('movimiento_stock', 'proveedor_id', 'INTEGER')
  agregarColumna('movimiento_stock', 'costo_unitario', 'INTEGER')
  agregarColumna('producto', 'activo', 'INTEGER NOT NULL DEFAULT 1')
  agregarColumna('proveedor', 'activo', 'INTEGER NOT NULL DEFAULT 1')
  agregarColumna('proveedor', 'contacto', 'TEXT')
  agregarColumna('proveedor', 'direccion', 'TEXT')
  agregarColumna('proveedor', 'notas', 'TEXT')
  agregarColumna('consulta', 'modificada', 'TEXT')
  agregarColumna('consulta', 'peso_kg', 'REAL')
  agregarColumna('consulta', 'temperatura', 'REAL')
}

export function registerIpc(): void {
  // ---------- Proveedores ----------
  ipcMain.handle('proveedores:listar', (_e, incluirArchivados?: boolean) =>
    db
      .prepare(
        `SELECT pv.*, COUNT(pr.id) AS productos
         FROM proveedor pv
         LEFT JOIN producto pr ON pr.proveedor_id = pv.id AND pr.activo = 1
         WHERE (? = 1 OR pv.activo = 1)
         GROUP BY pv.id ORDER BY pv.activo DESC, pv.nombre`
      )
      .all(incluirArchivados ? 1 : 0)
  )

  ipcMain.handle('proveedores:detalle', (_e, id: number) => {
    const productos = db
      .prepare(
        `SELECT pr.id, pr.nombre, pr.unidad, pr.stock_minimo, pr.precio_costo,
                COALESCE(SUM(CASE m.tipo WHEN 'entrada' THEN m.cantidad ELSE -m.cantidad END), 0) AS stock
         FROM producto pr
         LEFT JOIN movimiento_stock m ON m.producto_id = pr.id
         WHERE pr.proveedor_id = ? AND pr.activo = 1
         GROUP BY pr.id ORDER BY pr.nombre`
      )
      .all(id)
    const compras = db
      .prepare(
        `SELECT m.id, m.fecha, pr.nombre AS producto, m.cantidad, m.costo_unitario, m.nota,
                EXISTS (SELECT 1 FROM movimiento_stock x WHERE x.anula_a = m.id) AS anulado
         FROM movimiento_stock m JOIN producto pr ON pr.id = m.producto_id
         WHERE m.proveedor_id = ? AND m.origen = 'compra' AND m.tipo = 'entrada'
         ORDER BY m.id DESC LIMIT 40`
      )
      .all(id)
    return { productos, compras }
  })

  ipcMain.handle('proveedores:crear', (_e, d) => {
    const nombre = texto(d.nombre, 'nombre del proveedor')
    nombreLibre('proveedor', nombre)
    const r = db
      .prepare(
        `INSERT INTO proveedor (nombre, contacto, cuit, telefono, email, direccion, condiciones, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        nombre,
        opcional(d.contacto),
        opcional(d.cuit),
        opcional(d.telefono),
        opcional(d.email),
        opcional(d.direccion),
        opcional(d.condiciones),
        opcional(d.notas)
      )
    return Number(r.lastInsertRowid)
  })

  ipcMain.handle('proveedores:editar', (_e, d) => {
    const nombre = texto(d.nombre, 'nombre del proveedor')
    nombreLibre('proveedor', nombre, Number(d.id))
    const r = db
      .prepare(
        `UPDATE proveedor SET nombre = ?, contacto = ?, cuit = ?, telefono = ?, email = ?,
                direccion = ?, condiciones = ?, notas = ?
         WHERE id = ?`
      )
      .run(
        nombre,
        opcional(d.contacto),
        opcional(d.cuit),
        opcional(d.telefono),
        opcional(d.email),
        opcional(d.direccion),
        opcional(d.condiciones),
        opcional(d.notas),
        d.id
      )
    if (r.changes === 0) throw new Error('Proveedor no encontrado')
  })

  ipcMain.handle('proveedores:archivar', (_e, d: { id: number; activo: boolean }) => {
    db.prepare('UPDATE proveedor SET activo = ? WHERE id = ?').run(d.activo ? 1 : 0, d.id)
  })

  // ---------- Productos ----------
  ipcMain.handle('productos:listar', (_e, incluirArchivados?: boolean) =>
    db
      .prepare(
        `SELECT pr.id, pr.nombre, pr.categoria, pr.unidad, pr.precio_costo, pr.precio_venta,
                pr.stock_minimo, pr.proveedor_id, pr.activo, pv.nombre AS proveedor,
                COALESCE(SUM(CASE m.tipo WHEN 'entrada' THEN m.cantidad ELSE -m.cantidad END), 0) AS stock
         FROM producto pr
         LEFT JOIN movimiento_stock m ON m.producto_id = pr.id
         LEFT JOIN proveedor pv ON pv.id = pr.proveedor_id
         WHERE (? = 1 OR pr.activo = 1)
         GROUP BY pr.id ORDER BY pr.activo DESC, pr.nombre`
      )
      .all(incluirArchivados ? 1 : 0)
  )

  ipcMain.handle('productos:crear', (_e, d) => {
    const nombre = texto(d.nombre, 'nombre del producto')
    nombreLibre('producto', nombre)
    transaccion(() => {
      const r = db
        .prepare(
          `INSERT INTO producto (nombre, categoria, unidad, precio_costo, precio_venta, stock_minimo, proveedor_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          nombre,
          opcional(d.categoria),
          opcional(d.unidad) || 'unidad',
          d.precioCosto,
          d.precioVenta,
          d.stockMinimo,
          d.proveedorId ?? null
        )
      if (d.stockInicial > 0) {
        registrarMovimiento({
          productoId: Number(r.lastInsertRowid),
          tipo: 'entrada',
          cantidad: d.stockInicial,
          origen: 'ajuste',
          nota: 'Stock inicial'
        })
      }
    })
  })

  ipcMain.handle('productos:editar', (_e, d) => {
    const nombre = texto(d.nombre, 'nombre del producto')
    nombreLibre('producto', nombre, Number(d.id))
    const r = db
      .prepare(
        `UPDATE producto SET nombre = ?, categoria = ?, unidad = ?, precio_costo = ?,
                precio_venta = ?, stock_minimo = ?, proveedor_id = ?
         WHERE id = ?`
      )
      .run(
        nombre,
        opcional(d.categoria),
        opcional(d.unidad) || 'unidad',
        d.precioCosto,
        d.precioVenta,
        d.stockMinimo,
        d.proveedorId ?? null,
        d.id
      )
    if (r.changes === 0) throw new Error('Producto no encontrado')
  })

  ipcMain.handle('productos:archivar', (_e, d: { id: number; activo: boolean }) => {
    if (!d.activo && stockDe(d.id) !== 0) {
      throw new Error(
        'Para archivar un producto su stock tiene que estar en 0. Dá de baja lo que queda o hacé un conteo.'
      )
    }
    db.prepare('UPDATE producto SET activo = ? WHERE id = ?').run(d.activo ? 1 : 0, d.id)
  })

  // ---------- Movimientos de stock ----------
  ipcMain.handle('stock:movimiento', (_e, d) => {
    if (d.origen !== 'compra' && d.origen !== 'ajuste') throw new Error('Origen no permitido')
    const esCompra = d.origen === 'compra'
    const costo = Number.isInteger(d.costoUnitario) && d.costoUnitario > 0 ? d.costoUnitario : null
    transaccion(() => {
      registrarMovimiento({
        productoId: d.productoId,
        tipo: d.tipo,
        cantidad: d.cantidad,
        origen: d.origen,
        proveedorId: esCompra ? (d.proveedorId ?? null) : null,
        costoUnitario: esCompra ? costo : null,
        nota: opcional(d.nota)
      })
      if (esCompra && d.actualizarCosto && costo) {
        db.prepare('UPDATE producto SET precio_costo = ? WHERE id = ?').run(costo, d.productoId)
      }
    })
  })

  ipcMain.handle('stock:conteo', (_e, d: { productoId: number; cantidadReal: number; nota?: string }) => {
    if (!Number.isInteger(d.cantidadReal) || d.cantidadReal < 0) {
      throw new Error('La cantidad contada debe ser un número entero, 0 o más')
    }
    transaccion(() => {
      const actual = stockDe(d.productoId)
      const dif = d.cantidadReal - actual
      if (dif === 0) throw new Error('El stock del sistema ya coincide con lo que contaste')
      registrarMovimiento({
        productoId: d.productoId,
        tipo: dif > 0 ? 'entrada' : 'salida',
        cantidad: Math.abs(dif),
        origen: 'ajuste',
        nota: `Conteo físico: sistema ${actual}, real ${d.cantidadReal}${d.nota ? ' – ' + d.nota : ''}`
      })
    })
  })

  ipcMain.handle('stock:anular', (_e, movimientoId: number) => {
    transaccion(() => {
      const m = db
        .prepare('SELECT * FROM movimiento_stock WHERE id = ?')
        .get(movimientoId) as unknown as
        | {
            id: number
            producto_id: number
            tipo: 'entrada' | 'salida'
            cantidad: number
            origen: Origen
            anula_a: number | null
          }
        | undefined
      if (!m) throw new Error('Movimiento no encontrado')
      if (m.origen === 'consulta') {
        throw new Error('Los movimientos de una consulta se corrigen editando la consulta')
      }
      if (m.anula_a) {
        throw new Error('Una anulación no se puede anular. Registrá un ingreso o una baja nueva')
      }
      const ya = db.prepare('SELECT 1 AS x FROM movimiento_stock WHERE anula_a = ?').get(movimientoId)
      if (ya) throw new Error('Este movimiento ya fue anulado')
      registrarMovimiento({
        productoId: m.producto_id,
        tipo: m.tipo === 'entrada' ? 'salida' : 'entrada',
        cantidad: m.cantidad,
        origen: 'ajuste',
        anulaA: m.id,
        nota: `Anulación del movimiento #${m.id}`
      })
    })
  })

  ipcMain.handle('stock:movimientos', (_e, productoId: number) =>
    db
      .prepare(
        `SELECT m.id, m.fecha, m.tipo, m.cantidad, m.origen, m.nota, m.anula_a,
                m.costo_unitario, pv.nombre AS proveedor,
                EXISTS (SELECT 1 FROM movimiento_stock x WHERE x.anula_a = m.id) AS anulado
         FROM movimiento_stock m
         LEFT JOIN proveedor pv ON pv.id = m.proveedor_id
         WHERE m.producto_id = ? ORDER BY m.id DESC LIMIT 50`
      )
      .all(productoId)
  )

    // ---------- Eliminar producto / proveedor ----------
  ipcMain.handle('productos:eliminar', (_e, id: number) => {
    transaccion(() => {
      const p = db
        .prepare('SELECT nombre FROM producto WHERE id = ?')
        .get(id) as unknown as { nombre: string } | undefined
      if (!p) throw new Error('Producto no encontrado')

      const enUso = db
        .prepare(
          `SELECT COALESCE(SUM(CASE tipo WHEN 'salida' THEN cantidad ELSE -cantidad END), 0) AS n
           FROM movimiento_stock WHERE producto_id = ? AND origen = 'consulta'`
        )
        .get(id) as unknown as { n: number }
      if (enUso.n > 0) {
        throw new Error(
          `"${p.nombre}" se usa en consultas de la historia clínica. Quitalo de esas consultas (editándolas) o eliminalas, y después podés eliminar el producto. Si solo querés sacarlo de la lista, archivalo.`
        )
      }

      const compras = db
        .prepare(
          `SELECT COUNT(*) AS n FROM movimiento_stock m
           WHERE m.producto_id = ? AND m.origen = 'compra' AND m.tipo = 'entrada'
             AND NOT EXISTS (SELECT 1 FROM movimiento_stock x WHERE x.anula_a = m.id)`
        )
        .get(id) as unknown as { n: number }
      if (compras.n > 0) {
        throw new Error(
          `"${p.nombre}" tiene ${compras.n} ${compras.n === 1 ? 'compra registrada' : 'compras registradas'}. Anulalas desde su historial de movimientos (botón Anular) y después podés eliminarlo. Si solo querés sacarlo de la lista, archivalo.`
        )
      }

      db.prepare('DELETE FROM consulta_producto WHERE producto_id = ?').run(id)
      db.prepare('DELETE FROM movimiento_stock WHERE producto_id = ?').run(id)
      db.prepare('DELETE FROM producto WHERE id = ?').run(id)
    })
  })

  ipcMain.handle('proveedores:eliminar', (_e, id: number) => {
    transaccion(() => {
      const pv = db
        .prepare('SELECT nombre FROM proveedor WHERE id = ?')
        .get(id) as unknown as { nombre: string } | undefined
      if (!pv) throw new Error('Proveedor no encontrado')

      const compras = db
        .prepare(
          `SELECT COUNT(*) AS n FROM movimiento_stock m
           WHERE m.proveedor_id = ? AND m.origen = 'compra' AND m.tipo = 'entrada'
             AND NOT EXISTS (SELECT 1 FROM movimiento_stock x WHERE x.anula_a = m.id)`
        )
        .get(id) as unknown as { n: number }
      if (compras.n > 0) {
        throw new Error(
          `${pv.nombre} tiene ${compras.n} ${compras.n === 1 ? 'compra registrada' : 'compras registradas'}. Anulalas desde Stock (historial del producto) y después podés eliminarlo. Si solo querés dejar de usarlo, archivalo para conservar el historial.`
        )
      }

      db.prepare('UPDATE producto SET proveedor_id = NULL WHERE proveedor_id = ?').run(id)
      db.prepare('UPDATE movimiento_stock SET proveedor_id = NULL WHERE proveedor_id = ?').run(id)
      db.prepare('DELETE FROM proveedor WHERE id = ?').run(id)
    })
  })
}