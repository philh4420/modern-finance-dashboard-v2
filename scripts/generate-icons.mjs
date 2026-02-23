import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const PUBLIC_DIR = path.resolve('public')

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[n] = c >>> 0
  }
  return table
})()

const crc32 = (buffer) => {
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const typeBuffer = Buffer.from(type, 'ascii')
  const lengthBuffer = Buffer.alloc(4)
  lengthBuffer.writeUInt32BE(data.length, 0)
  const crcBuffer = Buffer.alloc(4)
  const crc = crc32(Buffer.concat([typeBuffer, data]))
  crcBuffer.writeUInt32BE(crc >>> 0, 0)
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer])
}

const toPng = (width, height, pixel) => {
  const stride = width * 4 + 1
  const raw = Buffer.alloc(stride * height)

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride
    raw[rowStart] = 0

    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y, width, height)
      const idx = rowStart + 1 + x * 4
      raw[idx] = r
      raw[idx + 1] = g
      raw[idx + 2] = b
      raw[idx + 3] = a
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const idat = zlib.deflateSync(raw, { level: 9 })

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const mix = (a, b, t) => Math.round(a + (b - a) * t)

const insideRoundedRect = (x, y, size, radius, padding) => {
  const min = padding
  const max = size - padding

  if (x < min || x >= max || y < min || y >= max) {
    return false
  }

  const left = min + radius
  const right = max - radius
  const top = min + radius
  const bottom = max - radius

  if (x >= left && x < right) return true
  if (y >= top && y < bottom) return true

  const corners = [
    [left, top],
    [right - 1, top],
    [left, bottom - 1],
    [right - 1, bottom - 1],
  ]

  for (const [cx, cy] of corners) {
    const dx = x - cx
    const dy = y - cy
    if (dx * dx + dy * dy <= radius * radius) {
      return true
    }
  }

  return false
}

const drawIcon = (size, options = { maskable: false }) => {
  const padding = options.maskable ? Math.round(size * 0.06) : 0
  const radius = Math.round(size * (options.maskable ? 0.18 : 0.2))

  const bars = [
    { x: 0.23, w: 0.12, h: 0.25, c: [34, 197, 94] },
    { x: 0.39, w: 0.12, h: 0.4, c: [20, 184, 166] },
    { x: 0.55, w: 0.12, h: 0.55, c: [56, 189, 248] },
    { x: 0.71, w: 0.12, h: 0.7, c: [234, 179, 8] },
  ]

  return toPng(size, size, (x, y) => {
    if (!insideRoundedRect(x, y, size, radius, padding)) {
      return [0, 0, 0, 0]
    }

    const nx = x / (size - 1)
    const ny = y / (size - 1)

    const bgT = clamp((nx * 0.55 + ny * 0.45), 0, 1)
    let r = mix(9, 19, bgT)
    let g = mix(16, 32, bgT)
    let b = mix(35, 58, bgT)

    const glowDx = nx - 0.7
    const glowDy = ny - 0.2
    const glow = Math.exp(-((glowDx * glowDx + glowDy * glowDy) * 12))
    r = clamp(Math.round(r + 40 * glow), 0, 255)
    g = clamp(Math.round(g + 35 * glow), 0, 255)
    b = clamp(Math.round(b + 50 * glow), 0, 255)

    for (const bar of bars) {
      const barX = Math.round(size * bar.x)
      const barW = Math.round(size * bar.w)
      const barH = Math.round(size * bar.h)
      const barY = size - padding - Math.round(size * 0.17) - barH
      const barR = Math.max(2, Math.round(barW * 0.25))

      if (insideRoundedRect(x, y, size, barR, 0) && x >= barX && x < barX + barW && y >= barY && y < barY + barH) {
        const t = clamp((y - barY) / Math.max(1, barH - 1), 0, 1)
        const [cr, cg, cb] = bar.c
        r = mix(cr + 30, cr, t)
        g = mix(cg + 30, cg, t)
        b = mix(cb + 30, cb, t)
      }
    }

    return [r, g, b, 255]
  })
}

const writeFile = (filename, buffer) => {
  fs.writeFileSync(path.join(PUBLIC_DIR, filename), buffer)
  console.log(`generated ${filename}`)
}

const writeIcoFromPng = (filename, pngBuffer, size) => {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)

  const entry = Buffer.alloc(16)
  entry[0] = size >= 256 ? 0 : size
  entry[1] = size >= 256 ? 0 : size
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(pngBuffer.length, 8)
  entry.writeUInt32LE(22, 12)

  writeFile(filename, Buffer.concat([header, entry, pngBuffer]))
}

fs.mkdirSync(PUBLIC_DIR, { recursive: true })

writeFile('pwa-192x192.png', drawIcon(192))
writeFile('pwa-512x512.png', drawIcon(512))
writeFile('pwa-512x512-maskable.png', drawIcon(512, { maskable: true }))
writeFile('apple-touch-icon.png', drawIcon(180))
const favicon32 = drawIcon(32)
writeFile('favicon-32x32.png', favicon32)
writeFile('favicon-16x16.png', drawIcon(16))
writeIcoFromPng('favicon.ico', favicon32, 32)

const faviconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Finance OS">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#091023"/>
      <stop offset="100%" stop-color="#10203a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <rect x="118" y="276" width="58" height="126" rx="12" fill="#22c55e"/>
  <rect x="204" y="210" width="58" height="192" rx="12" fill="#14b8a6"/>
  <rect x="290" y="148" width="58" height="254" rx="12" fill="#38bdf8"/>
  <rect x="376" y="102" width="58" height="300" rx="12" fill="#eab308"/>
</svg>
`

fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.svg'), faviconSvg)
console.log('generated favicon.svg')
