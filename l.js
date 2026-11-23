// Box kit loader (Chihiro, 2026-11-23). A project-chat box arrives as its readable message plus a short skeleton;
// this fills the skeleton's {%id%} gaps with the pieces in c/, which are locked (ChaCha20) with a key that only
// the posted box carries, then puts the box in place and runs its scripts. If anything fails, the message stays.
// Um... if you found this, the pictures here are noise without the key. They're Rain's, so please leave them be.
const Q = (a, b) => (a << b) | (a >>> (32 - b))
function block(k, n, c) {
  const s = new Uint32Array([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574, ...k, c, ...n]), x = s.slice()
  const qr = (a, b, c, d) => {
    x[a] += x[b]; x[d] = Q(x[d] ^ x[a], 16); x[c] += x[d]; x[b] = Q(x[b] ^ x[c], 12)
    x[a] += x[b]; x[d] = Q(x[d] ^ x[a], 8); x[c] += x[d]; x[b] = Q(x[b] ^ x[c], 7)
  }
  for (let i = 0; i < 10; i++) {
    qr(0, 4, 8, 12); qr(1, 5, 9, 13); qr(2, 6, 10, 14); qr(3, 7, 11, 15)
    qr(0, 5, 10, 15); qr(1, 6, 11, 12); qr(2, 7, 8, 13); qr(3, 4, 9, 14)
  }
  for (let i = 0; i < 16; i++) x[i] += s[i]
  return new Uint8Array(x.buffer)
}
function unlock(key, buf) {
  // file = 16-byte nonce (4-byte little-endian counter + 12-byte nonce, as Python's cryptography ChaCha20 takes it) + data
  const u = new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset)
  const k = new Uint32Array(8); for (let i = 0; i < 8; i++) k[i] = key.getUint32(i * 4, true)
  const n = [dv.getUint32(4, true), dv.getUint32(8, true), dv.getUint32(12, true)]
  let c = dv.getUint32(0, true)
  const out = new Uint8Array(u.length - 16)
  for (let o = 0; o < out.length; o += 64, c++) {
    const ks = block(k, n, c >>> 0)
    for (let j = 0; j < 64 && o + j < out.length; j++) out[o + j] = u[16 + o + j] ^ ks[j]
  }
  return out
}
async function text(bytes) {
  // first byte: 1 = gzip, 0 = plain
  const body = bytes.subarray(1)
  if (bytes[0] !== 1) return new TextDecoder().decode(body)
  const ds = new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'))
  return await new Response(ds).text()
}
const b64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0))
const base = new URL('.', import.meta.url).href
async function open(sk) {
  if (sk.dataset.done) return
  sk.dataset.done = 1
  const msg = sk.previousElementSibling && sk.previousElementSibling.classList.contains('nkm') ? sk.previousElementSibling : null
  const key = new DataView(b64(sk.dataset.k).buffer)
  let src = sk.textContent.replace(/<\\\/script/gi, '</script').replace(/<\\!--/g, '<!--')
  const ids = [...new Set([...src.matchAll(/\{%([a-z0-9]+)%\}/g)].map(m => m[1]).filter(i => i !== 'm'))]
  const got = {}
  await Promise.all(ids.map(async id => {
    const r = await fetch(`${base}c/${id}.bin`)
    if (!r.ok) throw new Error(`piece ${id}: ${r.status}`)
    got[id] = await text(unlock(key, await r.arrayBuffer()))
  }))
  const html = src.replace(/\{%([a-z0-9]+)%\}/g, (m, id) => id === 'm' ? (msg ? msg.innerHTML : '') : got[id])
  const t = document.createElement('template')
  t.innerHTML = html
  const scripts = [...t.content.querySelectorAll('script')]
  const anchor = msg || sk
  anchor.replaceWith(t.content)
  if (msg) sk.remove()
  for (const old of scripts) {
    const s = document.createElement('script')
    for (const a of old.attributes) s.setAttribute(a.name, a.value)
    s.textContent = old.textContent
    old.replaceWith(s)
  }
}
for (const sk of document.querySelectorAll('script.nks')) open(sk).catch(e => console.warn('box kit: kept the plain message (' + e.message + ')'))
