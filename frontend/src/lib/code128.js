// Dependency-free Code 128 (subset B) barcode → SVG. Subset B covers all
// printable ASCII (space..~), which fits any product barcode/SKU we store.
// Output is a real, scannable Code 128 symbol (start B + data + checksum + stop
// with the final terminating bar), rendered as crisp vector rects for print.

// Canonical Code 128 width patterns, index = symbol value (0..106).
// Each entry is bar/space widths that sum to 11 modules; 106 (stop) is 13 modules.
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
const START_B = 104
const STOP = 106

// Returns a string of digits: concatenated bar/space widths (starts with a bar).
export function code128Modules(text) {
  const s = String(text)
  const codes = [START_B]
  let sum = START_B
  for (let i = 0; i < s.length; i++) {
    const v = s.charCodeAt(i) - 32
    if (v < 0 || v > 94) throw new Error('Code128B cannot encode character: ' + s[i])
    codes.push(v)
    sum += v * (i + 1)
  }
  codes.push(sum % 103)   // checksum
  codes.push(STOP)
  return codes.map(c => PATTERNS[c]).join('')
}

// Whether a value can be rendered (non-empty + all chars in subset B).
export function canEncode128(text) {
  const s = String(text ?? '')
  if (!s.length) return false
  for (const ch of s) { const v = ch.charCodeAt(0) - 32; if (v < 0 || v > 94) return false }
  return true
}

export function code128Svg(text, { height = 44, moduleWidth = 2, margin = 10 } = {}) {
  const widths = code128Modules(text)
  let x = margin, bar = true
  const rects = []
  for (const ch of widths) {
    const w = Number(ch) * moduleWidth
    if (bar) rects.push(`<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`)
    x += w; bar = !bar
  }
  const totalW = x + margin
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${height}" viewBox="0 0 ${totalW} ${height}" shape-rendering="crispEdges">${rects.join('')}</svg>`
}
