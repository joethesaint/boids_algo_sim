// Seeded Perlin noise and fbm adapted from Kelingking by Samnang Aing (MIT, 2026).
// The Bliss hill layout is original; no OSM data or source beach geometry is used.
const lerp=(a,b,t)=>a+(b-a)*t;
function makeNoise(seed) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256).map((_, i) => i);
  let s = seed * 2654435761 >>> 0;
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const r = s % (i + 1);
    [p[i], p[r]] = [p[r], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const grad = (h, x, y) => { const g = G[h & 7]; return g[0] * x + g[1] * y; };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1], ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    const u = fade(xf), v = fade(yf);
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v) * 1.4;
  };
}

export function fbm(noise, x, y, octaves) {
  let sum = 0, amp = 0.5, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * f, y * f);
    f *= 2.03; amp *= 0.5;
  }
  return sum;
}
const noise=makeNoise(1983);
export function heightAt(x,z) {
  const hill=(cx,cz,h,rx,rz)=>h*Math.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2));
  return 4+hill(55,-150,66,210,135)+hill(-240,-380,46,205,170)
    +hill(260,-590,62,250,160)+hill(-310,160,28,240,190)
    +3*fbm(noise,x/180,z/180,3)+.3*fbm(noise,x/35,z/35,2);
}
