import { ipcMain } from 'electron'
import { getDb, opcional, registrarMovimiento, texto, transaccion } from './db'

const PAGOS = ['efectivo', 'transferencia', 'tarjeta', 'cuenta_corriente']
const MEDIOS_COBRO = ['efectivo', 'transferencia', 'tarjeta']
const ETIQUETA_PAGO: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cuenta_corriente: 'Cuenta corriente'
}

// Deuda de la cuenta = ventas a cuenta corriente vigentes - cobros vigentes (en centavos)
const SQL_SALDO = `
  COALESCE((SELECT SUM(v.total) FROM venta v
            WHERE v.cuenta_id = c.id AND v.anulada = 0 AND v.pago = 'cuenta_corriente'), 0)
  - COALESCE((SELECT SUM(k.monto) FROM cobro k WHERE k.cuenta_id = c.id AND k.anulado = 0), 0)`

const SQL_RESUMEN = `(SELECT group_concat(i.cantidad || ' × ' || i.descripcion, ', ')
                      FROM venta_item i WHERE i.venta_id = v.id)`

interface ItemIn {
  productoId?: number | null
  descripcion?: string
  cantidad: number
  precioUnitario: number
}
interface Linea {
  productoId: number | null
  descripcion: string
  cantidad: number
  precio: number
}
interface MovCuenta {
  clave: string
  tipo: 'venta' | 'cobro'
  id: number
  fecha: string
  detalle: string
  debe: number
  haber: number
  anulado: number
  estado?: 'pagada' | 'parcial' | 'pendiente'
  cubierto?: number
}
interface FilaCaja {
  clave: string
  fecha: string
  tipo: 'venta' | 'cobro' | 'compra' | 'stock'
  detalle: string
  medio: string
  ingreso: number
  egreso: number
  aCuenta: number
  anulado: number
}

function entero(v: unknown, mensaje: string, min: number): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min) throw new Error(mensaje)
  return n
}

const porFecha = (a: { fecha: string; id: number }, b: { fecha: string; id: number }): number =>
  a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id

export function registerVentas(): void {
  // ---------- Cuentas corrientes (clientes cargados a mano) ----------
  ipcMain.handle('cuentas:listar', (_e, q: string, soloDeuda?: boolean) => {
    const like = `%${q ?? ''}%`
    const filas = getDb()
      .prepare(
        `SELECT c.id, c.nombre, c.telefono, c.direccion, c.nota, ${SQL_SALDO} AS saldo,
                (SELECT MAX(k.fecha) FROM cobro k WHERE k.cuenta_id = c.id AND k.anulado = 0) AS ultimo_cobro
         FROM cuenta_cliente c
         WHERE c.nombre LIKE ? OR c.telefono LIKE ?
         ORDER BY c.nombre`
      )
      .all(like, like) as unknown as { saldo: number }[]
    return soloDeuda ? filas.filter((f) => f.saldo > 0) : filas
  })

  ipcMain.handle('cuentas:detalle', (_e, id: number) => {
    const db = getDb()
    const cuenta = db
      .prepare(
        `SELECT c.id, c.nombre, c.telefono, c.direccion, c.nota, ${SQL_SALDO} AS saldo
         FROM cuenta_cliente c WHERE c.id = ?`
      )
      .get(id)
    if (!cuenta) throw new Error('Cuenta no encontrada')

    const ventas = db
      .prepare(
        `SELECT v.id, v.fecha, v.total, v.nota, v.anulada, ${SQL_RESUMEN} AS resumen
         FROM venta v WHERE v.cuenta_id = ? AND v.pago = 'cuenta_corriente'`
      )
      .all(id) as unknown as {
      id: number
      fecha: string
      total: number
      nota: string | null
      anulada: number
      resumen: string | null
    }[]
    const cobros = db
      .prepare('SELECT id, fecha, monto, medio, nota, anulado FROM cobro WHERE cuenta_id = ?')
      .all(id) as unknown as {
      id: number
      fecha: string
      monto: number
      medio: string
      nota: string | null
      anulado: number
    }[]

    // Los cobros se aplican a las ventas más antiguas primero: así se sabe cuáles están pagadas y desde cuándo hay deuda
    const vigentes = ventas.filter((v) => !v.anulada).sort(porFecha)
    const vigCobros = cobros.filter((k) => !k.anulado)
    let pool = vigCobros.reduce((s, k) => s + k.monto, 0)
    const cubierto = new Map<number, number>()
    let masAntigua: string | null = null
    for (const v of vigentes) {
      const c = Math.min(v.total, pool)
      pool -= c
      cubierto.set(v.id, c)
      if (c < v.total && masAntigua === null) masAntigua = v.fecha
    }
    const comprado = vigentes.reduce((s, v) => s + v.total, 0)
    const cobrado = vigCobros.reduce((s, k) => s + k.monto, 0)
    const ultimoCobro = vigCobros.map((k) => k.fecha).sort().pop() ?? null

    const movs: (MovCuenta & { cmpId: number })[] = [
      ...ventas.map((v) => {
        const cub = cubierto.get(v.id) ?? 0
        return {
          clave: `v${v.id}`,
          tipo: 'venta' as const,
          id: v.id,
          cmpId: v.id,
          fecha: v.fecha,
          detalle: `Venta #${v.id}${v.resumen ? ': ' + v.resumen : ''}${v.nota ? ' – ' + v.nota : ''}`,
          debe: v.total,
          haber: 0,
          anulado: v.anulada,
          cubierto: v.anulada ? undefined : cub,
          estado: v.anulada
            ? undefined
            : cub >= v.total
              ? ('pagada' as const)
              : cub > 0
                ? ('parcial' as const)
                : ('pendiente' as const)
        }
      }),
      ...cobros.map((k) => ({
        clave: `c${k.id}`,
        tipo: 'cobro' as const,
        id: k.id,
        cmpId: k.id,
        fecha: k.fecha,
        detalle: `Cobro (${k.medio})${k.nota ? ' – ' + k.nota : ''}`,
        debe: 0,
        haber: k.monto,
        anulado: k.anulado
      }))
    ]
    movs.sort(porFecha.bind(null) as never)
    movs.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.cmpId - b.cmpId))
    let acumulado = 0
    const lista = movs.map(({ cmpId: _c, ...m }) => {
      if (!m.anulado) acumulado += m.debe - m.haber
      return { ...m, saldo: acumulado }
    })
    return {
      cuenta,
      resumen: { comprado, cobrado, saldo: comprado - cobrado, ultimoCobro, masAntigua },
      movimientos: lista.reverse()
    }
  })

  ipcMain.handle('cuentas:crear', (_e, d) => {
    const r = getDb()
      .prepare('INSERT INTO cuenta_cliente (nombre, telefono, direccion, nota, creado) VALUES (?, ?, ?, ?, ?)')
      .run(
        texto(d.nombre, 'nombre del cliente'),
        opcional(d.telefono),
        opcional(d.direccion),
        opcional(d.nota),
        new Date().toISOString()
      )
    return Number(r.lastInsertRowid)
  })

  ipcMain.handle('cuentas:editar', (_e, d) => {
    const r = getDb()
      .prepare('UPDATE cuenta_cliente SET nombre = ?, telefono = ?, direccion = ?, nota = ? WHERE id = ?')
      .run(texto(d.nombre, 'nombre del cliente'), opcional(d.telefono), opcional(d.direccion), opcional(d.nota), d.id)
    if (r.changes === 0) throw new Error('Cuenta no encontrada')
  })

  ipcMain.handle('cuentas:eliminar', (_e, id: number) => {
    const db = getDb()
    const n = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM venta WHERE cuenta_id = ?) AS ventas,
                (SELECT COUNT(*) FROM cobro WHERE cuenta_id = ?) AS cobros`
      )
      .get(id, id) as unknown as { ventas: number; cobros: number }
    if (n.ventas > 0 || n.cobros > 0) {
      throw new Error('Esta cuenta tiene ventas o cobros registrados, por eso no se puede eliminar.')
    }
    db.prepare('DELETE FROM cuenta_cliente WHERE id = ?').run(id)
  })

  // ---------- Cobros ----------
  ipcMain.handle('cobros:crear', (_e, d) => {
    const db = getDb()
    const monto = entero(d.monto, 'El monto debe ser mayor a 0', 1)
    const medio = String(d.medio)
    if (!MEDIOS_COBRO.includes(medio)) throw new Error('Elegí el medio de pago')
    if (!db.prepare('SELECT 1 AS x FROM cuenta_cliente WHERE id = ?').get(d.cuentaId)) {
      throw new Error('Cuenta no encontrada')
    }
    db.prepare('INSERT INTO cobro (cuenta_id, fecha, monto, medio, nota) VALUES (?, ?, ?, ?, ?)').run(
      d.cuentaId,
      new Date().toISOString(),
      monto,
      medio,
      opcional(d.nota)
    )
  })

  ipcMain.handle('cobros:anular', (_e, id: number) => {
    const r = getDb().prepare('UPDATE cobro SET anulado = 1 WHERE id = ? AND anulado = 0').run(id)
    if (r.changes === 0) throw new Error('El cobro no existe o ya estaba anulado')
  })

  // ---------- Ventas ----------
  ipcMain.handle('ventas:listar', (_e, f: { desde?: string; hasta?: string; q?: string }) => {
    const like = `%${f?.q ?? ''}%`
    return getDb()
      .prepare(
        `SELECT v.id, v.fecha, v.cuenta_id, COALESCE(c.nombre, v.cliente_nombre) AS cliente,
                v.pago, v.total, v.anulada, v.nota, ${SQL_RESUMEN} AS resumen
         FROM venta v LEFT JOIN cuenta_cliente c ON c.id = v.cuenta_id
         WHERE v.fecha >= ? AND v.fecha < ?
           AND (? = '%%' OR COALESCE(c.nombre, v.cliente_nombre, '') LIKE ?
                OR EXISTS (SELECT 1 FROM venta_item i WHERE i.venta_id = v.id AND i.descripcion LIKE ?))
         ORDER BY v.id DESC LIMIT 500`
      )
      .all(f?.desde || '0', f?.hasta || '9', like, like, like)
  })

  ipcMain.handle('ventas:totales', (_e, f: { desde?: string; hasta?: string }) =>
    getDb()
      .prepare(
        `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
         FROM venta WHERE anulada = 0 AND fecha >= ? AND fecha < ?`
      )
      .get(f?.desde || '0', f?.hasta || '9')
  )

  ipcMain.handle('ventas:detalle', (_e, id: number) => {
    const db = getDb()
    const venta = db
      .prepare(
        `SELECT v.id, v.fecha, v.pago, v.total, v.nota, v.anulada,
                COALESCE(c.nombre, v.cliente_nombre) AS cliente
         FROM venta v LEFT JOIN cuenta_cliente c ON c.id = v.cuenta_id WHERE v.id = ?`
      )
      .get(id)
    if (!venta) throw new Error('Venta no encontrada')
    const items = db
      .prepare(
        `SELECT id, producto_id, descripcion, cantidad, precio_unitario
         FROM venta_item WHERE venta_id = ? ORDER BY id`
      )
      .all(id)
    return { venta, items }
  })

  ipcMain.handle('ventas:crear', (_e, d) => {
    const pago = String(d.pago)
    if (!PAGOS.includes(pago)) throw new Error('Elegí la forma de pago')
    const items = (Array.isArray(d.items) ? d.items : []) as ItemIn[]
    if (items.length === 0) throw new Error('Agregá al menos un producto o concepto')
    const esCuenta = pago === 'cuenta_corriente'
    const cuentaId = esCuenta && d.cuentaId ? Number(d.cuentaId) : null
    if (esCuenta && !cuentaId) throw new Error('Para vender a cuenta corriente elegí la cuenta del cliente')

    return transaccion(() => {
      const db = getDb()
      if (cuentaId && !db.prepare('SELECT 1 AS x FROM cuenta_cliente WHERE id = ?').get(cuentaId)) {
        throw new Error('La cuenta elegida no existe')
      }

      const lineas = items.map((it): Linea => {
        const cantidad = entero(it.cantidad, 'La cantidad debe ser un número entero mayor a 0', 1)
        const precio = entero(it.precioUnitario, 'El precio no es válido', 0)
        if (it.productoId) {
          const p = db
            .prepare('SELECT nombre FROM producto WHERE id = ? AND activo = 1 AND eliminado = 0')
            .get(it.productoId) as unknown as { nombre: string } | undefined
          if (!p) throw new Error('Uno de los productos ya no está disponible en el stock')
          return { productoId: Number(it.productoId), descripcion: p.nombre, cantidad, precio }
        }
        return {
          productoId: null,
          descripcion: texto(it.descripcion, 'descripción del concepto'),
          cantidad,
          precio
        }
      })

      const total = lineas.reduce((s, l) => s + l.cantidad * l.precio, 0)
      const r = db
        .prepare(
          'INSERT INTO venta (fecha, cuenta_id, cliente_nombre, pago, total, nota) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          new Date().toISOString(),
          cuentaId,
          esCuenta ? null : opcional(d.clienteNombre) || null,
          pago,
          total,
          opcional(d.nota)
        )
      const ventaId = Number(r.lastInsertRowid)

      const ins = db.prepare(
        `INSERT INTO venta_item (venta_id, producto_id, descripcion, cantidad, precio_unitario)
         VALUES (?, ?, ?, ?, ?)`
      )
      for (const l of lineas) {
        ins.run(ventaId, l.productoId, l.descripcion, l.cantidad, l.precio)
        if (l.productoId) {
          registrarMovimiento({
            productoId: l.productoId,
            tipo: 'salida',
            cantidad: l.cantidad,
            origen: 'venta',
            referenciaId: ventaId,
            nota: `Venta #${ventaId}`
          })
        }
      }
      return ventaId
    })
  })

  ipcMain.handle('ventas:anular', (_e, id: number) => {
    transaccion(() => {
      const db = getDb()
      const r = db.prepare('UPDATE venta SET anulada = 1 WHERE id = ? AND anulada = 0').run(id)
      if (r.changes === 0) throw new Error('La venta no existe o ya estaba anulada')
      const salidas = db
        .prepare(
          `SELECT id, producto_id, cantidad FROM movimiento_stock
           WHERE origen = 'venta' AND referencia_id = ? AND tipo = 'salida' AND anula_a IS NULL`
        )
        .all(id) as unknown as { id: number; producto_id: number; cantidad: number }[]
      for (const m of salidas) {
        registrarMovimiento({
          productoId: m.producto_id,
          tipo: 'entrada',
          cantidad: m.cantidad,
          origen: 'venta',
          referenciaId: id,
          anulaA: m.id,
          nota: `Anulación de la venta #${id}`
        })
      }
    })
  })

  // ---------- Libro de movimientos (ingresos y egresos) ----------
  // tipo: dinero (ventas, cobros y compras) | venta | cobro | compra | stock (consultas, bajas, ajustes) | todo
  ipcMain.handle('movimientos:listar', (_e, f: { desde?: string; hasta?: string; tipo?: string }) => {
    const db = getDb()
    const desde = f?.desde || '0'
    const hasta = f?.hasta || '9'
    const tipo = f?.tipo || 'dinero'
    const incluye = (k: string): boolean =>
      tipo === 'todo' || tipo === k || (tipo === 'dinero' && k !== 'stock')
    const filas: FilaCaja[] = []

    if (incluye('venta')) {
      const ventas = db
        .prepare(
          `SELECT v.id, v.fecha, v.pago, v.total, v.anulada, v.nota,
                  COALESCE(c.nombre, v.cliente_nombre) AS cliente, ${SQL_RESUMEN} AS resumen
           FROM venta v LEFT JOIN cuenta_cliente c ON c.id = v.cuenta_id
           WHERE v.fecha >= ? AND v.fecha < ?`
        )
        .all(desde, hasta) as unknown as {
        id: number
        fecha: string
        pago: string
        total: number
        anulada: number
        nota: string | null
        cliente: string | null
        resumen: string | null
      }[]
      for (const v of ventas) {
        const cc = v.pago === 'cuenta_corriente'
        filas.push({
          clave: `v${v.id}`,
          fecha: v.fecha,
          tipo: 'venta',
          detalle: `Venta #${v.id}${v.cliente ? ' – ' + v.cliente : ''}${v.resumen ? ': ' + v.resumen : ''}${cc ? ' (a cuenta corriente)' : ''}`,
          medio: ETIQUETA_PAGO[v.pago] ?? v.pago,
          ingreso: cc ? 0 : v.total,
          egreso: 0,
          aCuenta: cc ? v.total : 0,
          anulado: v.anulada
        })
      }
    }

    if (incluye('cobro')) {
      const cobros = db
        .prepare(
          `SELECT k.id, k.fecha, k.monto, k.medio, k.nota, k.anulado, c.nombre AS cuenta
           FROM cobro k JOIN cuenta_cliente c ON c.id = k.cuenta_id
           WHERE k.fecha >= ? AND k.fecha < ?`
        )
        .all(desde, hasta) as unknown as {
        id: number
        fecha: string
        monto: number
        medio: string
        nota: string | null
        anulado: number
        cuenta: string
      }[]
      for (const k of cobros) {
        filas.push({
          clave: `c${k.id}`,
          fecha: k.fecha,
          tipo: 'cobro',
          detalle: `Cobro de cuenta corriente – ${k.cuenta}${k.nota ? ' – ' + k.nota : ''}`,
          medio: ETIQUETA_PAGO[k.medio] ?? k.medio,
          ingreso: k.monto,
          egreso: 0,
          aCuenta: 0,
          anulado: k.anulado
        })
      }
    }

    if (incluye('compra')) {
      const compras = db
        .prepare(
          `SELECT m.id, m.fecha, m.cantidad, m.costo_unitario, m.nota, pr.nombre AS producto,
                  pv.nombre AS proveedor,
                  EXISTS (SELECT 1 FROM movimiento_stock x WHERE x.anula_a = m.id) AS anulado
           FROM movimiento_stock m
           JOIN producto pr ON pr.id = m.producto_id
           LEFT JOIN proveedor pv ON pv.id = m.proveedor_id
           WHERE m.origen = 'compra' AND m.tipo = 'entrada' AND m.anula_a IS NULL
             AND m.fecha >= ? AND m.fecha < ?`
        )
        .all(desde, hasta) as unknown as {
        id: number
        fecha: string
        cantidad: number
        costo_unitario: number | null
        nota: string | null
        producto: string
        proveedor: string | null
        anulado: number
      }[]
      for (const m of compras) {
        filas.push({
          clave: `m${m.id}`,
          fecha: m.fecha,
          tipo: 'compra',
          detalle: `Compra de mercadería: ${m.cantidad} × ${m.producto}${m.proveedor ? ' (' + m.proveedor + ')' : ''}${m.costo_unitario ? '' : ' – sin costo cargado'}${m.nota ? ' – ' + m.nota : ''}`,
          medio: '',
          ingreso: 0,
          egreso: m.costo_unitario ? m.cantidad * m.costo_unitario : 0,
          aCuenta: 0,
          anulado: m.anulado
        })
      }
    }

    if (incluye('stock')) {
      const mov = db
        .prepare(
          `SELECT m.id, m.fecha, m.tipo, m.cantidad, m.origen, m.nota, pr.nombre AS producto,
                  EXISTS (SELECT 1 FROM movimiento_stock x WHERE x.anula_a = m.id) AS anulado
           FROM movimiento_stock m JOIN producto pr ON pr.id = m.producto_id
           WHERE m.origen IN ('consulta', 'ajuste') AND m.fecha >= ? AND m.fecha < ?
           ORDER BY m.id DESC LIMIT 2000`
        )
        .all(desde, hasta) as unknown as {
        id: number
        fecha: string
        tipo: string
        cantidad: number
        origen: string
        nota: string | null
        producto: string
        anulado: number
      }[]
      for (const m of mov) {
        filas.push({
          clave: `s${m.id}`,
          fecha: m.fecha,
          tipo: 'stock',
          detalle: `${m.tipo === 'entrada' ? 'Entrada' : 'Salida'} de stock (${m.origen}): ${m.cantidad} × ${m.producto}${m.nota ? ' – ' + m.nota : ''}`,
          medio: '',
          ingreso: 0,
          egreso: 0,
          aCuenta: 0,
          anulado: m.anulado
        })
      }
    }

    filas.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.clave < b.clave ? 1 : -1))
    return filas.slice(0, 3000)
  })
}