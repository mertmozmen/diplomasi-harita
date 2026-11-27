// WebGL2 çizici: sahiplik (R8UI) + bölge (R16UI) dokularından ekran çözünürlüğünde
// dolgu ve keskin, sabit kalınlıkta sınır çizgileri üretir.

const VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D uOwner;
uniform usampler2D uRegion;
uniform sampler2D uPal;
uniform vec2 uSize;
uniform vec2 uOff;
uniform float uScale;
uniform float uViewH;
uniform float uLW;
uniform bool uInternal;
uniform uint uHover;
uniform vec3 uWater;
uniform vec3 uLand;
uniform vec3 uBg;
uniform vec3 uLine;
out vec4 o;

ivec2 cl(ivec2 t) { return clamp(t, ivec2(0), ivec2(uSize) - 1); }
uint ow(ivec2 t) { return texelFetch(uOwner, cl(t), 0).r; }
uint rg(ivec2 t) { return texelFetch(uRegion, cl(t), 0).r; }
uint ck(uint r, uint w) { return r == 0u ? 0u : (w == 0u ? 1u : w + 2u); }
uint cls(ivec2 t) { return ck(rg(t), ow(t)); }

// Dört komşunun çift-doğrusal çoğunluğu; kazanan anahtarın sınırına ekran pikseli cinsinden uzaklık
float bdist(uvec4 k, vec2 f, out uint win) {
  vec4 w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  if (k.x == k.y && k.x == k.z && k.x == k.w) { win = k.x; return 1e4; }
  vec4 s;
  s.x = dot(vec4(equal(k, uvec4(k.x))), w);
  s.y = dot(vec4(equal(k, uvec4(k.y))), w);
  s.z = dot(vec4(equal(k, uvec4(k.z))), w);
  s.w = dot(vec4(equal(k, uvec4(k.w))), w);
  uint b = k.x; float bs = s.x;
  if (s.y > bs) { bs = s.y; b = k.y; }
  if (s.z > bs) { bs = s.z; b = k.z; }
  if (s.w > bs) { bs = s.w; b = k.w; }
  win = b;
  vec4 I = vec4(equal(k, uvec4(b)));
  vec2 g = vec2((I.y - I.x) * (1.0 - f.y) + (I.w - I.z) * f.y,
                (I.z - I.x) * (1.0 - f.x) + (I.w - I.y) * f.x);
  float gn = length(g);
  if (gn < 1e-5) return 0.0;
  return abs(bs - 0.5) * uScale / gn;
}

void main() {
  vec2 dev = vec2(gl_FragCoord.x, uViewH - gl_FragCoord.y);
  vec2 p = (dev - uOff) / uScale;
  if (p.x < 0.0 || p.y < 0.0 || p.x >= uSize.x || p.y >= uSize.y) { o = vec4(uBg, 1.0); return; }

  vec2 q = p - 0.5;
  ivec2 i0 = ivec2(floor(q));
  vec2 f = q - floor(q);
  ivec2 A = i0, B = i0 + ivec2(1, 0), C = i0 + ivec2(0, 1), D = i0 + ivec2(1, 1);
  uvec4 rk = uvec4(rg(A), rg(B), rg(C), rg(D));
  uvec4 wk = uvec4(ow(A), ow(B), ow(C), ow(D));
  uvec4 kk = uvec4(ck(rk.x, wk.x), ck(rk.y, wk.y), ck(rk.z, wk.z), ck(rk.w, wk.w));

  uint cw; float dC = bdist(kk, f, cw);
  uint rw; float dR = bdist(rk, f, rw);

  float hM = 0.8 * uLW;   // ülke / kıyı çizgisi yarı kalınlığı
  float hm = 0.55 * uLW;  // bugünkü ülke sınırı yarı kalınlığı
  float aM = clamp(hM + 0.5 - dC, 0.0, 1.0);
  float am = clamp(hm + 0.5 - dR, 0.0, 1.0);

  // Uzaklaştırınca (piksel < doku hücresi) komşu denemesiyle kesintisiz çizgi
  if (uScale < 2.0) {
    float t = clamp(2.0 - uScale, 0.0, 1.0);
    ivec2 pc = ivec2(floor(p));
    uint c0 = cls(pc);
    uint r0 = rg(pc);
    float rM = hM / uScale;
    float rm = hm / uScale;
    bool nM = cls(ivec2(floor(p + vec2(rM, 0.0)))) != c0 || cls(ivec2(floor(p - vec2(rM, 0.0)))) != c0 ||
              cls(ivec2(floor(p + vec2(0.0, rM)))) != c0 || cls(ivec2(floor(p - vec2(0.0, rM)))) != c0;
    bool nm = rg(ivec2(floor(p + vec2(rm, 0.0)))) != r0 || rg(ivec2(floor(p - vec2(rm, 0.0)))) != r0 ||
              rg(ivec2(floor(p + vec2(0.0, rm)))) != r0 || rg(ivec2(floor(p - vec2(0.0, rm)))) != r0;
    if (nM) aM = max(aM, t);
    if (nm) am = max(am, t);
  }

  if (cw == 0u) am = 0.0;
  else if (cw >= 2u) am = uInternal ? am * 0.45 : 0.0;

  vec3 col;
  if (cw == 0u) col = uWater;
  else if (cw == 1u) col = uLand;
  else col = texelFetch(uPal, ivec2(int(cw - 2u), 0), 0).rgb;
  if (uHover != 0u && rw == uHover && cw != 0u) col = mix(col, vec3(0.08, 0.08, 0.1), 0.14);

  col = mix(col, uLine, max(aM, am));
  o = vec4(col, 1.0);
}`;

function hex3(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class Cizici {
  constructor(canvas, W, H) {
    this.canvas = canvas;
    this.W = W;
    this.H = H;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('webgl2');
    this.gl = gl;

    const sh = (tip, kaynak) => {
      const s = gl.createShader(tip);
      gl.shaderSource(s, kaynak);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    this.pr = pr;
    this.vao = gl.createVertexArray();
    this.u = {};
    for (const ad of ['uOwner', 'uRegion', 'uPal', 'uSize', 'uOff', 'uScale', 'uViewH', 'uLW', 'uInternal',
      'uHover', 'uWater', 'uLand', 'uBg', 'uLine']) this.u[ad] = gl.getUniformLocation(pr, ad);

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const doku = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.tOwner = doku();
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8UI, W, H);
    this.tRegion = doku();
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R16UI, W, H);
    this.tPal = doku();
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 256, 1);
    this.renkler = { su: '#ffffff', kara: '#ffffff', bg: '#dcdad4', cizgi: '#141414' };
  }

  yukleHepsi(owner, region) {
    this.yukleAlan(owner, region, 0, 0, this.W, this.H);
  }

  yukleAlan(owner, region, x, y, w, h) {
    const gl = this.gl;
    if (w <= 0 || h <= 0) return;
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, this.W);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y);
    if (owner) {
      gl.bindTexture(gl.TEXTURE_2D, this.tOwner);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RED_INTEGER, gl.UNSIGNED_BYTE, owner);
    }
    if (region) {
      gl.bindTexture(gl.TEXTURE_2D, this.tRegion);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RED_INTEGER, gl.UNSIGNED_SHORT, region);
    }
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
  }

  // renkler: 256 elemanlı '#rrggbb' | null dizisi (indeks = ülke no)
  paletYukle(renkler) {
    const gl = this.gl;
    const d = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const h = renkler[i] || '#cccccc';
      const n = parseInt(h.slice(1), 16);
      d[i * 4] = (n >> 16) & 255;
      d[i * 4 + 1] = (n >> 8) & 255;
      d[i * 4 + 2] = n & 255;
      d[i * 4 + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.tPal);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, d);
  }

  _ciz(vw, vh, view, ayar) {
    const gl = this.gl;
    const u = this.u;
    gl.viewport(0, 0, vw, vh);
    gl.useProgram(this.pr);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tOwner); gl.uniform1i(u.uOwner, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tRegion); gl.uniform1i(u.uRegion, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tPal); gl.uniform1i(u.uPal, 2);
    gl.uniform2f(u.uSize, this.W, this.H);
    gl.uniform2f(u.uOff, view.ox, view.oy);
    gl.uniform1f(u.uScale, view.scale);
    gl.uniform1f(u.uViewH, vh);
    gl.uniform1f(u.uLW, ayar.cizgi || 1);
    gl.uniform1i(u.uInternal, ayar.icSinir ? 1 : 0);
    gl.uniform1ui(u.uHover, ayar.hover || 0);
    gl.uniform3fv(u.uWater, hex3(ayar.su || this.renkler.su));
    gl.uniform3fv(u.uLand, hex3(this.renkler.kara));
    gl.uniform3fv(u.uBg, hex3(ayar.bg || this.renkler.bg));
    gl.uniform3fv(u.uLine, hex3(this.renkler.cizgi));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  ciz(view, ayar) {
    this._ciz(this.canvas.width, this.canvas.height, view, ayar);
  }

  // Tam harita görüntüsü (genişlik ew piksel) → ImageData
  disaAktar(ew, ayar) {
    const gl = this.gl;
    const eh = Math.round((ew * this.H) / this.W);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, ew, eh);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    this._ciz(ew, eh, { ox: 0, oy: 0, scale: ew / this.W }, ayar);
    const px = new Uint8Array(ew * eh * 4);
    gl.readPixels(0, 0, ew, eh, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    const img = new ImageData(ew, eh);
    const satir = ew * 4;
    for (let y = 0; y < eh; y++) img.data.set(px.subarray((eh - 1 - y) * satir, (eh - y) * satir), y * satir);
    return img;
  }
}
