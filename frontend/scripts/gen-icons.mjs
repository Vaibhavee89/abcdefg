import sharp from 'sharp'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const p = (rel) => fileURLToPath(new URL('../' + rel, import.meta.url))
const svg = readFileSync(p('public/pwa-icon.svg'))

const targets = [
  ['public/pwa-192.png', 192],
  ['public/pwa-512.png', 512],
  ['public/apple-touch-icon.png', 180],
]

for (const [out, size] of targets) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(p(out))
  console.log('wrote', out)
}

// Maskable icon: same art, but padded so the glyph sits inside the safe zone (~80% of canvas)
const pad = Math.round(512 * 0.1)
await sharp(svg, { density: 384 })
  .resize(512 - pad * 2, 512 - pad * 2)
  .extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#2d4a30' })
  .png()
  .toFile(p('public/maskable-512.png'))
console.log('wrote public/maskable-512.png')
