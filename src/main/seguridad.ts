import { app, ipcMain, session } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { is } from '@electron-toolkit/utils'

type Escuchador = Parameters<typeof ipcMain.handle>[1]

const normalizar = (u: string): string => {
  try {
    return decodeURIComponent(u).toLowerCase()
  } catch {
    return u.toLowerCase()
  }
}

// Solo se aceptan pedidos que vienen de la propia pantalla de la aplicación
function origenPropio(url: string): boolean {
  const dev = process.env['ELECTRON_RENDERER_URL']
  if (is.dev && dev) return normalizar(url).startsWith(normalizar(dev))
  const propio = pathToFileURL(join(__dirname, '../renderer/index.html')).href
  return normalizar(url).startsWith(normalizar(propio))
}

// Todos los canales de comunicación pasan por esta verificación
export function protegerIpc(): void {
  const original = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (canal: string, escuchador: Escuchador): void => {
    original(canal, (evento, ...args) => {
      if (!origenPropio(evento.senderFrame?.url ?? '')) throw new Error('Solicitud no autorizada')
      return escuchador(evento, ...args)
    })
  }
}

// La aplicación no usa internet: se cancela cualquier pedido de red y se niegan los permisos
export function protegerSesion(): void {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_wc, _permiso, devolver) => devolver(false))
  ses.setPermissionCheckHandler(() => false)
  ses.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] },
    (detalles, devolver) => {
      const local = is.dev && /^(https?|wss?):\/\/(localhost|127\.0\.0\.1)[:/]/.test(detalles.url)
      devolver({ cancel: !local })
    }
  )
}

// Sin navegación fuera de la app, sin ventanas nuevas y sin webviews
export function protegerVentanas(): void {
  app.on('web-contents-created', (_e, contenido) => {
    contenido.on('will-navigate', (evento, url) => {
      if (!origenPropio(url)) evento.preventDefault()
    })
    contenido.setWindowOpenHandler(() => ({ action: 'deny' }))
    contenido.on('will-attach-webview', (evento) => evento.preventDefault())
  })
}