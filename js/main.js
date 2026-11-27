import { W, H, bolgeRasteri, satirAlanlari } from './harita.js';
import { Cizici } from './cizici.js';

const N = W * H;
const $ = (s, r = document) => r.querySelector(s);

// Başlangıç ülkeleri: renkler mevcut simülasyon haritalarından örneklendi.
const BASLANGIC = [
  ['Kırmızı', '#ac181e'], ['Turuncu', '#ffad01'], ['Eflatun', '#a01495'], ['Bordo', '#754046'],
  ['Mavi', '#296fa2'], ['Mor', '#6a42d8'], ['Sarı', '#dde365'], ['Kahve', '#8f504e'],
  ['Kiremit', '#bf6334'], ['Yeşil', '#28a154'],
];
const YEDEK_RENK = [
  '#1f3a68', '#1a8c8c', '#e377c2', '#8c8c2a', '#7fb6e6', '#9acd32', '#d4a017', '#5d6d7e', '#ff7f50',
  '#b39ddb', '#66cdaa', '#c2185b', '#d2b48c', '#2e5e3e', '#9e9e9e', '#4b0082', '#f08080', '#008b8b',
  '#bdb76b', '#cd853f',
];
const KALEM_RENK = ['#141414', '#c62828', '#1565c0', '#2e7d32', '#ffffff'];

const ARACLAR = {
  tasi: { ad: 'Taşı', ipucu: 'Haritayı sürükle. Tekerlek veya iki parmakla yakınlaş.' },
  doldur: { ad: 'Doldur', ipucu: 'Bir ülkeye tıkla; seçili renge boyansın. Sahipsiz seçiliyken tıklarsan boşaltır.' },
  firca: { ad: 'Fırça', ipucu: 'Serbestçe toprak boya. Sadece karaya işler, denize taşmaz.' },
  sinir: { ad: 'Sınır çek', ipucu: 'İki ülke arasındaki çizgiyi tut ve sürükle. Çizgiyi ittiğin yöne arkadaki ülke ilerler; renk ve çizgi birlikte gelir. Üçüncü ülkelere ve denize dokunmaz.' },
  silgi: { ad: 'Silgi', ipucu: 'Toprağı sahipsiz bırakır (beyaza döner).' },
  kalem: { ad: 'Kalem', ipucu: 'Harita üstüne serbest çizim: cephe hattı, ok, not. Topraklara dokunmaz.' },
  damlalik: { ad: 'Ülke seç', ipucu: 'Haritada bir yere dokun; oranın sahibi seçili ülke olsun. Diğer araçlarda Alt+tık da aynı işi yapar.' },
};

const S = {
  owner: null, region: null, baseRegion: null, shOwner: null, shRegion: null,
  bolgeler: [], rowArea: null, karaToplam: 1, alan: new Float64Array(256),
  ulkeler: new Array(256).fill(null),
  secili: 1,
  arac: 'doldur',
  firca: 22, korumali: false, doldurMod: 'ulke', etki: 140,
  kalemRenk: '#141414', kalemKalin: 5,
  icSinir: false, deniz: false, cizgi: 1,
  cizimler: [], aktifCizim: null,
  geri: [], ileri: [],
  view: { scale: 1, ox: 0, oy: 0 }, minScale: 0.1, dpr: 1,
  hoverBolge: 0, imlec: null, sinirHazir: false, bosluk: false,
  islem: null, regionKirli: false,
};

let cizici, glC, ustC, uctx;

// ---------------------------------------------------------------- başlangıç
async function basla() {
  glC = $('#gl');
  ustC = $('#ust');
  uctx = ustC.getContext('2d');
  try {
    cizici = new Cizici(glC, W, H);
  } catch (e) {
    $('#yukleniyor').textContent = 'Bu tarayıcı WebGL2 desteklemiyor. Güncel Chrome, Safari veya Firefox ile aç.';
    throw e;
  }
  ayarOku();
  await new Promise((r) => setTimeout(r, 20));

  const { region, bolgeler } = bolgeRasteri(window.__W, window.__ISIM);
  S.baseRegion = region;
  S.region = region.slice();
  S.owner = new Uint8Array(N);
  S.bolgeler = bolgeler;
  S.rowArea = satirAlanlari();
  let kara = 0;
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let i = y * W, e = i + W; i < e; i++) if (region[i]) n++;
    kara += n * S.rowArea[y];
  }
  S.karaToplam = kara;
  BASLANGIC.forEach(([ad, renk], i) => { S.ulkeler[i + 1] = { ad, renk, aktif: true }; });

  try { await otomatikYukle(); } catch (e) { console.warn('kayıt okunamadı', e); }

  S.shOwner = S.owner.slice();
  S.shRegion = S.region.slice();
  cizici.yukleHepsi(S.owner, S.region);
  paletGuncelle();

  arayuzKur();
  boyutla();
  sigdir();
  if (matchMedia('(max-width: 860px)').matches && glC.width < glC.height) {
    // Dik telefon ekranında dünya çok küçük kalır: Atlantik–Avrupa ortalı, yüksekliği dolduracak kadar yakın başla
    const s = Math.min((glC.width / W) * 3, (glC.height / H) * 0.92);
    S.view = { scale: s, ox: glC.width / 2 - W * 0.53 * s, oy: (glC.height - H * s) / 2 };
    sinirla();
  }
  istatistik();
  $('#yukleniyor').hidden = true;
  window.__harita = { S, W, H, isle, geriAl, ileriAl, istatistik };
}

// ---------------------------------------------------------------- yardımcılar
function kes(arr, x0, y0, w, h) {
  const out = new arr.constructor(w * h);
  for (let y = 0; y < h; y++) {
    const g = (y0 + y) * W + x0;
    out.set(arr.subarray(g, g + w), y * w);
  }
  return out;
}
function yapistir(arr, parca, x0, y0, w, h) {
  for (let y = 0; y < h; y++) arr.set(parca.subarray(y * w, (y + 1) * w), (y0 + y) * W + x0);
}
function esit(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function birlesim(k, x0, y0, x1, y1) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
  if (x1 <= x0 || y1 <= y0) return k;
  if (!k) return { x0, y0, x1, y1 };
  return { x0: Math.min(k.x0, x0), y0: Math.min(k.y0, y0), x1: Math.max(k.x1, x1), y1: Math.max(k.y1, y1) };
}
let yukBekleyen = null;
function yukleIste(x0, y0, x1, y1) { yukBekleyen = birlesim(yukBekleyen, x0, y0, x1, y1); istek(); }
function kirlet(x0, y0, x1, y1) { S.islem = birlesim(S.islem, x0, y0, x1, y1); yukleIste(x0, y0, x1, y1); }

// Sınır/dolgu anahtarı: deniz 0; sahipsiz kara = bölge no; sahipli kara = ülke (iç sınırlar açıksa ülke+bölge)
function anahtar(o, r, ic) {
  if (r === 0) return 0;
  if (o === 0) return r;
  return ic ? o * 65536 + r : o * 65536;
}

function bildir(metin, sure = 2600) {
  const b = $('#bildirim');
  b.textContent = metin;
  b.classList.add('goster');
  clearTimeout(bildir.t);
  bildir.t = setTimeout(() => b.classList.remove('goster'), sure);
}

function alanYazi(km2) {
  const f = (n, d) => n.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
  if (km2 >= 1e6) return f(km2 / 1e6, 2) + ' M km²';
  if (km2 >= 1e4) return f(km2 / 1e3, 0) + ' bin km²';
  if (km2 >= 1) return f(km2, 0) + ' km²';
  return '';
}
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------------------------------------------------------------- görünüm
function boyutla() {
  const r = $('#sahne').getBoundingClientRect();
  const eskiW = glC.width, eskiH = glC.height;
  S.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = Math.max(1, Math.round(r.width * S.dpr));
  const h = Math.max(1, Math.round(r.height * S.dpr));
  if (w === eskiW && h === eskiH) return;
  for (const c of [glC, ustC]) { c.width = w; c.height = h; }
  if (eskiW > 1) {
    // ortadaki noktayı yerinde tut
    S.view.ox += (w - eskiW) / 2;
    S.view.oy += (h - eskiH) / 2;
    S.minScale = Math.min(w / W, h / H) * 0.6;
  }
  istek();
}
function sigdir() {
  const cw = glC.width, ch = glC.height;
  const s = Math.min(cw / W, ch / H) * 0.97;
  S.view = { scale: s, ox: (cw - W * s) / 2, oy: (ch - H * s) / 2 };
  S.minScale = s * 0.6;
  istek();
}
function sinirla() {
  const v = S.view, cw = glC.width, ch = glC.height;
  const pad = 60 * S.dpr;
  v.ox = Math.min(Math.max(v.ox, pad - W * v.scale), cw - pad);
  v.oy = Math.min(Math.max(v.oy, pad - H * v.scale), ch - pad);
}
function yakinlas(f, dx, dy) {
  const v = S.view;
  const ns = Math.min(Math.max(v.scale * f, S.minScale), 14);
  const k = ns / v.scale;
  v.ox = dx - (dx - v.ox) * k;
  v.oy = dy - (dy - v.oy) * k;
  v.scale = ns;
  sinirla();
  istek();
}
function noktaAl(e) {
  const r = ustC.getBoundingClientRect();
  const dx = (e.clientX - r.left) * S.dpr;
  const dy = (e.clientY - r.top) * S.dpr;
  return { dx, dy, x: (dx - S.view.ox) / S.view.scale, y: (dy - S.view.oy) / S.view.scale };
}

let kareIstegi = 0;
function istek() { if (!kareIstegi) kareIstegi = requestAnimationFrame(kare); }
function kare() {
  kareIstegi = 0;
  if (eylem && eylem.tip === 'sinir' && eylem.yeniden) { eylem.yeniden = false; sinirHesapla(); }
  if (yukBekleyen) {
    const k = yukBekleyen;
    yukBekleyen = null;
    cizici.yukleAlan(S.owner, S.region, k.x0, k.y0, k.x1 - k.x0, k.y1 - k.y0);
  }
  cizici.ciz(S.view, cizimAyari());
  ustCiz();
}
function cizimAyari(ek = {}) {
  return { icSinir: S.icSinir, hover: S.hoverBolge, cizgi: S.cizgi, su: S.deniz ? '#dfeaf1' : '#ffffff', ...ek };
}

function cizgiCiz(c, st) {
  const p = st.pts;
  c.strokeStyle = st.renk;
  c.lineWidth = st.kalin;
  c.beginPath();
  c.moveTo(p[0], p[1]);
  if (p.length === 2) c.lineTo(p[0] + 0.01, p[1]);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
  c.stroke();
}

function ustCiz() {
  const c = uctx, v = S.view, d = S.dpr;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, ustC.width, ustC.height);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (S.cizimler.length || S.aktifCizim) {
    c.setTransform(v.scale, 0, 0, v.scale, v.ox, v.oy);
    for (const st of S.cizimler) cizgiCiz(c, st);
    if (S.aktifCizim) cizgiCiz(c, S.aktifCizim);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  const im = S.imlec;
  if (!im || kaydir || jest) return;
  const x = im.x * v.scale + v.ox, y = im.y * v.scale + v.oy;
  if (S.arac === 'firca' || S.arac === 'silgi') {
    const r = Math.max(2, S.firca * v.scale);
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    c.lineWidth = 3 * d; c.strokeStyle = 'rgba(255,255,255,.85)'; c.stroke();
    c.lineWidth = 1.2 * d; c.strokeStyle = 'rgba(20,20,20,.8)'; c.stroke();
  } else if (S.arac === 'sinir') {
    const r = S.etki * v.scale;
    c.setLineDash([5 * d, 5 * d]);
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    c.lineWidth = 1.2 * d; c.strokeStyle = 'rgba(20,20,20,.55)'; c.stroke();
    c.setLineDash([]);
    if (eylem && eylem.tip === 'sinir') {
      const bx = eylem.bas.x * v.scale + v.ox, by = eylem.bas.y * v.scale + v.oy;
      c.beginPath(); c.moveTo(bx, by); c.lineTo(x, y);
      c.lineWidth = 1.5 * d; c.strokeStyle = 'rgba(20,20,20,.6)'; c.setLineDash([3 * d, 4 * d]); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(bx, by, 3 * d, 0, Math.PI * 2); c.fillStyle = 'rgba(20,20,20,.6)'; c.fill();
    }
    const hazir = (eylem && eylem.tip === 'sinir') || S.sinirHazir;
    c.beginPath(); c.arc(x, y, 6 * d, 0, Math.PI * 2);
    c.fillStyle = hazir ? '#1c1b19' : 'rgba(255,255,255,.9)';
    c.fill();
    c.lineWidth = 2 * d; c.strokeStyle = hazir ? '#fff' : 'rgba(20,20,20,.6)'; c.stroke();
  } else if (S.arac === 'kalem') {
    c.beginPath(); c.arc(x, y, Math.max(1.5 * d, (S.kalemKalin * v.scale) / 2), 0, Math.PI * 2);
    c.fillStyle = S.kalemRenk; c.fill();
    c.lineWidth = 1 * d; c.strokeStyle = 'rgba(0,0,0,.4)'; c.stroke();
  }
}

// ---------------------------------------------------------------- işlem kaydı (geri al)
const GECMIS_BAYT = 320 * 1024 * 1024;
function gecmiseEkle(g) {
  S.geri.push(g);
  S.ileri = [];
  let top = 0;
  for (const x of S.geri) top += x.bayt || 0;
  while ((top > GECMIS_BAYT || S.geri.length > 300) && S.geri.length > 1) top -= S.geri.shift().bayt || 0;
  dugmeDurumu();
}

function isle() {
  const k = S.islem;
  S.islem = null;
  if (!k) return false;
  const w = k.x1 - k.x0, h = k.y1 - k.y0;
  if (w <= 0 || h <= 0) return false;
  const oO = kes(S.shOwner, k.x0, k.y0, w, h), nO = kes(S.owner, k.x0, k.y0, w, h);
  const oR = kes(S.shRegion, k.x0, k.y0, w, h), nR = kes(S.region, k.x0, k.y0, w, h);
  const dO = !esit(oO, nO), dR = !esit(oR, nR);
  if (!dO && !dR) return false;
  const g = { tip: 'raster', x0: k.x0, y0: k.y0, w, h, oO: dO ? oO : null, nO: dO ? nO : null, oR: dR ? oR : null, nR: dR ? nR : null };
  g.bayt = (dO ? 2 * w * h : 0) + (dR ? 4 * w * h : 0);
  if (dO) yapistir(S.shOwner, nO, k.x0, k.y0, w, h);
  if (dR) yapistir(S.shRegion, nR, k.x0, k.y0, w, h);
  gecmiseEkle(g);
  degisti(dR);
  return true;
}

function iptal() {
  const k = S.islem;
  S.islem = null;
  if (!k) return;
  const w = k.x1 - k.x0, h = k.y1 - k.y0;
  yapistir(S.owner, kes(S.shOwner, k.x0, k.y0, w, h), k.x0, k.y0, w, h);
  yapistir(S.region, kes(S.shRegion, k.x0, k.y0, w, h), k.x0, k.y0, w, h);
  yukleIste(k.x0, k.y0, k.x1, k.y1);
}

function uygula(g, geriYon) {
  if (g.tip === 'raster') {
    const o = geriYon ? g.oO : g.nO, r = geriYon ? g.oR : g.nR;
    if (o) { yapistir(S.owner, o, g.x0, g.y0, g.w, g.h); yapistir(S.shOwner, o, g.x0, g.y0, g.w, g.h); }
    if (r) { yapistir(S.region, r, g.x0, g.y0, g.w, g.h); yapistir(S.shRegion, r, g.x0, g.y0, g.w, g.h); }
    yukleIste(g.x0, g.y0, g.x0 + g.w, g.y0 + g.h);
    degisti(!!r);
  } else if (g.tip === 'cizim') {
    if (geriYon) S.cizimler.splice(S.cizimler.lastIndexOf(g.cizim), 1);
    else S.cizimler.push(g.cizim);
    degisti(false);
  } else if (g.tip === 'cizim-temizle') {
    S.cizimler = geriYon ? g.eski.slice() : [];
    degisti(false);
  }
  istek();
}
function geriAl() {
  if (eylem) return;
  const g = S.geri.pop();
  if (!g) return;
  uygula(g, true);
  S.ileri.push(g);
  dugmeDurumu();
}
function ileriAl() {
  if (eylem) return;
  const g = S.ileri.pop();
  if (!g) return;
  uygula(g, false);
  S.geri.push(g);
  dugmeDurumu();
}
function dugmeDurumu() {
  $('#b-geri').disabled = !S.geri.length;
  $('#b-ileri').disabled = !S.ileri.length;
}

let istatTimer = 0, kayitTimer = 0;
function degisti(regionDegisti) {
  if (regionDegisti) S.regionKirli = true;
  clearTimeout(istatTimer);
  istatTimer = setTimeout(istatistik, 120);
  clearTimeout(kayitTimer);
  kayitTimer = setTimeout(() => otomatikKaydet().catch((e) => console.warn('kaydedilemedi', e)), 900);
}

// ---------------------------------------------------------------- araçlar: doldur / fırça / seç
function doldur(p) {
  const x = Math.floor(p.x), y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i0 = y * W + x;
  const r0 = S.region[i0];
  if (r0 === 0) { bildir('Burası deniz — bir ülkenin içine tıkla.'); return; }
  const o0 = S.owner[i0];
  const hedef = S.secili;
  if (o0 === hedef) return;
  const O = S.owner, R = S.region;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  if (S.doldurMod === 'ulke') {
    for (let yy = 0; yy < H; yy++) {
      let satirda = false;
      for (let i = yy * W, e = i + W; i < e; i++) {
        if (R[i] === r0 && O[i] === o0) {
          O[i] = hedef;
          const xx = i - yy * W;
          if (xx < x0) x0 = xx;
          if (xx > x1) x1 = xx;
          satirda = true;
        }
      }
      if (satirda) { if (yy < y0) y0 = yy; y1 = yy; }
    }
  } else {
    const ic = S.icSinir;
    const k0 = anahtar(o0, r0, ic);
    const es = (i) => anahtar(O[i], R[i], ic) === k0;
    const yigin = [x, y];
    while (yigin.length) {
      const yy = yigin.pop(), xx = yigin.pop();
      const b = yy * W;
      if (!es(b + xx)) continue;
      let xl = xx, xr = xx;
      while (xl > 0 && es(b + xl - 1)) xl--;
      while (xr < W - 1 && es(b + xr + 1)) xr++;
      for (let X = xl; X <= xr; X++) O[b + X] = hedef;
      if (xl < x0) x0 = xl;
      if (xr > x1) x1 = xr;
      if (yy < y0) y0 = yy;
      if (yy > y1) y1 = yy;
      for (const ny of [yy - 1, yy + 1]) {
        if (ny < 0 || ny >= H) continue;
        const nb = ny * W;
        let X = xl;
        while (X <= xr) {
          if (es(nb + X)) {
            yigin.push(X, ny);
            while (X <= xr && es(nb + X)) X++;
          } else X++;
        }
      }
    }
  }
  if (x1 >= 0) kirlet(x0, y0, x1 + 1, y1 + 1);
}

function damga(cx, cy, r, hedef) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  if (x1 < x0 || y1 < y0) return;
  const r2 = r * r, O = S.owner, R = S.region, koru = S.korumali && hedef !== 0;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      if (dx * dx + dy * dy > r2) continue;
      const i = y * W + x;
      if (R[i] === 0) continue;
      const o = O[i];
      if (o === hedef || (koru && o !== 0)) continue;
      O[i] = hedef;
    }
  }
  kirlet(x0, y0, x1 + 1, y1 + 1);
}
function fircaCizgi(a, b, r, hedef) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const adim = Math.max(0.75, r * 0.35);
  const n = Math.max(1, Math.ceil(d / adim));
  for (let i = 1; i <= n; i++) damga(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n, r, hedef);
}

function damlalik(p) {
  const x = Math.floor(p.x), y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x;
  if (S.region[i] === 0) { bildir('Burası deniz.'); return; }
  const o = S.owner[i];
  ulkeSec(o);
  bildir(o ? `Seçildi: ${S.ulkeler[o].ad}` : 'Seçildi: Sahipsiz (boşaltma)', 1600);
}

// ---------------------------------------------------------------- araç: sınır çek
// İmlecin yakınındaki iki tarafı (ülke/bölge) bulur.
function taraflar(p, ic) {
  const x = Math.floor(p.x), y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  const R0 = Math.min(60, Math.max(2.5, (11 * S.dpr) / S.view.scale));
  const sayac = new Map();
  const xa = Math.max(0, Math.floor(p.x - R0)), xb = Math.min(W - 1, Math.ceil(p.x + R0));
  const ya = Math.max(0, Math.floor(p.y - R0)), yb = Math.min(H - 1, Math.ceil(p.y + R0));
  const R02 = R0 * R0;
  for (let yy = ya; yy <= yb; yy++) {
    const dy = yy + 0.5 - p.y;
    for (let xx = xa; xx <= xb; xx++) {
      const dx = xx + 0.5 - p.x;
      if (dx * dx + dy * dy > R02) continue;
      const i = yy * W + xx;
      const k = anahtar(S.owner[i], S.region[i], ic);
      if (k) sayac.set(k, (sayac.get(k) || 0) + 1);
    }
  }
  if (sayac.size < 2) return null;
  const sirali = [...sayac.entries()].sort((a, b) => b[1] - a[1]);
  const i0 = y * W + x;
  const k0 = S.region[i0] ? anahtar(S.owner[i0], S.region[i0], ic) : sirali[0][0];
  const k1 = sirali.find(([k]) => k !== k0);
  return k1 ? [k0, k1[0]] : null;
}

function sinirAdimEkle(p) {
  const e = eylem;
  const dx = p.x - e.son.x, dy = p.y - e.son.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.25) return;
  const adim = Math.max(0.5, e.R * 0.15);
  const n = Math.ceil(d / adim);
  for (let i = 0; i < n; i++) {
    const cx = e.son.x + (dx * i) / n, cy = e.son.y + (dy * i) / n;
    e.adim.push(cx, cy, dx / n, dy / n);
    e.k = birlesim(e.k, Math.floor(cx - e.R) - 1, Math.floor(cy - e.R) - 1, Math.ceil(cx + e.R) + 2, Math.ceil(cy + e.R) + 2);
  }
  e.son = { x: p.x, y: p.y };
  e.yeniden = true;
  istek();
}

// Sürüklemenin tamamını başlangıç anından (gölge kopyadan) yeniden hesaplar:
// her piksel tüm itme adımlarından geriye izlenir, tek seferde örneklenir → kayma birikmez.
function sinirHesapla() {
  const e = eylem, k = e.k;
  if (!k) return;
  const st = e.adim, n = st.length / 4;
  const R = e.R, R2 = R * R, ic = e.ic, P1 = e.taraf[0], P2 = e.taraf[1];
  const SO = S.shOwner, SR = S.shRegion, O = S.owner, RG = S.region;
  for (let y = k.y0; y < k.y1; y++) {
    for (let x = k.x0; x < k.x1; x++) {
      const gi = y * W + x;
      const so = SO[gi], sr = SR[gi];
      O[gi] = so;
      RG[gi] = sr;
      if (sr === 0) continue;
      const kt = anahtar(so, sr, ic);
      if (kt !== P1 && kt !== P2) continue;
      let px = x + 0.5, py = y + 0.5, oynadi = false;
      for (let j = n - 1; j >= 0; j--) {
        const cx = st[4 * j], cy = st[4 * j + 1];
        let ex = px - cx, ey = py - cy, d2 = ex * ex + ey * ey;
        if (d2 >= R2) continue;
        const ddx = st[4 * j + 2], ddy = st[4 * j + 3];
        let u = 1 - d2 / R2, w = u * u;
        ex = px - ddx * w - cx; ey = py - ddy * w - cy; d2 = ex * ex + ey * ey;
        u = d2 < R2 ? 1 - d2 / R2 : 0; w = u * u;
        px -= ddx * w; py -= ddy * w;
        oynadi = true;
      }
      if (!oynadi) continue;
      const ix = Math.floor(px), iy = Math.floor(py);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const si = iy * W + ix;
      const o2 = SO[si], r2 = SR[si];
      const ks = anahtar(o2, r2, ic);
      if (ks === kt || (ks !== P1 && ks !== P2)) continue;
      O[gi] = o2;
      RG[gi] = r2;
    }
  }
  kirlet(k.x0, k.y0, k.x1, k.y1);
}

// ---------------------------------------------------------------- işaretçi olayları
const isaretciler = new Map();
let jest = null, kaydir = null, eylem = null;

function eylemBasla(p) {
  switch (S.arac) {
    case 'doldur':
      doldur(p);
      isle();
      break;
    case 'damlalik':
      damlalik(p);
      break;
    case 'firca':
    case 'silgi': {
      const hedef = S.arac === 'silgi' ? 0 : S.secili;
      eylem = { tip: 'firca', son: p, hedef };
      damga(p.x, p.y, S.firca, hedef);
      break;
    }
    case 'sinir': {
      const t = taraflar(p, S.icSinir);
      if (!t) { bildir('Burada sınır yok — imleci iki ülke arasındaki çizginin tam üstüne getirip sürükle.'); return; }
      eylem = { tip: 'sinir', bas: { x: p.x, y: p.y }, son: { x: p.x, y: p.y }, taraf: t, ic: S.icSinir, R: S.etki, adim: [], k: null };
      break;
    }
    case 'kalem':
      eylem = { tip: 'kalem' };
      S.aktifCizim = { pts: [yuvarla(p.x), yuvarla(p.y)], renk: S.kalemRenk, kalin: S.kalemKalin };
      break;
  }
  istek();
}
const yuvarla = (v) => Math.round(v * 10) / 10;

function eylemHareket(p, ev) {
  const e = eylem;
  if (e.tip === 'firca') {
    const liste = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [];
    const noktalar = liste.length ? liste.map(noktaAl) : [p];
    for (const q of noktalar) { fircaCizgi(e.son, q, S.firca, e.hedef); e.son = q; }
  } else if (e.tip === 'sinir') {
    sinirAdimEkle(p);
  } else if (e.tip === 'kalem') {
    const pts = S.aktifCizim.pts;
    const lx = pts[pts.length - 2], ly = pts[pts.length - 1];
    if (Math.hypot(p.x - lx, p.y - ly) * S.view.scale >= 1.5 * S.dpr) pts.push(yuvarla(p.x), yuvarla(p.y));
  }
  istek();
}

function eylemBitir() {
  const e = eylem;
  eylem = null;
  if (!e) return;
  if (e.tip === 'firca') isle();
  else if (e.tip === 'sinir') {
    if (e.yeniden) sinirHesapla();
    if (!isle() && e.adim.length) bildir('Sınır kımıldamadı — çizgiyi tutup karşı ülkenin içine doğru sürükle.');
  } else if (e.tip === 'kalem') {
    const c = S.aktifCizim;
    S.aktifCizim = null;
    if (c) { S.cizimler.push(c); gecmiseEkle({ tip: 'cizim', cizim: c, bayt: c.pts.length * 8 }); degisti(false); }
  }
  istek();
}

function eylemIptal() {
  const e = eylem;
  eylem = null;
  if (!e) return;
  if (e.tip === 'firca' || e.tip === 'sinir') iptal();
  if (e.tip === 'kalem') S.aktifCizim = null;
  istek();
}

function jestBasla() {
  const [a, b] = [...isaretciler.values()];
  jest = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v0: { ...S.view } };
}
function jestHareket() {
  const [a, b] = [...isaretciler.values()];
  const r = ustC.getBoundingClientRect();
  const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const v0 = jest.v0;
  const ns = Math.min(Math.max(v0.scale * (d / jest.d0), S.minScale), 14);
  const m0x = (jest.m0.x - r.left) * S.dpr, m0y = (jest.m0.y - r.top) * S.dpr;
  const tx = (m0x - v0.ox) / v0.scale, ty = (m0y - v0.oy) / v0.scale;
  S.view.scale = ns;
  S.view.ox = (m.x - r.left) * S.dpr - tx * ns;
  S.view.oy = (m.y - r.top) * S.dpr - ty * ns;
  sinirla();
  istek();
}

function hoverGuncelle(p) {
  const x = Math.floor(p.x), y = Math.floor(p.y);
  const bilgi = $('#bilgi');
  let hb = 0;
  if (x < 0 || y < 0 || x >= W || y >= H) {
    bilgi.classList.remove('var');
  } else {
    const i = y * W + x, r = S.region[i], o = S.owner[i];
    if (r && (S.arac === 'doldur' || S.arac === 'damlalik')) hb = r;
    if (!r) bilgi.innerHTML = '<span class="soluk">Deniz</span>';
    else {
      const u = o ? S.ulkeler[o] : null;
      bilgi.innerHTML = u
        ? `<i style="background:${u.renk}"></i>${esc(u.ad)}<span class="soluk">· ${esc(S.bolgeler[r].ad)}</span>`
        : `${esc(S.bolgeler[r].ad)}<span class="soluk">· sahipsiz</span>`;
    }
    bilgi.classList.add('var');
  }
  if (S.arac === 'sinir') S.sinirHazir = !!taraflar(p, S.icSinir);
  if (hb !== S.hoverBolge) S.hoverBolge = hb;
  istek();
}

function olaylariBagla() {
  ustC.addEventListener('pointerdown', (e) => {
    ustC.setPointerCapture(e.pointerId);
    isaretciler.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (isaretciler.size === 2) {
      eylemIptal();
      kaydir = null;
      jestBasla();
      return;
    }
    if (isaretciler.size > 2) return;
    const p = noktaAl(e);
    S.imlec = { x: p.x, y: p.y };
    if (e.button === 1 || e.button === 2 || S.bosluk || S.arac === 'tasi') {
      kaydir = { x: e.clientX, y: e.clientY };
      ustC.classList.add('tutuyor');
      return;
    }
    if (e.button !== 0) return;
    if (e.altKey) { damlalik(p); return; }
    if (e.pointerType !== 'mouse') hoverGuncelle(p);
    eylemBasla(p);
  });

  ustC.addEventListener('pointermove', (e) => {
    if (isaretciler.has(e.pointerId)) isaretciler.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (jest) { if (isaretciler.size >= 2) jestHareket(); return; }
    const p = noktaAl(e);
    S.imlec = { x: p.x, y: p.y };
    if (kaydir) {
      S.view.ox += (e.clientX - kaydir.x) * S.dpr;
      S.view.oy += (e.clientY - kaydir.y) * S.dpr;
      kaydir = { x: e.clientX, y: e.clientY };
      sinirla();
      istek();
      return;
    }
    if (eylem) { eylemHareket(p, e); return; }
    if (e.pointerType === 'mouse') hoverGuncelle(p);
    else istek();
  });

  const birak = (e) => {
    isaretciler.delete(e.pointerId);
    if (jest) { if (isaretciler.size < 2) jest = null; return; }
    if (kaydir) { kaydir = null; ustC.classList.remove('tutuyor'); istek(); return; }
    if (e.type === 'pointercancel') { eylemIptal(); return; }
    if (eylem) eylemBitir();
  };
  ustC.addEventListener('pointerup', birak);
  ustC.addEventListener('pointercancel', birak);
  ustC.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !eylem && !kaydir) {
      S.imlec = null;
      S.hoverBolge = 0;
      $('#bilgi').classList.remove('var');
      istek();
    }
  });
  ustC.addEventListener('contextmenu', (e) => e.preventDefault());

  ustC.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = noktaAl(e);
    const fareTekeri = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || e.metaKey || fareTekeri) {
      const birim = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
      const f = Math.exp(-e.deltaY * birim * (e.ctrlKey ? 0.012 : 0.0022));
      yakinlas(f, p.dx, p.dy);
    } else {
      S.view.ox -= e.deltaX * S.dpr;
      S.view.oy -= e.deltaY * S.dpr;
      sinirla();
      istek();
    }
    S.imlec = { x: (p.dx - S.view.ox) / S.view.scale, y: (p.dy - S.view.oy) / S.view.scale };
  }, { passive: false });

  // Safari dokunmatik yüzey jestleri
  let gs = 1;
  document.addEventListener('gesturestart', (e) => { e.preventDefault(); gs = 1; });
  document.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    const r = ustC.getBoundingClientRect();
    yakinlas(e.scale / gs, (e.clientX - r.left) * S.dpr, (e.clientY - r.top) * S.dpr);
    gs = e.scale;
  });

  window.addEventListener('keydown', (e) => {
    const yaziyor = e.target.closest && e.target.closest('input, textarea, [contenteditable]');
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      if (yaziyor && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
      e.preventDefault();
      e.shiftKey ? ileriAl() : geriAl();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); ileriAl(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); dosyayaKaydet(); return; }
    if (yaziyor || mod) return;
    if (e.key === ' ') { e.preventDefault(); if (!S.bosluk) { S.bosluk = true; ustC.classList.add('c-tasi'); } return; }
    if (e.key === 'Escape') { eylemIptal(); panelKapat(); menuKapat(); return; }
    const kisa = { h: 'tasi', g: 'doldur', f: 'doldur', b: 'firca', s: 'sinir', e: 'silgi', p: 'kalem', i: 'damlalik' };
    const a = kisa[e.key.toLowerCase()];
    if (a) { aracSec(a); return; }
    if (e.key === '[') { S.firca = Math.max(2, Math.round(S.firca / 1.2)); aracAyarCiz(); istek(); ayarYaz(); }
    if (e.key === ']') { S.firca = Math.min(200, Math.round(S.firca * 1.2 + 1)); aracAyarCiz(); istek(); ayarYaz(); }
    if (e.key === '0') sigdir();
    if (e.key === '+' || e.key === '=') yakinlas(1.4, glC.width / 2, glC.height / 2);
    if (e.key === '-') yakinlas(1 / 1.4, glC.width / 2, glC.height / 2);
    if (/^[1-9]$/.test(e.key)) {
      const aktif = aktifUlkeler();
      const id = aktif[Number(e.key) - 1];
      if (id) ulkeSec(id);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ') { S.bosluk = false; ustC.classList.remove('c-tasi'); if (S.arac === 'tasi') ustC.classList.add('c-tasi'); }
  });

  new ResizeObserver(() => boyutla()).observe($('#sahne'));
}

// ---------------------------------------------------------------- arayüz
function aktifUlkeler() {
  const a = [];
  for (let i = 1; i < 256; i++) if (S.ulkeler[i] && S.ulkeler[i].aktif) a.push(i);
  return a;
}

function arayuzKur() {
  olaylariBagla();
  for (const b of document.querySelectorAll('[data-arac]')) b.addEventListener('click', () => aracSec(b.dataset.arac));
  $('#b-geri').addEventListener('click', geriAl);
  $('#b-ileri').addEventListener('click', ileriAl);
  $('#z-art').addEventListener('click', () => yakinlas(1.5, glC.width / 2, glC.height / 2));
  $('#z-azal').addEventListener('click', () => yakinlas(1 / 1.5, glC.width / 2, glC.height / 2));
  $('#z-sigdir').addEventListener('click', sigdir);
  $('#b-ulke-ekle').addEventListener('click', ulkeEkle);
  $('#b-panel').addEventListener('click', panelAc);
  $('#b-panel-kapat').addEventListener('click', panelKapat);
  $('#perde').addEventListener('click', panelKapat);
  $('#b-secili').addEventListener('click', () => {
    const li = $(`#ulke-liste li[data-id="${S.secili}"]`);
    if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  // dosya menüsü
  const menu = $('#m-dosya'), mb = $('#b-dosya');
  mb.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden ? menuAc() : menuKapat(); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) menuKapat(); });
  menu.addEventListener('click', (e) => {
    const k = e.target.closest('button')?.dataset.k;
    if (!k) return;
    menuKapat();
    if (k === 'kaydet') dosyayaKaydet();
    if (k === 'ac') $('#dosya-gir').click();
    if (k === 'png') pngIndir();
    if (k === 'sifirla') sifirla();
  });
  $('#dosya-gir').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) dosyadanAc(f);
  });

  // görünüm
  const gic = $('#g-ic'), gdz = $('#g-deniz'), gcz = $('#g-cizgi');
  gic.checked = S.icSinir;
  gdz.checked = S.deniz;
  gcz.value = S.cizgi;
  $('#g-cizgi-d').textContent = S.cizgi.toFixed(1) + '×';
  gic.addEventListener('change', () => { S.icSinir = gic.checked; ayarYaz(); istek(); });
  gdz.addEventListener('change', () => { S.deniz = gdz.checked; ayarYaz(); istek(); });
  gcz.addEventListener('input', () => { S.cizgi = Number(gcz.value); $('#g-cizgi-d').textContent = S.cizgi.toFixed(1) + '×'; ayarYaz(); istek(); });

  // ülke listesi
  const ul = $('#ulke-liste');
  ul.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const id = Number(li.dataset.id);
    if (e.target.closest('.sil')) { ulkeSil(id); return; }
    if (e.target.closest('input.ad')) { if (S.secili !== id) ulkeSec(id); return; }
    ulkeSec(id);
  });
  ul.addEventListener('input', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const id = Number(li.dataset.id), u = S.ulkeler[id];
    if (!u) return;
    if (e.target.type === 'color') {
      u.renk = e.target.value;
      e.target.parentElement.style.setProperty('--c', u.renk);
      paletGuncelle();
      seciliGoster();
      hizliCiz();
      degisti(false);
    } else if (e.target.classList.contains('ad')) {
      u.ad = e.target.value;
      hizliCiz();
      degisti(false);
    }
  });
  ul.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('ad')) e.target.blur(); });
  ul.addEventListener('focusout', (e) => {
    if (!e.target.classList.contains('ad')) return;
    const id = Number(e.target.closest('li').dataset.id);
    if (!e.target.value.trim()) { S.ulkeler[id].ad = 'Adsız ülke'; e.target.value = 'Adsız ülke'; hizliCiz(); }
  });
  $('#hizli').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('ekle')) { ulkeEkle(); return; }
    ulkeSec(Number(b.dataset.id));
  });

  aracSec(S.arac, true);
  listeCiz();
  dugmeDurumu();
}

function menuAc() { $('#m-dosya').hidden = false; $('#b-dosya').setAttribute('aria-expanded', 'true'); }
function menuKapat() { $('#m-dosya').hidden = true; $('#b-dosya').setAttribute('aria-expanded', 'false'); }
function panelAc() { $('#panel').classList.add('acik'); $('#perde').hidden = false; }
function panelKapat() { $('#panel').classList.remove('acik'); $('#perde').hidden = true; }

function aracSec(a, sessiz) {
  if (eylem) eylemIptal();
  S.arac = a;
  for (const b of document.querySelectorAll('[data-arac]')) b.classList.toggle('aktif', b.dataset.arac === a);
  ustC.classList.toggle('c-tasi', a === 'tasi');
  ustC.classList.toggle('c-damlalik', a === 'damlalik');
  if (a !== 'doldur' && a !== 'damlalik') S.hoverBolge = 0;
  S.sinirHazir = false;
  aracAyarCiz();
  if (!sessiz) ayarYaz();
  istek();
}

function aracAyarCiz() {
  const a = S.arac, bilgi = ARACLAR[a];
  const k = $('#arac-ayar');
  let h = `<div class="arac-bas"><b>${bilgi.ad}</b></div><p class="arac-ipucu">${bilgi.ipucu}</p>`;
  if (a === 'doldur') {
    h += `<div class="bolumlu" data-ayar="doldurMod">
        <button data-v="ulke" class="${S.doldurMod === 'ulke' ? 'aktif' : ''}">Tüm ülke</button>
        <button data-v="alan" class="${S.doldurMod === 'alan' ? 'aktif' : ''}">Bağlı alan</button>
      </div>
      <p>${S.doldurMod === 'ulke' ? 'Tıkladığın ülkenin adaları dahil tamamı boyanır.' : 'Sadece çizgilerle çevrili, tıkladığın parça boyanır (Paint kovası gibi).'}</p>`;
  } else if (a === 'firca' || a === 'silgi') {
    h += `<label class="kaydirac"><span>Fırça boyu <output>${S.firca}</output></span>
        <input type="range" min="2" max="200" step="1" value="${S.firca}" data-ayar="firca"></label>`;
    if (a === 'firca') h += `<label class="satir-secim"><input type="checkbox" data-ayar="korumali" ${S.korumali ? 'checked' : ''}><span>Başka ülkelerin toprağına taşma (sadece boş araziyi boya)</span></label>`;
  } else if (a === 'sinir') {
    h += `<label class="kaydirac"><span>Etki alanı <output>${S.etki}</output></span>
        <input type="range" min="15" max="700" step="5" value="${S.etki}" data-ayar="etki"></label>
        <p>Küçük alan: keskin, dar bir çıkıntı. Büyük alan: geniş bir bölgeyi tek hamlede kaydırır. Daha ileri gitmek için aynı yerden tekrar sürükle.</p>`;
  } else if (a === 'kalem') {
    h += `<div class="kalem-renkler">${KALEM_RENK.map((r) => `<button data-kalem="${r}" class="${r === S.kalemRenk ? 'aktif' : ''}" style="background:${r}" aria-label="Kalem rengi ${r}"></button>`).join('')}</div>
      <label class="kaydirac"><span>Kalınlık <output>${S.kalemKalin}</output></span>
        <input type="range" min="1" max="40" step="1" value="${S.kalemKalin}" data-ayar="kalemKalin"></label>
      <button class="dugme tam tehlike-kenar" id="b-cizim-temizle" ${S.cizimler.length ? '' : 'disabled'}>Tüm kalem çizimlerini sil</button>`;
  }
  k.innerHTML = h;
  for (const r of k.querySelectorAll('input[type=range][data-ayar]')) {
    r.addEventListener('input', () => {
      S[r.dataset.ayar] = Number(r.value);
      r.closest('label').querySelector('output').textContent = r.value;
      ayarYaz();
      istek();
    });
  }
  for (const c of k.querySelectorAll('input[type=checkbox][data-ayar]')) c.addEventListener('change', () => { S[c.dataset.ayar] = c.checked; ayarYaz(); });
  const bol = k.querySelector('.bolumlu');
  if (bol) bol.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S[bol.dataset.ayar] = b.dataset.v;
    ayarYaz();
    aracAyarCiz();
  });
  for (const b of k.querySelectorAll('[data-kalem]')) b.addEventListener('click', () => { S.kalemRenk = b.dataset.kalem; ayarYaz(); aracAyarCiz(); });
  const tm = k.querySelector('#b-cizim-temizle');
  if (tm) tm.addEventListener('click', () => {
    if (!S.cizimler.length) return;
    const eski = S.cizimler.slice();
    S.cizimler = [];
    gecmiseEkle({ tip: 'cizim-temizle', eski, bayt: 64 });
    degisti(false);
    aracAyarCiz();
    istek();
    bildir('Kalem çizimleri silindi (⌘Z ile geri alabilirsin).');
  });
}

function paletGuncelle() {
  cizici.paletYukle(S.ulkeler.map((u) => (u ? u.renk : null)));
  istek();
}

function ulkeSec(id) {
  if (id !== 0 && !(S.ulkeler[id] && S.ulkeler[id].aktif)) return;
  S.secili = id;
  for (const li of document.querySelectorAll('#ulke-liste li')) li.classList.toggle('secili', Number(li.dataset.id) === id);
  seciliGoster();
  hizliCiz();
  ayarYaz();
}

function seciliGoster() {
  const i = $('#b-secili i');
  const u = S.secili ? S.ulkeler[S.secili] : null;
  i.className = u ? '' : 'bos';
  i.style.background = u ? u.renk : '';
  $('#b-secili').title = 'Seçili: ' + (u ? u.ad : 'Sahipsiz (boşaltma)');
  document.documentElement.style.setProperty('--vurgu', u ? u.renk : '#757067');
}

function listeCiz() {
  const ul = $('#ulke-liste');
  let h = `<li class="ulke${S.secili === 0 ? ' secili' : ''}" data-id="0"><span class="renk bos"></span><span class="ad-sabit">Sahipsiz (boşalt)</span><span class="alan"></span><span></span></li>`;
  for (const id of aktifUlkeler()) {
    const u = S.ulkeler[id];
    h += `<li class="ulke${S.secili === id ? ' secili' : ''}" data-id="${id}">
      <label class="renk" style="--c:${u.renk}"><input type="color" value="${u.renk}" aria-label="${esc(u.ad)} rengi"></label>
      <input class="ad" value="${esc(u.ad)}" aria-label="Ülke adı" spellcheck="false">
      <span class="alan" data-alan="${id}"></span>
      <button class="sil" title="Ülkeyi sil" aria-label="${esc(u.ad)} ülkesini sil">×</button>
    </li>`;
  }
  ul.innerHTML = h;
  alanlariYaz();
  seciliGoster();
  hizliCiz();
}

function hizliCiz() {
  const d = $('#hizli');
  let h = `<button data-id="0" class="${S.secili === 0 ? 'secili' : ''}"><i class="bos"></i>Sahipsiz</button>`;
  for (const id of aktifUlkeler()) {
    const u = S.ulkeler[id];
    h += `<button data-id="${id}" class="${S.secili === id ? 'secili' : ''}"><i style="--c:${u.renk}"></i>${esc(u.ad)}</button>`;
  }
  h += '<button class="ekle" aria-label="Ülke ekle">+ Ekle</button>';
  d.innerHTML = h;
  const s = d.querySelector('.secili');
  if (s && d.offsetParent) {
    const l = s.offsetLeft, r = l + s.offsetWidth;
    if (l < d.scrollLeft || r > d.scrollLeft + d.clientWidth) d.scrollLeft = l - 8;
  }
}

function alanlariYaz() {
  for (const el of document.querySelectorAll('[data-alan]')) {
    const id = Number(el.dataset.alan), a = S.alan[id];
    el.innerHTML = a > 0 ? `${alanYazi(a)}<br>%${((a / S.karaToplam) * 100).toLocaleString('tr-TR', { maximumFractionDigits: a / S.karaToplam < 0.01 ? 2 : 1 })}` : '';
  }
  const top = S.alan.reduce((t, v, i) => (i ? t + v : t), 0);
  $('#kara-toplam').textContent = `Dünya karası (Antarktika hariç) ≈ ${alanYazi(S.karaToplam)} · paylaşılan: %${((top / S.karaToplam) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
}

function istatistik() {
  const alan = new Float64Array(256), O = S.owner, ra = S.rowArea;
  for (let y = 0; y < H; y++) {
    const a = ra[y];
    for (let i = y * W, e = i + W; i < e; i++) { const o = O[i]; if (o) alan[o] += a; }
  }
  S.alan = alan;
  let yeniden = false;
  for (let i = 1; i < 256; i++) {
    if (alan[i] > 0) {
      if (!S.ulkeler[i]) { S.ulkeler[i] = { ad: 'Ülke ' + i, renk: YEDEK_RENK[i % YEDEK_RENK.length], aktif: true }; yeniden = true; paletGuncelle(); }
      else if (!S.ulkeler[i].aktif) { S.ulkeler[i].aktif = true; yeniden = true; }
    }
  }
  if (yeniden) listeCiz();
  else alanlariYaz();
}

function ulkeEkle() {
  let id = 0;
  for (let i = 1; i < 256; i++) if (!S.ulkeler[i]) { id = i; break; }
  if (!id) for (let i = 1; i < 256; i++) if (!S.ulkeler[i].aktif && !(S.alan[i] > 0)) { id = i; break; }
  if (!id) { bildir('En fazla 255 ülke olabilir.'); return; }
  const kullanilan = new Set(aktifUlkeler().map((i) => S.ulkeler[i].renk.toLowerCase()));
  let renk = YEDEK_RENK.find((r) => !kullanilan.has(r));
  if (!renk) renk = d3.hsl(Math.random() * 360, 0.55 + Math.random() * 0.3, 0.38 + Math.random() * 0.25).formatHex();
  const say = aktifUlkeler().length + 1;
  S.ulkeler[id] = { ad: 'Yeni ülke ' + say, renk, aktif: true };
  S.secili = id;
  paletGuncelle();
  listeCiz();
  degisti(false);
  const inp = $(`#ulke-liste li[data-id="${id}"] input.ad`);
  if (inp) {
    inp.scrollIntoView({ block: 'nearest' });
    if (matchMedia('(min-width: 861px)').matches) { inp.focus(); inp.select(); }
  }
  bildir('Yeni ülke eklendi. Adını ve rengini listeden değiştirebilirsin.');
}

function ulkeSil(id) {
  const u = S.ulkeler[id];
  if (!u) return;
  const varToprak = S.alan[id] > 0;
  if (!confirm(`"${u.ad}" silinsin mi?${varToprak ? '\nToprakları sahipsiz kalır (geri al ile dönebilirsin).' : ''}`)) return;
  if (varToprak) {
    const O = S.owner;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let i = y * W, e = i + W; i < e; i++) {
        if (O[i] === id) {
          O[i] = 0;
          const x = i - y * W;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          y1 = y;
        }
      }
    }
    if (x1 >= 0) { kirlet(x0, y0, x1 + 1, y1 + 1); isle(); }
    S.alan[id] = 0;
  }
  u.aktif = false;
  if (S.secili === id) S.secili = aktifUlkeler()[0] || 0;
  listeCiz();
  degisti(false);
}

// ---------------------------------------------------------------- ayarlar (tarayıcıda)
const AYAR_ANAHTAR = 'diplomasi-harita-ayar-v1';
const AYAR_ALAN = ['arac', 'firca', 'korumali', 'doldurMod', 'etki', 'kalemRenk', 'kalemKalin', 'icSinir', 'deniz', 'cizgi', 'secili'];
function ayarOku() {
  try {
    const a = JSON.parse(localStorage.getItem(AYAR_ANAHTAR) || '{}');
    for (const k of AYAR_ALAN) if (k in a) S[k] = a[k];
    if (!ARACLAR[S.arac]) S.arac = 'doldur';
  } catch (e) { /* yoksay */ }
}
function ayarYaz() {
  try {
    const a = {};
    for (const k of AYAR_ALAN) a[k] = S[k];
    localStorage.setItem(AYAR_ANAHTAR, JSON.stringify(a));
  } catch (e) { /* yoksay */ }
}

// ---------------------------------------------------------------- kayıt: sıkıştırma + IndexedDB + dosya
async function sikistir(u8) {
  const s = new Blob([u8]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function ac(u8) {
  const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
function b64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64Coz(s) {
  const b = atob(s), u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}
function regionTemizMi() {
  const a = S.region, b = S.baseRegion;
  for (let i = 0; i < N; i++) if (a[i] !== b[i]) return false;
  return true;
}

let regionGzOnbellek = null;
async function paketle() {
  const ownerGz = await sikistir(S.owner);
  if (S.regionKirli || regionGzOnbellek === undefined) {
    regionGzOnbellek = regionTemizMi() ? null : await sikistir(new Uint8Array(S.region.buffer, S.region.byteOffset, S.region.byteLength));
    S.regionKirli = false;
  }
  return {
    tur: 'diplomasi-harita', v: 1, W, H, kayit: new Date().toISOString(),
    ulkeler: S.ulkeler, cizimler: S.cizimler, ownerGz, regionGz: regionGzOnbellek,
  };
}
async function paketAc(p) {
  if (!p || p.tur !== 'diplomasi-harita' || p.W !== W || p.H !== H) throw new Error('Bu dosya bu haritaya ait değil.');
  const owner = await ac(p.ownerGz);
  if (owner.length !== N) throw new Error('Toprak verisi bozuk.');
  let region = S.baseRegion.slice();
  if (p.regionGz) {
    const rb = await ac(p.regionGz);
    if (rb.length !== N * 2) throw new Error('Sınır verisi bozuk.');
    region = new Uint16Array(rb.buffer, rb.byteOffset, N).slice();
  }
  const ulkeler = new Array(256).fill(null);
  (p.ulkeler || []).forEach((u, i) => { if (u && i > 0 && i < 256) ulkeler[i] = { ad: String(u.ad || 'Ülke ' + i), renk: /^#[0-9a-f]{6}$/i.test(u.renk) ? u.renk : '#999999', aktif: u.aktif !== false }; });
  S.owner = owner;
  S.region = region;
  S.ulkeler = ulkeler;
  S.cizimler = Array.isArray(p.cizimler) ? p.cizimler.filter((c) => c && Array.isArray(c.pts) && c.pts.length >= 2) : [];
  regionGzOnbellek = p.regionGz || null;
  S.regionKirli = false;
  if (!(S.secili === 0 || (ulkeler[S.secili] && ulkeler[S.secili].aktif))) S.secili = aktifUlkeler()[0] || 0;
}

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('diplomasi-harita', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('durum');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbYaz(k, v) {
  const db = await idb();
  await new Promise((res, rej) => {
    const tx = db.transaction('durum', 'readwrite');
    tx.objectStore('durum').put(v, k);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}
async function idbOku(k) {
  const db = await idb();
  const v = await new Promise((res, rej) => {
    const r = db.transaction('durum').objectStore('durum').get(k);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  db.close();
  return v;
}

let kaydediliyor = false, tekrarKaydet = false;
async function otomatikKaydet() {
  if (kaydediliyor) { tekrarKaydet = true; return; }
  kaydediliyor = true;
  try {
    await idbYaz('son', await paketle());
  } finally {
    kaydediliyor = false;
    if (tekrarKaydet) { tekrarKaydet = false; otomatikKaydet(); }
  }
}
async function otomatikYukle() {
  const p = await idbOku('son');
  if (p) await paketAc(p);
}

function tarihEki() {
  const d = new Date(), z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`;
}
function indir(blob, ad) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ad;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function dosyayaKaydet() {
  const p = await paketle();
  const j = { ...p, ownerGz: b64(p.ownerGz), regionGz: p.regionGz ? b64(p.regionGz) : null };
  indir(new Blob([JSON.stringify(j)], { type: 'application/json' }), `harita-${tarihEki()}.json`);
  bildir('Harita dosyaya kaydedildi.');
}

async function dosyadanAc(f) {
  try {
    const j = JSON.parse(await f.text());
    j.ownerGz = b64Coz(j.ownerGz);
    j.regionGz = j.regionGz ? b64Coz(j.regionGz) : null;
    if (eylem) eylemIptal();
    await paketAc(j);
    S.shOwner = S.owner.slice();
    S.shRegion = S.region.slice();
    S.geri = [];
    S.ileri = [];
    cizici.yukleHepsi(S.owner, S.region);
    paletGuncelle();
    istatistik();
    listeCiz();
    dugmeDurumu();
    aracAyarCiz();
    istek();
    await otomatikKaydet();
    bildir(`"${f.name}" açıldı.`);
  } catch (e) {
    console.error(e);
    bildir('Dosya açılamadı: ' + (e.message || e), 4000);
  }
}

function sifirla() {
  if (!confirm('Tüm boyamalar, kaydırılan sınırlar ve kalem çizimleri silinip boş haritaya dönülsün mü?\n(Geri al ile dönebilirsin.)')) return;
  if (eylem) eylemIptal();
  S.owner.fill(0);
  S.region.set(S.baseRegion);
  kirlet(0, 0, W, H);
  isle();
  if (S.cizimler.length) {
    const eski = S.cizimler.slice();
    S.cizimler = [];
    gecmiseEkle({ tip: 'cizim-temizle', eski, bayt: 64 });
  }
  degisti(true);
  aracAyarCiz();
  istek();
  bildir('Boş haritaya dönüldü.');
}

async function pngIndir() {
  bildir('PNG hazırlanıyor…', 8000);
  await new Promise((r) => setTimeout(r, 30));
  const ew = 4096;
  const img = cizici.disaAktar(ew, cizimAyari({ hover: 0, cizgi: S.cizgi * 1.7, bg: '#ffffff' }));
  istek();
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const c = cv.getContext('2d');
  c.putImageData(img, 0, 0);
  const k = ew / W;
  c.setTransform(k, 0, 0, k, 0, 0);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const st of S.cizimler) cizgiCiz(c, st);
  cv.toBlob((b) => { indir(b, `harita-${tarihEki()}.png`); bildir('PNG indirildi.'); }, 'image/png');
}

// ---------------------------------------------------------------- çalıştır (tüm tanımlardan sonra)
basla().catch((e) => {
  console.error(e);
  $('#yukleniyor').textContent = 'Harita açılamadı: ' + (e && e.message ? e.message : e);
});
