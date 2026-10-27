import { createPrivateKey, sign } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const clave = arg('clave')
const nombre = arg('nombre')
const id = arg('id')
const salida = arg('salida')

if (!clave || !nombre || !id || !salida) {
  console.error(
    'Uso: node tools/emitir-licencia.mjs --clave <clave-privada.pem> --nombre "Veterinaria X" --id XXXX-XXXX-XXXX-XXXX-XXXX --salida <archivo.vetlic>'
  )
  process.exit(1)
}
if (!existsSync(clave)) {
  console.error(`No se encuentra la clave privada: ${clave}`)
  process.exit(1)
}
const idNorm = id.trim().toUpperCase()
if (!/^([0-9A-F]{4}-){4}[0-9A-F]{4}$/.test(idNorm)) {
  console.error('El ID de máquina no tiene el formato esperado (5 grupos de 4 caracteres, ej. 1A2B-3C4D-5E6F-7A8B-9C0D)')
  process.exit(1)
}

const datos = {
  app: 'VetGest',
  licenciatario: nombre.trim(),
  idMaquina: idNorm,
  emitida: new Date().toISOString().slice(0, 10)
}
const payload = Buffer.from(JSON.stringify(datos), 'utf8')
const firma = sign(null, payload, createPrivateKey(readFileSync(clave)))
writeFileSync(
  salida,
  JSON.stringify({ payload: payload.toString('base64'), firma: firma.toString('base64') }, null, 2)
)
// Registro de licencias emitidas (útil para reactivaciones, cláusula 10)
appendFileSync(join(dirname(clave), 'licencias-emitidas.csv'), `${datos.emitida};"${datos.licenciatario}";${idNorm}\n`)

console.log(`Licencia emitida para "${datos.licenciatario}" (ID ${idNorm})`)
console.log(`Archivo: ${salida}`)