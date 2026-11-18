/*
  ThoughtLeap.ai hero stage.
  The arrow-and-dot mark as an object: zaratsu bevels, a 42-ray sunburst on an ink face, brushed flanks,
  one enamel cabochon in ThoughtLeap vermilion. Geometry, materials and studio light are carried over
  from the ThoughtLeap Studios landing stage (Reed's recipe, 2026-10-15) so the family reads as one.
  This copy has no chapters: one home view, the key light follows the hand, a press sends the jewel
  over the tip, and the renderer rests whenever the first screen is off the page.
*/
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const arch = (u) => 0.5 - 0.5 * Math.cos(2 * Math.PI * clamp(u));

const root = document.documentElement;
const stage = document.getElementById('stage');
const hero = document.getElementById('top');
const readX = document.getElementById('lx');
const readY = document.getElementById('ly');
const meterNeedle = document.getElementById('meter-needle');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglOK() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; }
}
if (!webglOK() || !stage) {
  root.classList.add('nogl');
} else {
  try { start(); } catch (err) { console.error(err); root.classList.add('nogl'); }
}

function start() {
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false });
const phoneStart = innerWidth < 760;
const dprMax = Math.min(window.devicePixelRatio || 1, 2);
let dpr = phoneStart ? Math.min(1.5, dprMax) : dprMax;
renderer.setPixelRatio(dpr);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.setClearColor(0x0b0d10, 1);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d10);
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
const rig = new THREE.Group();
scene.add(rig);

const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const pmremSetSize = pmrem._setSize;
pmrem._setSize = function () { pmremSetSize.call(this, 512); };

/* Mark geometry, from the logomark's own points. */
const pts = [[227.15, 261.48], [59.98, 177.44], [485.96, 27.51], [293.95, 436.25]];
const k = 1 / 100, ox = 250, oy = 250;
const poly = pts.map(([x, y]) => new THREE.Vector2((x - ox) * k, -(y - oy) * k));
const Z_TOP = 0.22, Z_BOTTOM = -0.05, BEVEL_INSET = 0.15, BEVEL_DROP = 0.10;
const Z_BEVEL = Z_TOP - BEVEL_DROP;
const FACE_Z = Z_TOP;
const UVB = { minX: -2.2, maxX: 2.6, minY: -2.2, maxY: 2.6 };

function polygonArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const u = p[i], v = p[(i + 1) % p.length]; a += u.x * v.y - v.x * u.y; }
  return a * 0.5;
}
function insetPolygon(p, dist) {
  const n = p.length, inward = polygonArea(p) > 0 ? 1 : -1, lines = [];
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    lines.push({ px: a.x + (-dy / len) * inward * dist, py: a.y + (dx / len) * inward * dist, dx, dy });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const L = lines[(i + n - 1) % n], M = lines[i];
    const den = L.dx * M.dy - L.dy * M.dx;
    const t = ((M.px - L.px) * M.dy - (M.py - L.py) * M.dx) / den;
    out.push(new THREE.Vector2(L.px + L.dx * t, L.py + L.dy * t));
  }
  return out;
}
const facePoly = insetPolygon(poly, BEVEL_INSET);

function makeDialNormal(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  const cx = (0.168 - UVB.minX) / (UVB.maxX - UVB.minX), cy = (0.243 - UVB.minY) / (UVB.maxY - UVB.minY);
  const freq = 42;
  for (let j = 0; j < size; j++) {
    const v = (j + 0.5) / size;
    for (let i = 0; i < size; i++) {
      const u = (i + 0.5) / size, x = u - cx, y = v - cy;
      const r = Math.hypot(x, y) + 1e-5, th = Math.atan2(y, x);
      const amp = clamp((r - 0.045) / 0.09) * Math.exp(-r * 1.35);
      let gx = Math.cos(freq * th) * freq * (-y / (r * r)) * amp * 0.22 + Math.cos(r * 78) * 78 * (x / r) * 0.28 * amp * 0.15;
      let gy = Math.cos(freq * th) * freq * (x / (r * r)) * amp * 0.22 + Math.cos(r * 78) * 78 * (y / r) * 0.28 * amp * 0.15;
      const glen = Math.hypot(gx, gy);
      if (glen > 0.42) { gx *= 0.42 / glen; gy *= 0.42 / glen; }
      const l = Math.hypot(gx, gy, 1), p = (j * size + i) * 4;
      d[p] = (-gx / l * 0.5 + 0.5) * 255; d[p + 1] = (-gy / l * 0.5 + 0.5) * 255; d[p + 2] = (1 / l * 0.5 + 0.5) * 255; d[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

const faceMat = new THREE.MeshPhysicalMaterial({
  color: 0x0b0d10, metalness: 1, roughness: 0.22, envMapIntensity: 1.55, specularIntensity: 1,
  normalMap: makeDialNormal(phoneStart ? 768 : 1024), normalScale: new THREE.Vector2(1.25, 1.25),
});
const bevelMat = new THREE.MeshPhysicalMaterial({ color: 0xe7edf2, metalness: 1, roughness: 0.018, envMapIntensity: 1.9, specularIntensity: 1 });
bevelMat.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vBevelUv;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBevelUv = uv;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vBevelUv;')
    .replace('#include <opaque_fragment>', `{
  float across = clamp(vBevelUv.y, 0.0, 1.0);
  float fall = pow(clamp(1.0 - across, 0.0, 1.0), 1.35);
  vec3 col = outgoingLight;
  float peak = max(col.r, max(col.g, col.b));
  float over = max(peak - 0.48, 0.0);
  float curved = 0.48 + over / (1.0 + over * 2.2);
  if (peak > 1e-4) col *= curved / peak;
  outgoingLight = col * fall;
}
#include <opaque_fragment>`);
};
const wallMat = new THREE.MeshPhysicalMaterial({ color: 0x9aa3ab, metalness: 1, roughness: 0.38, anisotropy: 1, anisotropyRotation: 0, envMapIntensity: 0.95 });

function uvOf(x, y) { return [(x - UVB.minX) / (UVB.maxX - UVB.minX), (y - UVB.minY) / (UVB.maxY - UVB.minY)]; }
function triNormal(a, b, c) {
  const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
  const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
  const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}
function pushTri(pos, nor, uvs, a, b, c, ua, ub, uc) {
  const n = triNormal(a, b, c);
  const list = ua ? [[a, ua], [b, ub], [c, uc]] : [[a, uvOf(a[0], a[1])], [b, uvOf(b[0], b[1])], [c, uvOf(c[0], c[1])]];
  for (const [p, uv] of list) { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); uvs.push(uv[0], uv[1]); }
}
function geoFrom(pos, nor, uvs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}
function shapeTris(p, z) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(p));
  const src = g.attributes.position, index = g.index, n = index ? index.count : src.count, tris = [];
  for (let i = 0; i < n; i += 3) {
    const ia = index ? index.getX(i) : i, ib = index ? index.getX(i + 1) : i + 1, ic = index ? index.getX(i + 2) : i + 2;
    tris.push([[src.getX(ia), src.getY(ia), z], [src.getX(ib), src.getY(ib), z], [src.getX(ic), src.getY(ic), z]]);
  }
  g.dispose();
  return tris;
}

const facePos = [], faceNor = [], faceUv = [];
for (const [a, b, c] of shapeTris(facePoly, Z_TOP)) {
  if (triNormal(a, b, c)[2] < 0) pushTri(facePos, faceNor, faceUv, a, c, b); else pushTri(facePos, faceNor, faceUv, a, b, c);
}
const bevPos = [], bevNor = [], bevUv = [], wallPos = [], wallNor = [], wallUv = [];
let pcx = 0, pcy = 0;
for (const p of poly) { pcx += p.x; pcy += p.y; }
pcx /= poly.length; pcy /= poly.length;
for (let i = 0; i < poly.length; i++) {
  const j = (i + 1) % poly.length;
  const iA = [facePoly[i].x, facePoly[i].y, Z_TOP], iB = [facePoly[j].x, facePoly[j].y, Z_TOP];
  const oA = [poly[i].x, poly[i].y, Z_BEVEL], oB = [poly[j].x, poly[j].y, Z_BEVEL];
  const L = Math.hypot(poly[j].x - poly[i].x, poly[j].y - poly[i].y);
  if (triNormal(iA, oA, oB)[2] < 0) {
    pushTri(bevPos, bevNor, bevUv, iA, oB, oA, [0, 1], [L, 0], [0, 0]);
    pushTri(bevPos, bevNor, bevUv, iA, iB, oB, [0, 1], [L, 1], [L, 0]);
  } else {
    pushTri(bevPos, bevNor, bevUv, iA, oA, oB, [0, 1], [0, 0], [L, 0]);
    pushTri(bevPos, bevNor, bevUv, iA, oB, iB, [0, 1], [L, 0], [L, 1]);
  }
  const wA = [poly[i].x, poly[i].y, Z_BOTTOM], wB = [poly[j].x, poly[j].y, Z_BOTTOM];
  const mx = (poly[i].x + poly[j].x) * 0.5, my = (poly[i].y + poly[j].y) * 0.5;
  const wn = triNormal(oA, wA, wB);
  if (wn[0] * (mx - pcx) + wn[1] * (my - pcy) < 0) {
    pushTri(wallPos, wallNor, wallUv, oA, wB, wA, [0, 1], [L, 0], [0, 0]);
    pushTri(wallPos, wallNor, wallUv, oA, oB, wB, [0, 1], [L, 1], [L, 0]);
  } else {
    pushTri(wallPos, wallNor, wallUv, oA, wA, wB, [0, 1], [0, 0], [L, 0]);
    pushTri(wallPos, wallNor, wallUv, oA, wB, oB, [0, 1], [L, 0], [L, 1]);
  }
}
for (const [a, b, c] of shapeTris(poly, Z_BOTTOM)) {
  if (triNormal(a, b, c)[2] > 0) pushTri(wallPos, wallNor, wallUv, a, c, b); else pushTri(wallPos, wallNor, wallUv, a, b, c);
}
const arrow = new THREE.Mesh(geoFrom(facePos, faceNor, faceUv), faceMat);
const bevelMesh = new THREE.Mesh(geoFrom(bevPos, bevNor, bevUv), bevelMat);
const wallMesh = new THREE.Mesh(geoFrom(wallPos, wallNor, wallUv), wallMat);
arrow.add(bevelMesh, wallMesh);
rig.add(arrow);

/* Hairline arcs engraved on the face: the path of the glide. */
function inPolyDist(x, y) {
  let c = false, dist = 1e9;
  for (let i = 0; i < facePoly.length; i++) {
    const a = facePoly[i], b = facePoly[(i + 1) % facePoly.length], dx = b.x - a.x, dy = b.y - a.y;
    if ((a.y > y) !== (b.y > y) && x < dx * (y - a.y) / (dy || 1e-8) + a.x) c = !c;
    const u = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy));
    dist = Math.min(dist, Math.hypot(x - a.x - u * dx, y - a.y - u * dy));
  }
  return c ? dist : -1;
}
const ARC_C = new THREE.Vector2(1.05, 0.30);
function makeArc(radius) {
  const A0 = 215 * Math.PI / 180, A1 = 54 * Math.PI / 180, steps = 180;
  const pos = [], next = [], side = [], along = [], fade = [], idx = [], z = FACE_Z + 0.004, P = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, th = A0 + (A1 - A0) * t;
    const x = ARC_C.x + Math.cos(th) * radius, y = ARC_C.y + Math.sin(th) * radius;
    const d = inPolyDist(x, y);
    P.push({ x, y, t, f: d < 0 ? 0 : clamp((d - 0.08) / 0.22) });
  }
  for (let i = 0; i <= steps; i++) {
    const p = P[i], n = P[Math.min(steps, i + 1)];
    for (const s of [-1, 1]) { pos.push(p.x, p.y, z); next.push(n.x, n.y, z); side.push(s); along.push(p.t); fade.push(p.f); }
    if (i < steps) { const v = i * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aNext', new THREE.Float32BufferAttribute(next, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  g.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
  g.setIndex(idx);
  return g;
}
function arcMaterial(strength) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, toneMapped: true,
    uniforms: { uProg: { value: 0 }, uWidth: { value: 1.2 }, uRes: { value: new THREE.Vector2(1, 1) }, uStrength: { value: strength } },
    vertexShader: `
      attribute vec3 aNext; attribute float aSide; attribute float aAlong; attribute float aFade;
      uniform float uWidth; uniform vec2 uRes;
      varying float vSide; varying float vAlong; varying float vFade;
      void main() {
        vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec4 nxp = projectionMatrix * modelViewMatrix * vec4(aNext, 1.0);
        vec2 dir = nxp.xy / nxp.w - c.xy / c.w;
        float len = length(dir);
        dir = len < 1e-6 ? vec2(1.0, 0.0) : dir / len;
        c.xy += vec2(-dir.y, dir.x) * aSide * (uWidth * 2.0 / uRes) * c.w;
        vSide = aSide; vAlong = aAlong; vFade = aFade;
        gl_Position = c;
      }`,
    fragmentShader: `
      precision highp float;
      uniform float uProg; uniform float uStrength;
      varying float vSide; varying float vAlong; varying float vFade;
      void main() {
        float fw = max(fwidth(vSide), 0.02);
        float aa = 1.0 - smoothstep(1.0 - fw, 1.0 + fw, abs(vSide));
        float reveal = 1.0 - smoothstep(uProg - 0.01, uProg + 0.012, vAlong);
        float lip = smoothstep(-0.15, 0.9, vSide);
        gl_FragColor = vec4(mix(vec3(0.015, 0.016, 0.018), vec3(0.78, 0.80, 0.82), lip), aa * reveal * vFade * uStrength);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
const arcA = new THREE.Mesh(makeArc(1.10), arcMaterial(0.92));
const arcB = new THREE.Mesh(makeArc(1.20), arcMaterial(0.42));
arcA.renderOrder = arcB.renderOrder = 2;
arrow.add(arcA, arcB);

const dotHome = new THREE.Vector3((93.56 - ox) * k, -(392.97 - oy) * k, 0.02);
const TIP = new THREE.Vector3((485.96 - ox) * k, -(27.51 - oy) * k, 0);
const R = 79.53 * k;

function makeCabochon(radius) {
  const thetaMax = 1.05, sphereR = radius / Math.sin(thetaMax), seg = 96, rows = 40;
  const pos = [], nor = [], uvs = [], idx = [], zBase = Math.cos(thetaMax) * sphereR;
  for (let y = 0; y <= rows; y++) {
    const t = (y / rows) * thetaMax, rad = Math.sin(t) * sphereR, z = Math.cos(t) * sphereR - zBase;
    for (let x = 0; x <= seg; x++) {
      const a = (x / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * rad, Math.sin(a) * rad, z);
      nor.push(Math.cos(a) * Math.sin(t), Math.sin(a) * Math.sin(t), Math.cos(t));
      uvs.push(x / seg, y / rows);
    }
  }
  const stride = seg + 1;
  for (let y = 0; y < rows; y++) for (let x = 0; x < seg; x++) {
    const i = y * stride + x;
    idx.push(i, i + stride, i + 1, i + 1, i + stride, i + stride + 1);
  }
  const center = pos.length / 3;
  pos.push(0, 0, 0); nor.push(0, 0, -1); uvs.push(0.5, 1);
  const rim = pos.length / 3;
  for (let x = 0; x < seg; x++) {
    const a = (x / seg) * Math.PI * 2;
    pos.push(Math.cos(a) * radius, Math.sin(a) * radius, 0); nor.push(0, 0, -1); uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  for (let x = 0; x < seg; x++) idx.push(center, rim + (x + 1) % seg, rim + x);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
/* The jewel: ThoughtLeap's own vermilion, #E8542B (Reed, 2026-10-15: the parent brand keeps it). */
const dotMat = new THREE.MeshPhysicalMaterial({
  color: 0xe8542b, metalness: 0, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.5,
  specularIntensity: 0, envMapIntensity: 1,
});
const dot = new THREE.Mesh(makeCabochon(R), dotMat);
dot.rotation.x = 0.14;
rig.add(dot);

const contactMat = new THREE.MeshBasicMaterial({
  transparent: true, depthWrite: false, opacity: 0.7, toneMapped: false,
  map: (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const o = c.getContext('2d'), g = o.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0, 'rgba(0,0,0,0.72)'); g.addColorStop(0.4, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    o.fillStyle = g; o.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })(),
});
const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), contactMat);
contact.rotation.x = -Math.PI / 2;
contact.position.set(0.15, -2.15, 0.05);
contact.scale.set(5.2, 2.4, 1);
rig.add(contact);

/* Studio light: key, rim, and the strip that follows the hand. */
const studio = new THREE.Group();
scene.add(studio);
const key = new THREE.DirectionalLight(0xfff4ea, 2.2);
const rim = new THREE.DirectionalLight(0xe7edf2, 0.7);
rim.position.set(-7.4, 5.2, -4.2);
studio.add(key, key.target, rim);
RectAreaLightUniformsLib.init();
const strip = new THREE.RectAreaLight(0xfff7f0, 46, 8.4, 0.38);
studio.add(strip);
scene.add(new THREE.AmbientLight(0x0a0c0e, 0.05));

/* One home view. On a laptop the object sits right of the words with its tip near the edge; on a phone it sits above them. */
let phone = false;
const camHome = new THREE.Vector3(), lookHome = new THREE.Vector3();
function layout() {
  phone = innerWidth < 760;
  if (phone) {
    rig.position.set(0.02, 2.05, 0); rig.scale.setScalar(0.46);
    camHome.set(0, 0.15, 12.2); lookHome.set(0.02, 1.2, 0);
  } else {
    rig.position.set(3.15, 0.02, 0); rig.scale.setScalar(1);
    camHome.set(0, 0.18, 13.6); lookHome.set(0.35, 0.02, 0);
  }
}
const _tip = new THREE.Vector3();
function fitDesktopTip() {
  if (phone) return;
  rig.rotation.set(0.07 + 0.34 * 0.2, -0.16 + 0.46 * 0.28, 0);
  camera.position.copy(camHome); camera.lookAt(lookHome); camera.updateMatrixWorld(); rig.updateMatrixWorld(true);
  const worldPerPx = (2 * Math.tan(camera.fov * Math.PI / 360) * (camera.position.z - 0.5) * camera.aspect) / innerWidth;
  const edge = innerWidth - Math.max(64, innerWidth * 0.075);
  for (let i = 0; i < 8; i++) {
    _tip.copy(TIP); arrow.localToWorld(_tip); _tip.project(camera);
    const err = (_tip.x * 0.5 + 0.5) * innerWidth - edge;
    if (Math.abs(err) < 0.6) break;
    rig.position.x -= err * worldPerPx; rig.updateMatrixWorld(true);
  }
}
const drawBuf = new THREE.Vector2();
let lastW = 0, lastH = 0;
function resize(force) {
  const w = innerWidth, h = innerHeight;
  if (!force && w === lastW && Math.abs(h - lastH) < 140) return;
  lastW = w; lastH = h;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, true);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  layout(); fitDesktopTip();
  renderer.getDrawingBufferSize(drawBuf);
  const half = 0.5 * (phone ? 1.15 : 1.25) * renderer.getPixelRatio();
  for (const a of [arcA, arcB]) a.material.uniforms.uRes.value.copy(drawBuf);
  arcA.material.uniforms.uWidth.value = half; arcB.material.uniforms.uWidth.value = half * 0.85;
}
addEventListener('resize', () => resize(false));
resize(true);

/* Input: the key light follows the cursor; a press sends the jewel over the tip. */
const light = [0.46, 0.34], lightTarget = [0.46, 0.34];
let tracking = false;
addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  tracking = true;
  lightTarget[0] = e.clientX / innerWidth * 2 - 1;
  lightTarget[1] = 1 - e.clientY / innerHeight * 2;
}, { passive: true });
let leapStart = -1;
function triggerLeap() {
  const now = performance.now();
  if (leapStart >= 0 && now - leapStart < 3300) return;
  leapStart = now;
}
function heroOnScreen() { const r = hero.getBoundingClientRect(); return r.bottom > 0; }
addEventListener('pointerdown', (e) => {
  if (e.target.closest && e.target.closest('a, button, details, input, textarea')) return;
  if (!heroOnScreen()) return;
  triggerLeap();
}, { passive: true });
function liveLeap(now) {
  if (leapStart < 0) return { u: 0, dip: 0, arc: 0 };
  const e = (now - leapStart) / 1000;
  if (e < 2.6) { const u = e / 2.6; let a = clamp(u / 0.58); a = a * a * (3 - 2 * a); return { u, dip: 0, arc: a }; }
  if (e < 3.2) { const s = (e - 2.6) / 0.6; return { u: 1, dip: Math.sin(Math.PI * Math.pow(s, 0.7)) * (1 - s), arc: 1 }; }
  return { u: 1, dip: 0, arc: 1 };
}
const dirx = TIP.x - dotHome.x, diry = TIP.y - dotHome.y, dirL = Math.hypot(dirx, diry);
const perpX = -diry / dirL * 0.2, perpY = dirx / dirL * 0.2;
const _leap = new THREE.Vector3();
function leapPosition(u, dip) {
  const s = arch(u);
  return _leap.set(
    dotHome.x + (TIP.x + 0.04 - dotHome.x) * s + perpX * s,
    dotHome.y + (TIP.y + 0.16 - dotHome.y) * s + perpY * s - dip * 0.045,
    dotHome.z + 1.08 * s,
  );
}

/* Arrival: the jewel descends into its seat under a damped glide. Uniform scale, no overshoot (Reed's lock). */
const DROP_H = 2.4, DROP_DELAY = 0.3, DROP_TAU = 0.32;
function dropState(t) {
  if (reduced) return { y: 0 };
  const e = Math.max(0, t - DROP_DELAY);
  return { y: DROP_H * Math.exp(-e / DROP_TAU) * (1 + e / DROP_TAU) };
}

let t0 = null, last = null, ladderMs = 0, ladderAcc = 0, ladderN = 0, ready = false;
const shown = { lx: '', ly: '', meter: -1 };

function frame(now) {
  requestAnimationFrame(frame);
  if (!ready) return;
  if (!heroOnScreen()) { last = null; return; }
  if (t0 == null) t0 = now;
  const dt = last == null ? 16.7 : Math.min(48, now - last);
  last = now;
  const t = (now - t0) / 1000;

  // Quality ladder: drop pixel ratio if frames run long.
  ladderAcc += dt; ladderMs += dt; ladderN++;
  if (ladderMs > 2000) {
    const avg = ladderAcc / ladderN;
    ladderAcc = ladderMs = ladderN = 0;
    if (avg > 19 && dpr > 1.05) { dpr = Math.max(1, dpr - 0.25); resize(true); }
  }

  // Light: cursor, or a slow drift.
  const ease = 1 - Math.exp(-dt / 150);
  if (tracking) { light[0] = lerp(light[0], lightTarget[0], ease); light[1] = lerp(light[1], lightTarget[1], ease); }
  else if (!reduced) {
    light[0] = lerp(light[0], 0.46 + Math.sin(now * 0.00018) * 0.07, ease * 0.35);
    light[1] = lerp(light[1], 0.32 + Math.cos(now * 0.00014) * 0.05, ease * 0.35);
  }
  const lx = light[0], ly = light[1];

  const live = liveLeap(now);
  if (leapStart >= 0 && now - leapStart > 3200) leapStart = -1;
  const uLeap = live.u, dip = live.dip, arc = live.arc;

  const idleAmp = reduced ? 0 : 1;
  rig.rotation.y = -0.16 + Math.sin(t * 0.22) * 0.16 * idleAmp + lx * 0.28;
  rig.rotation.x = 0.07 + Math.sin(t * 0.17 + 0.6) * 0.03 * idleAmp + ly * 0.2;
  rig.rotation.z = uLeap > 0 && uLeap < 1 ? arch(uLeap) * 0.03 : 0;
  arrow.position.y = Math.sin(t * 0.22) * 0.012 * idleAmp;

  const drop = dropState(t);
  const p = leapPosition(uLeap, dip);
  dot.position.set(p.x, p.y + drop.y, p.z);
  dot.rotation.z = t * 0.18 * idleAmp;
  contactMat.opacity = 0.7 * (1 - clamp(drop.y / DROP_H) * 0.8);

  arcA.material.uniforms.uProg.value = arc;
  arcB.material.uniforms.uProg.value = arc < 0.035 ? 0 : arc - 0.035;

  studio.position.copy(rig.position);
  studio.scale.copy(rig.scale);
  key.position.set(lx * 8.2, 4.8 + ly * 6.2, 6.4);
  strip.position.set(lx * 6.8, 3.4 + ly * 4.6, 4.15);
  studio.updateMatrixWorld(true);
  strip.lookAt(studio.position);
  rig.updateMatrixWorld(true);

  camera.position.copy(camHome);
  camera.lookAt(lookHome);
  camera.updateMatrixWorld();
  renderer.render(scene, camera);

  // Instrument: the key light readout.
  if (readX && readY) {
    const sx = Math.abs(lx).toFixed(2) + (lx >= 0 ? ' R' : ' L'), sy = Math.abs(ly).toFixed(2) + (ly >= 0 ? ' UP' : ' DN');
    if (sx !== shown.lx) { shown.lx = sx; readX.textContent = sx; }
    if (sy !== shown.ly) { shown.ly = sy; readY.textContent = sy; }
  }
  if (meterNeedle) {
    const m = clamp(lx * 0.5 + 0.5);
    if (Math.abs(m - shown.meter) > 0.002) { shown.meter = m; meterNeedle.style.setProperty('--m', m.toFixed(4)); }
  }
}

/* Studio environment, baked once: the HDRI room plus softbox strips. */
function stripTexture() {
  const w = 1024, h = 256, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const vy = ((y + 0.5) / h) * 2 - 1, fy = Math.exp(-vy * vy * 6.5);
    for (let x = 0; x < w; x++) {
      const vx = ((x + 0.5) / w) * 2 - 1, p = (y * w + x) * 4;
      d[p] = d[p + 1] = d[p + 2] = 255; d[p + 3] = Math.round(fy * Math.exp(-Math.pow(Math.abs(vx), 2.2) * 2.4) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const stripTex = stripTexture();
function softbox(s, w, h, x, y, z, color) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, map: stripTex, transparent: true, depthWrite: false, toneMapped: false }));
  m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
}
function dispose(s) { s.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
function bake(hdr) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x010102);
  if (hdr) {
    hdr.mapping = THREE.UVMapping;
    s.add(new THREE.Mesh(new THREE.SphereGeometry(42, 48, 32), new THREE.MeshBasicMaterial({ map: hdr, side: THREE.BackSide, color: new THREE.Color(0.14, 0.145, 0.155) })));
  }
  softbox(s, 18, 1.35, 0.2, 7.2, 6.4, new THREE.Color(96, 97, 100));
  softbox(s, 14, 1.05, 5.4, 3.6, 6.8, new THREE.Color(28, 29, 31));
  softbox(s, 13, 1.15, -4.8, 4.4, 6.2, new THREE.Color(9, 9.4, 10));
  softbox(s, 11, 3.2, 1.2, -3.4, -6.8, new THREE.Color(2.4, 2.5, 2.7));
  scene.environment = pmrem.fromScene(s, 0, 0.1, 90).texture;
  dispose(s);
  const e = new THREE.Scene();
  e.background = new THREE.Color(0x120702);
  e.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.045, 0.014, 0.005), side: THREE.BackSide })));
  softbox(e, 22, 0.2, -0.8, 5.2, 4.4, new THREE.Color(70, 66, 60));
  softbox(e, 1.15, 1.15, 2.6, 7.6, 2.2, new THREE.Color(110, 104, 96));
  dotMat.envMap = pmrem.fromScene(e, 0, 0.1, 80).texture;
  dotMat.needsUpdate = true;
  dispose(e);
  ready = true;
  root.classList.add('webgl');
}

fetch(new URL('../assets/studio.hdr', import.meta.url)).then((res) => {
  if (!res.ok) throw new Error('hdr ' + res.status);
  return res.arrayBuffer();
}).then((buf) => {
  const loader = new RGBELoader();
  loader.setDataType(THREE.HalfFloatType);
  const r = loader.parse(buf);
  const tex = new THREE.DataTexture(r.data, r.width, r.height, THREE.RGBAFormat, r.type);
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = true;
  tex.needsUpdate = true;
  bake(tex);
}).catch(() => bake(null));

requestAnimationFrame(frame);
}
