import { app, BrowserWindow, dialog, ipcMain, type SaveDialogOptions } from 'electron'
import { rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { Workbook } from 'exceljs'
import { evaluar } from './licencia'
import { randomBytes } from 'crypto'

type Celda = string | number | null
interface Columna {
  titulo: string
  tipo?: 'texto' | 'entero' | 'moneda'
  alinear?: 'left' | 'right' | 'center'
}
interface Pedido {
  formato: 'pdf' | 'xlsx'
  archivo: string
  titulo: string
  subtitulo?: string
  columnas: Columna[]
  filas: Celda[][]
  notas?: string[]
}
interface Marca {
  nombre: string
  logo: string | null
}

const pesos = (n: number): string => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const alinea = (c: Columna): string =>
  c.alinear ?? (c.tipo === 'moneda' || c.tipo === 'entero' ? 'right' : 'left')

function mostrar(v: Celda, c: Columna): string {
  if (v === null || v === '') return ''
  if (typeof v === 'number') return c.tipo === 'moneda' ? pesos(v) : v.toLocaleString('es-AR')
  return v
}

async function marcaActual(): Promise<Marca> {
  let nombre = ''
  try {
    const e = await evaluar()
    if (e.modo === 'licencia' && e.licenciatario) nombre = e.licenciatario
  } catch {
    /* sin nombre de licencia */
  }
  return { nombre, logo: null }
}

function html(p: Pedido, m: Marca): string {
  const cab = p.columnas.map((c) => `<th class="${alinea(c)}">${esc(c.titulo)}</th>`).join('')
  const cuerpo = p.filas
    .map(
      (f) =>
        `<tr>${f
          .map((v, i) => `<td class="${alinea(p.columnas[i])}">${esc(mostrar(v, p.columnas[i]))}</td>`)
          .join('')}</tr>`
    )
    .join('')
  const notas = (p.notas ?? []).map((n) => `<p class="nota">${esc(n)}</p>`).join('')
  const encabezado = `<div class="cab">${m.logo ? `<img class="logo" src="${m.logo}" alt="">` : ''}<div>${
    m.nombre ? `<div class="clinica">${esc(m.nombre)}</div>` : ''
  }<div class="marca">VeteMascota</div></div></div>`
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    body { font-family: Arial, sans-serif; font-size: 10px; color: #1c1629; margin: 0; }
    .cab { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .logo { max-height: 42px; max-width: 150px; }
    .clinica { font-size: 13px; font-weight: bold; color: #15101f; }
    .marca { color: #7a4fdb; font-weight: bold; font-size: 9px; }
    h1 { font-size: 18px; color: #15101f; margin: 0 0 2px; }
    .sub { color: #6b6280; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    th { background: #15101f; color: #fff; padding: 6px 6px; font-size: 10px; }
    td { padding: 5px 6px; border-bottom: 1px solid #e5dcf6; }
    tr { page-break-inside: avoid; }
    tbody tr:nth-child(even) td { background: #f4efff; }
    .left { text-align: left; } .right { text-align: right; } .center { text-align: center; }
    .nota { margin: 10px 0 0; font-weight: bold; }
  </style></head><body>
    ${encabezado}
    <h1>${esc(p.titulo)}</h1>
    ${p.subtitulo ? `<div class="sub">${esc(p.subtitulo)}</div>` : ''}
    <table><thead><tr>${cab}</tr></thead><tbody>${cuerpo}</tbody></table>
    ${notas}
  </body></html>`
}

async function generarPdf(p: Pedido, destino: string, m: Marca): Promise<void> {
  const tmp = join(app.getPath('temp'), `vetemascota-${randomBytes(8).toString('hex')}.html`)
  writeFileSync(tmp, html(p, m), 'utf8')
  const win = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  try {
    await win.loadFile(tmp)
    const pdf = await win.webContents.printToPDF({
      landscape: p.columnas.length > 5,
      pageSize: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:8px;width:100%;text-align:center;color:#6b6280;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margins: { top: 0.5, bottom: 0.6, left: 0.5, right: 0.5 }
    })
    writeFileSync(destino, pdf)
  } finally {
    win.destroy()
    rmSync(tmp, { force: true })
  }
}

async function generarExcel(p: Pedido, destino: string, m: Marca): Promise<void> {
  const wb = new Workbook()
  wb.creator = 'VeteMascota'
  const hoja = wb.addWorksheet(p.titulo.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Datos')

  hoja.addRow([p.titulo]).font = { bold: true, size: 14 }
  hoja.addRow([[m.nombre, p.subtitulo].filter(Boolean).join(' · ')])
  hoja.addRow([])
  const cab = hoja.addRow(p.columnas.map((c) => c.titulo))
  cab.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15101F' } }
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })

  const largo = p.columnas.map((c) => c.titulo.length)
  for (const f of p.filas) {
    const fila = hoja.addRow(f)
    f.forEach((v, i) => {
      const col = p.columnas[i]
      const celda = fila.getCell(i + 1)
      if (typeof v === 'number') {
        celda.numFmt = col.tipo === 'moneda' ? '"$"#,##0.00' : '#,##0'
        celda.alignment = { horizontal: 'right' }
      }
      largo[i] = Math.max(largo[i], String(v ?? '').length)
    })
  }
  p.columnas.forEach((_c, i) => {
    hoja.getColumn(i + 1).width = Math.min(50, Math.max(10, largo[i] + 2))
  })

  if (p.notas && p.notas.length > 0) {
    hoja.addRow([])
    for (const n of p.notas) hoja.addRow([n]).font = { bold: true }
  }
  hoja.views = [{ state: 'frozen', ySplit: 4 }]
  hoja.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: p.columnas.length } }
  await wb.xlsx.writeFile(destino)
}

function validar(d: Pedido): void {
  if (d.formato !== 'pdf' && d.formato !== 'xlsx') throw new Error('Formato no válido')
  if (!Array.isArray(d.columnas) || d.columnas.length === 0) throw new Error('No hay columnas para exportar')
  if (!Array.isArray(d.filas)) throw new Error('No hay datos para exportar')
  if (d.filas.length > 20000) throw new Error('Son demasiadas filas para exportar de una vez')
  for (const f of d.filas) {
    if (!Array.isArray(f) || f.length !== d.columnas.length) throw new Error('Los datos a exportar no son válidos')
  }
}

export function registerExportar(): void {
  ipcMain.handle('exportar:tabla', async (_e, d: Pedido) => {
    validar(d)
    const ext = d.formato === 'pdf' ? 'pdf' : 'xlsx'
    const nombre = (d.archivo || 'exportacion').replace(/[<>:"/\\|?*]/g, '-')
    const opciones: SaveDialogOptions = {
      title: d.formato === 'pdf' ? 'Guardar PDF' : 'Guardar Excel',
      defaultPath: join(app.getPath('documents'), `${nombre}.${ext}`),
      filters: [
        d.formato === 'pdf'
          ? { name: 'Documento PDF', extensions: ['pdf'] }
          : { name: 'Libro de Excel', extensions: ['xlsx'] }
      ]
    }
    const win = BrowserWindow.getFocusedWindow()
    const r = win ? await dialog.showSaveDialog(win, opciones) : await dialog.showSaveDialog(opciones)
    if (r.canceled || !r.filePath) return null
    const marca = await marcaActual()
    if (d.formato === 'pdf') await generarPdf(d, r.filePath, marca)
    else await generarExcel(d, r.filePath, marca)
    return { ruta: r.filePath }
  })
}