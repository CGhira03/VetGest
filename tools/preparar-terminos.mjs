import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const FUENTE = 'src/renderer/src/assets/terminos.txt'
const SALIDA_TXT = 'src/renderer/src/assets/terminos.limpio.txt'
const SALIDA_RTF = 'build/terminos.rtf'
const TITULO = 'VeteMascota — Términos y condiciones de uso y licencia de software'
const VERSION = 'Versión 1.0'
const INICIO = '[INICIO DE LOS TÉRMINOS]'
const FIN = '[FIN DE LOS TÉRMINOS]'

let crudo = existsSync(FUENTE) ? readFileSync(FUENTE, 'utf8') : ''
if (!crudo.trim()) {
  console.warn(`AVISO: falta ${FUENTE}. Pegá ahí el texto del documento de términos. Se genera un texto provisorio.`)
  crudo = 'Texto de términos y condiciones pendiente de cargar.'
}
crudo = crudo.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
if (crudo.includes(INICIO)) crudo = crudo.split(INICIO)[1]
if (crudo.includes(FIN)) crudo = crudo.split(FIN)[0]

const bloques = []
for (const linea of crudo.split('\n')) {
  const l = linea.replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, '$1').replace(/\*\*|__/g, '').trim()
  if (!l) continue
  let m
  if ((m = /^#{1,6}\s+(.*)$/.exec(l))) bloques.push({ t: 'h', x: m[1].trim() })
  else if ((m = /^[-*•]\s+(.*)$/.exec(l))) bloques.push({ t: 'li', x: m[1].trim() })
  else if (/^\d{1,2}\.\s+[^\d\s]/.test(l)) bloques.push({ t: 'h', x: l })
  else bloques.push({ t: 'p', x: l })
}

const pendientes = [...new Set(bloques.flatMap((b) => b.x.match(/\[[^\]]{2,}\]/g) ?? []))]
if (pendientes.length > 0) {
  console.warn(`\nATENCIÓN: quedan ${pendientes.length} datos entre corchetes sin completar en los términos:`)
  pendientes.forEach((p) => console.warn('  ' + p))
  console.warn('Completalos en el documento, volvé a pegar el texto y repetí antes de entregar.\n')
}

const out = [`## ${TITULO}`, '', VERSION]
let previo = 'p'
for (const b of bloques) {
  if (b.t === 'li' && previo === 'li') out.push(`- ${b.x}`)
  else if (b.t === 'li') out.push('', `- ${b.x}`)
  else if (b.t === 'h') out.push('', `## ${b.x}`)
  else out.push('', b.x)
  previo = b.t
}
writeFileSync(SALIDA_TXT, out.join('\n') + '\n', 'utf8')

function rtf(s) {
  let o = ''
  for (const ch of s) {
    const c = ch.codePointAt(0)
    if (ch === '\\' || ch === '{' || ch === '}') o += '\\' + ch
    else if (c > 126) {
      if (c > 0xffff) {
        const x = c - 0x10000
        for (const u of [0xd800 + (x >> 10), 0xdc00 + (x & 0x3ff)]) o += `\\u${u - 65536}?`
      } else o += `\\u${c > 32767 ? c - 65536 : c}?`
    } else o += ch
  }
  return o
}
const cuerpo = [`\\pard\\sa120{\\b\\fs28 ${rtf(TITULO)}}\\par`, `\\pard\\sa200 ${rtf(VERSION)}\\par`]
for (const b of bloques) {
  if (b.t === 'h') cuerpo.push(`\\pard\\sb240\\sa80{\\b\\fs24 ${rtf(b.x)}}\\par`)
  else if (b.t === 'li') cuerpo.push(`\\pard\\li360\\fi-240\\sa60 \\u8226?\\tab ${rtf(b.x)}\\par`)
  else cuerpo.push(`\\pard\\sa120 ${rtf(b.x)}\\par`)
}
mkdirSync(dirname(SALIDA_RTF), { recursive: true })
writeFileSync(
  SALIDA_RTF,
  `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\fswiss\\fcharset0 Segoe UI;}}\\fs20 \n${cuerpo.join('\n')}\n}`,
  'utf8'
)
console.log(`Términos preparados: ${bloques.length} bloques → ${SALIDA_TXT} y ${SALIDA_RTF}`)