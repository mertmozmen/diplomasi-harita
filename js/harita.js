// Dünya rasterı — Miller projeksiyonu, 84°K ile ~57,8°G arası (2:1), Antarktika hariç.
// Her piksel bir "bölge"ye (bugünkü ülke) aittir; 0 = deniz.

export const W = 4096;
export const H = 2048;

const D2R = Math.PI / 180;
const LAT_UST = 84;

function millerRaw(l, p) {
  return [l, 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * p))];
}
millerRaw.invert = (x, y) => [x, 2.5 * Math.atan(Math.exp(0.8 * y)) - 0.625 * Math.PI];

const K = W / (2 * Math.PI);
const Y_UST = millerRaw(0, LAT_UST * D2R)[1];

export function projeksiyon() {
  return d3
    .geoProjection(millerRaw)
    .scale(K)
    .translate([W / 2, K * Y_UST])
    .clipExtent([[0, 0], [W, H]])
    .precision(0.25);
}

// Piksel (x,y) → [boylam, enlem] derece
export function enlemBoylam(x, y) {
  const [l, p] = millerRaw.invert((x - W / 2) / K, Y_UST - y / K);
  return [l / D2R, p / D2R];
}

// Her satırdaki bir pikselin km² karşılığı
export function satirAlanlari() {
  const R = 6371.0088;
  const dl = (2 * Math.PI) / W;
  const a = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    const p1 = millerRaw.invert(0, Y_UST - y / K)[1];
    const p2 = millerRaw.invert(0, Y_UST - (y + 1) / K)[1];
    a[y] = R * R * dl * (Math.sin(p1) - Math.sin(p2));
  }
  return a;
}

// TopoJSON → bölge rasterı (kenar yumuşatmasız tarama çizgisi dolgusu, çift-tek kuralı)
export function bolgeRasteri(topo, isimler) {
  const nesne = topo.objects[Object.keys(topo.objects)[0]];
  const ozellikler = topojson.feature(topo, nesne).features;
  const proj = projeksiyon();
  const region = new Uint16Array(W * H);
  const bolgeler = [null];

  let halkalar = null;
  let cur = null;
  const ctx = {
    moveTo(x, y) { cur = [x, y]; halkalar.push(cur); },
    lineTo(x, y) { cur.push(x, y); },
    closePath() {},
    arc() {},
    rect() {},
  };
  const yol = d3.geoPath(proj, ctx);

  for (const f of ozellikler) {
    if (f.id === 'ATA') continue;
    const id = bolgeler.length;
    bolgeler.push({ id, iso: f.id, ad: (isimler && isimler[f.id]) || f.properties.name });
    halkalar = [];
    yol(f);
    const n = taraDoldur(halkalar, id, region);
    if (n === 0) {
      // Pikselden küçük ada ülkeler (Malta, Singapur…) en az bir piksel alsın
      const c = proj(d3.geoCentroid(f));
      if (c) {
        const x = Math.floor(c[0]);
        const y = Math.floor(c[1]);
        if (x >= 0 && y >= 0 && x < W && y < H && region[y * W + x] === 0) region[y * W + x] = id;
      }
    }
  }
  return { region, bolgeler };
}

function taraDoldur(halkalar, id, out) {
  const ex0 = [], ey0 = [], ex1 = [], ey1 = [];
  let minY = Infinity, maxY = -Infinity;
  for (const r of halkalar) {
    const n = r.length / 2;
    if (n < 3) continue;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      let x0 = r[2 * i], y0 = r[2 * i + 1], x1 = r[2 * j], y1 = r[2 * j + 1];
      if (y0 === y1) continue;
      if (y0 > y1) { let t = x0; x0 = x1; x1 = t; t = y0; y0 = y1; y1 = t; }
      ex0.push(x0); ey0.push(y0); ex1.push(x1); ey1.push(y1);
      if (y0 < minY) minY = y0;
      if (y1 > maxY) maxY = y1;
    }
  }
  const m = ex0.length;
  if (!m) return 0;
  const sira = Array.from({ length: m }, (_, i) => i).sort((a, b) => ey0[a] - ey0[b]);
  const bas = Math.max(0, Math.ceil(minY - 0.5));
  const son = Math.min(H - 1, Math.floor(maxY - 0.5));
  let aktif = [];
  let k = 0;
  let say = 0;
  const xs = [];
  for (let y = bas; y <= son; y++) {
    const yc = y + 0.5;
    while (k < m && ey0[sira[k]] <= yc) aktif.push(sira[k++]);
    let j = 0;
    xs.length = 0;
    for (let a = 0; a < aktif.length; a++) {
      const e = aktif[a];
      if (ey1[e] > yc) {
        aktif[j++] = e;
        xs.push(ex0[e] + ((yc - ey0[e]) * (ex1[e] - ex0[e])) / (ey1[e] - ey0[e]));
      }
    }
    aktif.length = j;
    xs.sort((a, b) => a - b);
    const taban = y * W;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      let xa = Math.ceil(xs[i] - 0.5);
      let xb = Math.floor(xs[i + 1] - 0.5);
      if (xa < 0) xa = 0;
      if (xb > W - 1) xb = W - 1;
      for (let x = xa; x <= xb; x++) { out[taban + x] = id; say++; }
    }
  }
  return say;
}
