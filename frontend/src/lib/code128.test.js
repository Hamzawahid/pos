import { describe, it, expect } from 'vitest'
import { code128Modules, code128Svg, canEncode128, code128ModuleCount } from './code128'

// Reverse lookup so we can DECODE what we encoded — a self-consistent
// encode→decode round-trip proves the symbol a scanner would read is correct.
const PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112',
]
const REV = Object.fromEntries(PATTERNS.map((p, i) => [p, i]))

function decode(text) {
  const mods = code128Modules(text)
  const symbols = []
  let i = 0
  while (i < mods.length) {
    const len = (mods.length - i === 7) ? 7 : 6
    symbols.push(mods.slice(i, i + len)); i += len
  }
  const values = symbols.map(s => REV[s])
  expect(values[0]).toBe(104)                 // Start B
  expect(values[values.length - 1]).toBe(106) // Stop
  const data = values.slice(1, -2)            // between start and (checksum, stop)
  const check = values[values.length - 2]
  // recompute checksum
  let sum = 104
  data.forEach((v, k) => { sum += v * (k + 1) })
  expect(sum % 103).toBe(check)
  return data.map(v => String.fromCharCode(v + 32)).join('')
}

describe('code128', () => {
  it('encodes → decodes back to the original value (numeric barcode)', () => {
    expect(decode('123456789012')).toBe('123456789012')
  })
  it('round-trips alphanumeric SKUs', () => {
    expect(decode('ABC-123x')).toBe('ABC-123x')
  })
  it('every symbol is a known pattern (valid, scannable structure)', () => {
    const mods = code128Modules('998877')
    // split and ensure each chunk maps to a real pattern value
    let i = 0
    while (i < mods.length) { const len = (mods.length - i === 7) ? 7 : 6; expect(REV[mods.slice(i, i + len)]).toBeDefined(); i += len }
  })
  it('renders an SVG with black bars', () => {
    const svg = code128Svg('55555')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toMatch(/<rect/)
  })
  it('leaves at least a 10-module quiet zone on each side (or it will not scan)', () => {
    const m = 2
    const svg = code128Svg('12345', { moduleWidth: m })
    const firstX = Number(svg.match(/<rect x="([\d.]+)"/)[1])
    expect(firstX).toBeGreaterThanOrEqual(10 * m)              // left quiet zone
    const totalW = Number(svg.match(/width="([\d.]+)"/)[1])
    const lastRect = [...svg.matchAll(/<rect x="([\d.]+)" y="0" width="([\d.]+)"/g)].pop()
    const rightEdge = Number(lastRect[1]) + Number(lastRect[2])
    expect(totalW - rightEdge).toBeGreaterThanOrEqual(10 * m)  // right quiet zone
  })
  it('code128ModuleCount returns the total module units', () => {
    expect(code128ModuleCount('12345')).toBeGreaterThan(0)
  })
  it('canEncode128 flags empty / unsupported values', () => {
    expect(canEncode128('')).toBe(false)
    expect(canEncode128('7290001')).toBe(true)
    expect(canEncode128('café')).toBe(false)  // é is outside subset B
  })
})
