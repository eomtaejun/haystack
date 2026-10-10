import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import './style.css';

type Menu = 'start' | 'pause' | 'win' | null;
type Cell = { x: number; z: number; total: number; remaining: number; tone: number };
type Save = { seed: number; remaining: number[]; needleIndex: number; needleDepth: number; needleFound: boolean; removed: number; elapsed: number; won: boolean };

const STORAGE = 'haystack-game-v3';
const PILE_Z = -42;
const PILE_RADIUS = 27.75;
const GRID_STEP = 1.4;
const GRID_LIMIT = 20;
const STRAWS = 180;
const DIG_DEPTH = .01;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas id="game" aria-label="HAYSTACK 3D 게임 화면"></canvas><div class="vignette"></div>
  <div class="hud" id="hud">
    <div class="topbar"><div class="brand">HAYSTACK<small>건초더미에서 바늘 찾기</small></div><div class="stats"><div class="chip">수색 <b id="progress">0.0%</b></div><div class="chip">제거 <b id="removed">0</b></div></div></div>
    <div id="crosshair" class="crosshair"></div><div id="prompt" class="prompt"></div><div id="toast" class="toast"></div>
    <div class="bottom"><div class="strand-hint">좌클릭 한 번에 건초 한 가닥</div><div class="help"><kbd>WASD</kbd> 이동 &nbsp; <kbd>마우스</kbd> 시점 &nbsp; <kbd>좌클릭</kbd> 한 가닥 제거<br><kbd>E</kbd> 바늘 줍기 &nbsp; <kbd>Esc</kbd> 일시정지</div></div>
  </div><div id="modal" class="modal-scrim"></div>`;

const $ = (id: string) => document.getElementById(id)!;
const renderer = new THREE.WebGLRenderer({ canvas: $('game') as HTMLCanvasElement, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9dc7d7);
scene.fog = new THREE.FogExp2(0xb9cfc0, .012);
const camera = new THREE.PerspectiveCamera(73, innerWidth / innerHeight, .05, 180);
camera.rotation.order = 'YXZ';
camera.position.set(0, 1.7, 5);
scene.add(camera);
const hemi = new THREE.HemisphereLight(0xd8edff, 0x635638, 1.35); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffdc98, 3.5);
sun.position.set(-31, 33, -17); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -65; sun.shadow.camera.right = 65;
sun.shadow.camera.top = 65; sun.shadow.camera.bottom = -65; sun.shadow.camera.near = 1; sun.shadow.camera.far = 150;
sun.shadow.bias = -.0004; scene.add(sun);
const sunOrb = new THREE.Mesh(new THREE.SphereGeometry(3, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffe4a4 }));
sunOrb.position.set(-35, 32, -50); scene.add(sunOrb);
const sky = new THREE.Mesh(new THREE.SphereGeometry(92, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vPos; void main(){vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: 'varying vec3 vPos; void main(){float h=clamp(normalize(vPos).y*.5+.5,0.0,1.0); vec3 low=vec3(.78,.84,.73); vec3 high=vec3(.30,.57,.76); gl_FragColor=vec4(mix(low,high,smoothstep(.12,.9,h)),1.0);}'
}));
scene.add(sky);

const mat = (color: number, roughness = 1, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
function makeTexture(kind: 'grass' | 'hay' | 'dirt') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const palette = kind === 'hay' ? [198, 155, 82] : kind === 'grass' ? [96, 130, 68] : [160, 140, 103];
  const image = ctx.createImageData(512, 512);
  let state = kind === 'hay' ? 17348 : kind === 'grass' ? 49851 : 9361;
  const rand = () => { state = (Math.imul(state, 1664525) + 1013904223) | 0; return (state >>> 0) / 4294967296; };
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (rand() - .5) * (kind === 'hay' ? 47 : 31);
    image.data[i] = palette[0] + n; image.data[i + 1] = palette[1] + n * .88; image.data[i + 2] = palette[2] + n * .55; image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const strokes = kind === 'hay' ? 8500 : kind === 'grass' ? 6000 : 3400;
  for (let i = 0; i < strokes; i++) {
    const x = rand() * 512, y = rand() * 512, length = kind === 'hay' ? 9 + rand() * 20 : 2 + rand() * 7;
    ctx.strokeStyle = kind === 'hay' ? (rand() < .55 ? 'rgba(255,230,153,.53)' : 'rgba(93,68,29,.38)') : kind === 'grass' ? (rand() < .5 ? 'rgba(197,180,94,.26)' : 'rgba(35,78,32,.35)') : 'rgba(89,70,50,.24)';
    const angle = kind === 'hay' ? rand() * Math.PI * 2 : (rand() - .5) * .42;
    ctx.lineWidth = .6 + rand() * 1.1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return texture;
}
const grassTexture = makeTexture('grass'); grassTexture.repeat.set(90, 90);
const groundMat = new THREE.MeshStandardMaterial({ map: grassTexture, roughness: 1 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), groundMat);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

function meshBox(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
}
function makeTree(x: number, z: number, scale = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.15 * scale, .3 * scale, 3.1 * scale, 9), mat(0x66503b));
  trunk.position.y = 1.55 * scale; trunk.castShadow = true; g.add(trunk);
  for (let i = 0; i < 8; i++) {
    const a = i * 2.399, ring = i < 5 ? .73 : .38;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry((.78 + (i % 3) * .14) * scale, 1), mat([0x496f3e, 0x62884c, 0x779550, 0x557d47][i % 4]));
    crown.position.set(Math.cos(a) * ring * scale, (3.15 + (i % 3) * .43) * scale, Math.sin(a) * ring * scale);
    crown.castShadow = true; g.add(crown);
  }
}
function makeFence() {
  const wood = mat(0x9d7950);
  for (let x = -54; x <= 54; x += 3.6) for (const z of [-96, 20]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.18, 1.55, .18), wood); post.position.set(x, .78, z); post.castShadow = true; scene.add(post);
  }
  for (let z = -94; z <= 20; z += 3.6) for (const x of [-54, 54]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.18, 1.55, .18), wood); post.position.set(x, .78, z); post.castShadow = true; scene.add(post);
  }
  for (const z of [-96, 20]) for (const y of [.55, 1.15]) meshBox(scene, 108, .13, .1, 0x9d7950, 0, y, z);
  for (const x of [-54, 54]) for (const y of [.55, 1.15]) meshBox(scene, .1, .13, 116, 0x9d7950, x, y, -38);
}
function makeBuilding() {
  const barn = new THREE.Group(); barn.position.set(-42, 0, -78); scene.add(barn);
  meshBox(barn, 9.5, 5, 7.5, 0x8c4738, 0, 2.5, 0);
  const gableShape = new THREE.Shape(); gableShape.moveTo(-4.75, 5); gableShape.lineTo(0, 7.05); gableShape.lineTo(4.75, 5); gableShape.closePath();
  const gableGeometry = new THREE.ShapeGeometry(gableShape);
  for (const z of [-3.78, 3.78]) {
    const gable = new THREE.Mesh(gableGeometry, new THREE.MeshStandardMaterial({ color: 0x8c4738, side: THREE.DoubleSide, roughness: 1 }));
    gable.position.z = z; gable.castShadow = true; barn.add(gable);
  }
  for (let x = -4.65; x <= 4.7; x += .54) {
    meshBox(barn, .035, 5, .045, x % 1 > .5 ? 0xad6148 : 0x753c31, x, 2.5, 3.78, false);
    meshBox(barn, .035, 5, .045, 0x69392f, x, 2.5, -3.78, false);
  }
  const slope = Math.atan2(2.25, 5.25), roofLength = Math.hypot(5.25, 2.25);
  for (const side of [-1, 1]) {
    const roof = meshBox(barn, roofLength, .19, 8.4, 0x434b48, side * 2.55, 5.93, 0);
    roof.rotation.z = -side * slope;
    for (let i = 0; i < 7; i++) {
      const trim = meshBox(barn, roofLength, .035, .055, 0x59615a, side * 2.55, 6.05, -3.7 + i * 1.24, false);
      trim.rotation.z = -side * slope;
    }
  }
  meshBox(barn, 10.5, .17, .15, 0x303b3a, 0, 7.08, 0);
  meshBox(barn, 3.7, 3.8, .11, 0x4f332a, 0, 1.9, 3.84);
  for (const dx of [-1.72, 1.72]) meshBox(barn, .11, 3.75, .13, 0xd2aa77, dx, 1.9, 3.94);
  meshBox(barn, 3.6, .11, .13, 0xd2aa77, 0, 3.63, 3.94);
  meshBox(barn, 3.6, .11, .13, 0xd2aa77, 0, .23, 3.94);
  for (const side of [-1, 1]) {
    const brace = meshBox(barn, .1, 4.8, .15, 0xd2aa77, side * .84, 1.9, 3.96);
    brace.rotation.z = side * .75;
  }
  meshBox(barn, 1.5, 1.38, .12, 0xe6cf9d, -3.35, 3.18, 3.84);
  meshBox(barn, .08, 1.45, .15, 0x765746, -3.35, 3.18, 3.94);
  meshBox(barn, 1.6, .08, .15, 0x765746, -3.35, 3.18, 3.94);
}
makeFence(); makeBuilding();
for (const [x, z, s] of [[-49, -69, 1], [46, -78, 1.15], [-46, 7, .9], [46, 10, 1.05], [-13, -88, .8], [13, -88, .85]] as const) makeTree(x, z, s);
const dirtTexture = makeTexture('dirt'); dirtTexture.repeat.set(1, 7);
const path = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 20), new THREE.MeshStandardMaterial({ map: dirtTexture, roughness: 1 })); path.rotation.x = -Math.PI / 2; path.position.set(0, .012, 1); scene.add(path);
const grassBlades = new THREE.InstancedMesh(new THREE.ConeGeometry(.017, .2, 3), new THREE.MeshStandardMaterial({ color: 0xa7b580, side: THREE.DoubleSide, roughness: 1 }), 7600);
grassBlades.instanceMatrix.setUsage(THREE.StaticDrawUsage); scene.add(grassBlades);
const grassDummy = new THREE.Object3D(); let grassCount = 0, grassSeed = 713128;
const grassRand = () => { grassSeed = (Math.imul(grassSeed, 1664525) + 1013904223) | 0; return (grassSeed >>> 0) / 4294967296; };
for (let tries = 0; tries < 12500 && grassCount < 7600; tries++) {
  const x = (grassRand() - .5) * 104, z = (grassRand() - .5) * 112 - 38;
  if (Math.hypot(x, z - PILE_Z) < PILE_RADIUS + 1 || (Math.abs(x) < 2.5 && z > -16) || (Math.abs(x + 42) < 5.5 && Math.abs(z + 78) < 5)) continue;
  grassDummy.position.set(x, .055, z); grassDummy.rotation.set(0, grassRand() * Math.PI * 2, (grassRand() - .5) * .45);
  const size = .48 + grassRand() * .9; grassDummy.scale.set(size, size, size); grassDummy.updateMatrix();
  grassBlades.setMatrixAt(grassCount, grassDummy.matrix);
  grassBlades.setColorAt(grassCount, new THREE.Color().setHSL(.2 + grassRand() * .07, .26 + grassRand() * .14, .43 + grassRand() * .17));
  grassCount++;
}
grassBlades.count = grassCount; grassBlades.instanceColor!.needsUpdate = true;

function randomFromSeed(seed: number) { let a = seed >>> 0; return () => { a += 0x6d2b79f5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const saved = (() => { try { const raw = localStorage.getItem(STORAGE); return raw ? JSON.parse(raw) as Save : null; } catch { return null; } })();
const seed = saved?.seed ?? Math.floor(Math.random() * 0xffffffff);
const rng = randomFromSeed(seed);
const cells: Cell[] = [];
const grid = new Int32Array((GRID_LIMIT * 2 + 1) ** 2).fill(-1);
const gridIndex = (ix: number, iz: number) => (ix + GRID_LIMIT) * (GRID_LIMIT * 2 + 1) + iz + GRID_LIMIT;
function edgeRadius(angle: number) {
  return PILE_RADIUS * (.955 + .025 * Math.sin(angle * 3 + .45) + .015 * Math.sin(angle * 7 - 1.2) + .005 * Math.sin(angle * 13 + .9));
}
function terrainNoise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const smoothX = fx * fx * (3 - 2 * fx), smoothZ = fz * fz * (3 - 2 * fz);
  const sample = (gx: number, gz: number) => {
    let n = Math.imul(gx + 219, 374761393) + Math.imul(gz - 137, 668265263);
    n = Math.imul(n ^ n >>> 13, 1274126177);
    return ((n ^ n >>> 16) >>> 0) / 4294967296;
  };
  const a = THREE.MathUtils.lerp(sample(ix, iz), sample(ix + 1, iz), smoothX);
  const b = THREE.MathUtils.lerp(sample(ix, iz + 1), sample(ix + 1, iz + 1), smoothX);
  return THREE.MathUtils.lerp(a, b, smoothZ);
}
function oldHayHeight(x: number, z: number) {
  const r2 = (x * x + (z - PILE_Z) ** 2) / (PILE_RADIUS * PILE_RADIUS);
  if (r2 >= 1) return 0;
  const dome = Math.pow(1 - r2, 1.12);
  return Math.max(0, 15.75 * dome + (Math.sin(x * .34) * Math.cos(z * .31) + Math.sin(x * .2 + z * .27)) * .26 * dome);
}
function baseHayHeight(x: number, z: number) {
  const dz = z - PILE_Z, radius = edgeRadius(Math.atan2(dz, x));
  const r2 = (x * x + dz * dz) / (radius * radius);
  if (r2 >= 1) return 0;
  const dome = Math.pow(1 - r2, .91);
  const lobes = (4.8 * Math.exp(-((x + 7) ** 2 + (dz + 3) ** 2) / 85)
    + 3.2 * Math.exp(-((x - 9) ** 2 + (dz - 2) ** 2) / 78)
    - 1.4 * Math.exp(-((x - 1) ** 2 + (dz + 1) ** 2) / 55)) * Math.pow(dome, .55);
  const coarse = (terrainNoise(x * .13, z * .13) - .5) * 3.1;
  const medium = (terrainNoise(x * .39 + 8, z * .39 - 4) - .5) * 1.15;
  const fine = (terrainNoise(x * 1.05 - 2, z * 1.05 + 11) - .5) * .23;
  return Math.max(0, 13.4 * dome + lobes + (coarse + medium + fine) * Math.pow(dome, .55));
}
for (let ix = -GRID_LIMIT; ix <= GRID_LIMIT; ix++) for (let iz = -GRID_LIMIT; iz <= GRID_LIMIT; iz++) {
  const gridX = ix * GRID_STEP, gridZ = PILE_Z + iz * GRID_STEP;
  const oldHeight = oldHayHeight(gridX, gridZ);
  if (oldHeight < .08) continue;
  const x = gridX + (rng() - .5) * .72, z = gridZ + (rng() - .5) * .72;
  const total = Math.max(1, Math.ceil(oldHeight / DIG_DEPTH));
  grid[gridIndex(ix, iz)] = cells.length;
  cells.push({ x, z, total, remaining: total, tone: rng() });
}
if (saved?.remaining?.length === cells.length) cells.forEach((c, i) => { c.remaining = Math.max(0, Math.min(c.total, Math.floor(saved.remaining[i]))); });
const HAY_TOTAL = cells.reduce((sum, c) => sum + c.total, 0);
const needleCandidates = cells.map((c, i) => ({ c, i })).filter(({ c }) => Math.abs(c.x) < 3 && c.z > PILE_Z + 10 && c.z < PILE_Z + 16);
let needleIndex = saved?.needleIndex != null && cells[saved.needleIndex] ? saved.needleIndex : needleCandidates[Math.floor(rng() * needleCandidates.length)].i;
const needleDepth = saved?.needleDepth ?? .65 + rng() * .45;
let needleFound = saved?.needleFound ?? false;
function sampleHayHeight(x: number, z: number) {
  const base = baseHayHeight(x, z);
  if (base <= 0) return 0;
  const ix = Math.floor(x / GRID_STEP), iz = Math.floor((z - PILE_Z) / GRID_STEP);
  let dug = 0, weightSum = 0;
  for (let dx = -1; dx <= 2; dx++) for (let dz = -1; dz <= 2; dz++) {
    const gx = ix + dx, gz = iz + dz;
    if (Math.abs(gx) > GRID_LIMIT || Math.abs(gz) > GRID_LIMIT) continue;
    const index = grid[gridIndex(gx, gz)]; if (index < 0) continue;
    const c = cells[index], distance = Math.hypot(x - c.x, z - c.z);
    const weight = Math.max(0, 1 - distance / (GRID_STEP * 1.45)) ** 2;
    if (!weight) continue;
    dug += (c.total - c.remaining) * DIG_DEPTH * weight; weightSum += weight;
  }
  return Math.max(0, base - (weightSum ? dug / weightSum : 0));
}
const surfaceVertices: number[] = [0, sampleHayHeight(0, PILE_Z), 0];
const surfaceUvs: number[] = [.5, .5];
const surfaceIndices: number[] = [];
const RINGS = 72, SIDES = 192;
for (let ring = 1; ring <= RINGS; ring++) {
  for (let side = 0; side < SIDES; side++) {
    const a = side * Math.PI * 2 / SIDES, r = edgeRadius(a) * ring / RINGS;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    surfaceVertices.push(x, sampleHayHeight(x, PILE_Z + z), z);
    surfaceUvs.push(.5 + x / (PILE_RADIUS * 2), .5 + z / (PILE_RADIUS * 2));
  }
}
for (let side = 0; side < SIDES; side++) {
  const next = (side + 1) % SIDES;
  surfaceIndices.push(0, 1 + next, 1 + side);
  for (let ring = 2; ring <= RINGS; ring++) {
    const prev = 1 + (ring - 2) * SIDES, curr = 1 + (ring - 1) * SIDES;
    surfaceIndices.push(prev + side, curr + next, curr + side, prev + side, prev + next, curr + next);
  }
}
const hayGeometry = new THREE.BufferGeometry();
hayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(surfaceVertices, 3));
hayGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(surfaceUvs, 2));
const hayColors: number[] = [];
function hayColor(x: number, z: number, depth: number, result: THREE.Color) {
  const speckle = terrainNoise(x * .31 + 4, z * .31 - 7);
  const shade = .9 + speckle * .14 - Math.min(.24, depth * .085);
  result.setRGB(Math.min(1, shade * 1.09), Math.min(1, shade * 1.02), Math.min(1, shade * .9));
}
const vertexColor = new THREE.Color();
for (let v = 0; v < surfaceVertices.length; v += 3) {
  const x = surfaceVertices[v], z = surfaceVertices[v + 2] + PILE_Z;
  hayColor(x, z, Math.max(0, baseHayHeight(x, z) - surfaceVertices[v + 1]), vertexColor);
  hayColors.push(vertexColor.r, vertexColor.g, vertexColor.b);
}
hayGeometry.setAttribute('color', new THREE.Float32BufferAttribute(hayColors, 3));
hayGeometry.setIndex(surfaceIndices); hayGeometry.computeVertexNormals();
const hayTexture = makeTexture('hay'); hayTexture.repeat.set(9.5, 9.5);
const haySurface = new THREE.Mesh(hayGeometry, new THREE.MeshStandardMaterial({ map: hayTexture, bumpMap: hayTexture, bumpScale: .11, roughness: 1, side: THREE.DoubleSide, vertexColors: true }));
haySurface.position.z = PILE_Z; haySurface.castShadow = true; haySurface.receiveShadow = true; scene.add(haySurface);
const strawMat = new THREE.MeshStandardMaterial({ color: 0xf5e2a3, roughness: 1, side: THREE.DoubleSide });
const strawGeometry = new THREE.CylinderGeometry(.004, .007, .85, 3, 1, true);
const strawMesh = new THREE.InstancedMesh(strawGeometry, strawMat, cells.length * STRAWS);
strawMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(strawMesh);
const dummy = new THREE.Object3D();
const hiddenStrands = new Map<number, number>();
const hash = (a: number, b: number) => { let n = Math.imul(a + 19, 374761393) + Math.imul(b + 7, 668265263); n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296; };
function updateStrawCell(i: number) {
  const c = cells[i], dug = c.total - c.remaining;
  for (let j = 0; j < STRAWS; j++) {
    const generation = Math.floor((dug + j) / STRAWS), salt = generation * 733;
    const group = Math.floor(j / 36);
    const tuftAngle = hash(i, group + 72) * Math.PI * 2;
    const tuftRadius = .22 + hash(i + 31, group + 6) * .42;
    const clustered = hash(i + salt, j + 59) < .45;
    const radius = Math.sqrt(hash(i + salt, j * 3)) * (clustered ? .29 : .68 + hash(i, 48) * .43);
    const scatterAngle = hash(i + salt, j * 3 + 1) * Math.PI * 2;
    const x = c.x + (clustered ? Math.cos(tuftAngle) * tuftRadius : 0) + Math.cos(scatterAngle) * radius;
    const z = c.z + (clustered ? Math.sin(tuftAngle) * tuftRadius : 0) + Math.sin(scatterAngle) * radius;
    const height = sampleHayHeight(x, z);
    const length = hash(i + 53, j) < .3 ? .35 + hash(i + 41 + salt, j) * .38 : .62 + hash(i + 41 + salt, j) * .65;
    const stand = hash(j + salt, i + 8), tilt = stand < .08 ? .43 + hash(j, i + 71) * .34 : stand < .38 ? .2 + hash(j, i + 29) * .22 : .035 + hash(j, i + 34) * .17;
    const grainAngle = hash(i + salt, j + 91) < .48
      ? tuftAngle + (hash(j + salt, i + 37) - .5) * 1.1
      : Math.atan2(z - PILE_Z, x) + (hash(j + salt, i + 37) - .5) * 2.2;
    dummy.position.set(x, height + .026 + (stand < .08 ? .12 * length : .015 * length), z);
    dummy.rotation.set((hash(j + salt, i) - .5) * .38, grainAngle, Math.PI / 2 + (hash(j, i + 46) < .5 ? -1 : 1) * tilt);
    const visible = c.remaining > 0 && height > .03 && !hiddenStrands.has(i * STRAWS + j);
    dummy.scale.set(length, visible ? length : .0001, length); dummy.updateMatrix();
    strawMesh.setMatrixAt(i * STRAWS + j, dummy.matrix);
  }
}
function refreshStrawCells(indices: number[]) {
  const matrix = strawMesh.instanceMatrix;
  matrix.clearUpdateRanges();
  for (const i of indices) {
    updateStrawCell(i);
    matrix.addUpdateRange(i * STRAWS * 16, STRAWS * 16);
  }
  matrix.needsUpdate = true;
}
const strawColor = new THREE.Color();
cells.forEach((_, i) => {
  updateStrawCell(i);
  for (let j = 0; j < STRAWS; j++) strawMesh.setColorAt(i * STRAWS + j, strawColor.setHSL(.095 + hash(i, j + 9) * .055, .43 + hash(j, i + 3) * .26, .46 + hash(i + 11, j) * .27));
});
strawMesh.instanceMatrix.needsUpdate = true; strawMesh.instanceColor!.needsUpdate = true;
function updateCellVisual(i: number) {
  const c = cells[i], positions = hayGeometry.attributes.position as THREE.BufferAttribute;
  const colors = hayGeometry.attributes.color as THREE.BufferAttribute;
  for (let v = 0; v < positions.count; v++) {
    const x = positions.getX(v), z = positions.getZ(v) + PILE_Z;
    if (Math.abs(x - c.x) > 2.1 || Math.abs(z - c.z) > 2.1) continue;
    const height = sampleHayHeight(x, z);
    positions.setY(v, height);
    hayColor(x, z, Math.max(0, baseHayHeight(x, z) - height), vertexColor);
    colors.setXYZ(v, vertexColor.r, vertexColor.g, vertexColor.b);
  }
  positions.needsUpdate = true; colors.needsUpdate = true; hayGeometry.computeVertexNormals();
  const nearby: number[] = [];
  for (let j = 0; j < cells.length; j++) if (Math.hypot(c.x - cells[j].x, c.z - cells[j].z) < 2.8) nearby.push(j);
  refreshStrawCells(nearby);
}
function makeHayBale(x: number, z: number, rotation = 0, scale = 1, rise = 0) {
  const bale = new THREE.Group(); bale.position.set(x, .39 * scale + rise, z); bale.rotation.y = rotation; bale.scale.setScalar(scale); scene.add(bale);
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.45, .78, .83, 4, .12), new THREE.MeshStandardMaterial({ map: hayTexture, roughness: 1 }));
  body.castShadow = true; body.receiveShadow = true; bale.add(body);
  for (const offset of [-.39, .39]) {
    meshBox(bale, .055, .8, .85, 0x9d7c48, offset, 0, 0, false);
    meshBox(bale, .055, .024, .85, 0xd7bd86, offset, .397, 0, false);
  }
}
function makeCrate(x: number, z: number, rotation = 0) {
  const crate = new THREE.Group(); crate.position.set(x, .36, z); crate.rotation.y = rotation; scene.add(crate);
  meshBox(crate, .77, .72, .77, 0x775536, 0, 0, 0);
  for (const y of [-.28, 0, .28]) meshBox(crate, .82, .055, .82, 0xae8253, 0, y, 0, false);
  for (const px of [-.35, .35]) meshBox(crate, .06, .74, .83, 0x553d2a, px, 0, 0, false);
}
function makeBarrel(x: number, z: number) {
  const group = new THREE.Group(); group.position.set(x, .43, z); scene.add(group);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.28, .32, .86, 12), mat(0x795237)); body.castShadow = true; group.add(body);
  for (const y of [-.26, .25]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(.3, .025, 6, 18), mat(0x78847d, .5, .48)); band.rotation.x = Math.PI / 2; band.position.y = y; group.add(band);
  }
}
makeHayBale(-44, -73, -.24, .88); makeHayBale(-43, -73.4, .18, .86); makeHayBale(-43.5, -73, .08, .82, .68);
makeCrate(-38, -75, .2); makeCrate(-40, -75.6, -.15); makeBarrel(-44.8, -76); makeBarrel(-43, -78);

const needleGroup = new THREE.Group(); scene.add(needleGroup);
const pin = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .37, 8), mat(0xf3f8ef, .13, .96)); pin.rotation.z = Math.PI / 2; needleGroup.add(pin);
const eye = new THREE.Mesh(new THREE.TorusGeometry(.028, .009, 6, 10), mat(0xe3e9ed, .17, .9)); eye.rotation.y = Math.PI / 2; eye.position.x = -.18; needleGroup.add(eye);
const tip = new THREE.Mesh(new THREE.ConeGeometry(.012, .08, 8), mat(0xffffff, .1, .9)); tip.rotation.z = -Math.PI / 2; tip.position.x = .22; needleGroup.add(tip);
const glint = new THREE.PointLight(0xfff7ca, .8, 1.4); glint.position.set(0, .2, 0); needleGroup.add(glint);
function updateNeedle() {
  const c = cells[needleIndex]; needleGroup.position.set(c.x, Math.max(.12, sampleHayHeight(c.x, c.z) + .13), c.z);
  needleGroup.rotation.y = c.tone * 6; needleGroup.visible = !needleFound && (c.total - c.remaining) * DIG_DEPTH >= needleDepth;
}
updateNeedle();

let removed = saved?.removed ?? 0, elapsed = saved?.elapsed ?? 0;
let won = saved?.won ?? false;
let menu: Menu = won ? 'win' : 'start';
let started = false;
let yaw = 0, pitch = -.08, velocityY = 0, lastGround = 0, mouseDown = false, fallbackControls = false;
const keys = new Set<string>();
const raycaster = new THREE.Raycaster();
raycaster.far = 8.5;
const clock = new THREE.Clock();
let toastUntil = 0, saveTimer = 0, stepTimer = 0;
const flyingStraws: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }[] = [];
let audioCtx: AudioContext | null = null;
function sound(kind: 'rustle' | 'win' | 'step') {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const now = audioCtx.currentTime;
    if (kind === 'rustle' || kind === 'step') {
      const length = kind === 'step' ? .09 : .2, size = Math.ceil(audioCtx.sampleRate * length);
      const buf = audioCtx.createBuffer(1, size, audioCtx.sampleRate), data = buf.getChannelData(0);
      for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
      const src = audioCtx.createBufferSource(); src.buffer = buf;
      const filter = audioCtx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = kind === 'step' ? 220 : 900;
      const gain = audioCtx.createGain(); gain.gain.value = kind === 'step' ? .075 : .15;
      src.connect(filter).connect(gain).connect(audioCtx.destination); src.start(now);
      return;
    }
    const notes = [587, 740, 880, 1175];
    notes.forEach((freq, i) => {
      const osc = audioCtx!.createOscillator(), gain = audioCtx!.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(.0001, now + i * .105); gain.gain.exponentialRampToValueAtTime(.11, now + i * .105 + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, now + i * .105 + .23);
      osc.connect(gain).connect(audioCtx!.destination); osc.start(now + i * .105); osc.stop(now + i * .105 + .24);
    });
  } catch { /* muted browser */ }
}
function toast(message: string) { $('toast').textContent = message; $('toast').classList.add('show'); toastUntil = performance.now() + 2400; }
function formatTime(sec: number) { const s = Math.floor(sec); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function save() {
  const state: Save = { seed, remaining: cells.map(c => c.remaining), needleIndex, needleDepth, needleFound, removed, elapsed, won };
  try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch { /* storage unavailable */ }
}
function resetGame() { localStorage.removeItem(STORAGE); location.reload(); }
function updateHUD() {
  $('removed').textContent = `${removed.toLocaleString()}가닥`;
  $('progress').textContent = `${Math.min(100, removed / HAY_TOTAL * 100).toFixed(2)}%`;
}
function renderMenu() {
  const modal = $('modal'); modal.classList.toggle('hidden', menu === null);
  if (!menu) { modal.innerHTML = ''; return; }
  if (menu === 'start') modal.innerHTML = `<div class="panel wide"><div class="eyebrow">FIRST PERSON FARM EXPLORATION</div><h1>HAYSTACK</h1><p class="hero-line">건초더미 속 바늘 하나를 찾아보세요.</p><p>앞쪽 가운데를 한 가닥씩 파헤쳐 보세요. 표면 아래의 건초가 드러나고, 더 깊이 들어가면 바늘을 발견할 수 있습니다.</p><div class="instruction-grid"><div><b>WASD · Shift</b> 이동 · 달리기</div><div><b>마우스 · 좌클릭</b> 둘러보기 · 한 가닥 제거</div><div><b>E · F</b> 바늘 줍기 · 조사</div><div><b>Esc</b> 일시정지</div></div><div class="actions"><button class="primary" data-action="resume">${saved ? '탐색 이어하기' : '게임 시작'}</button>${saved ? '<button class="secondary" data-action="reset">새 게임</button>' : ''}</div></div>`;
  if (menu === 'pause') modal.innerHTML = `<div class="panel"><div class="eyebrow">PAUSED</div><h2>잠시 쉬어가기</h2><p>진행 상황은 자동으로 저장됩니다.</p><div class="actions"><button class="primary" data-action="resume">계속하기</button><button class="secondary" data-action="reset">새 게임</button></div></div>`;
  if (menu === 'win') modal.innerHTML = `<div class="panel"><div class="eyebrow">SEARCH COMPLETE</div><h2>바늘을 찾았습니다!</h2><p>작은 반짝임 하나를 놓치지 않았습니다. 이번 탐색 기록을 확인하세요.</p><div class="result-grid"><div><small>플레이 시간</small><b>${formatTime(elapsed)}</b></div><div><small>제거한 건초</small><b>${removed.toLocaleString()}가닥</b></div></div><button class="primary" data-action="reset">새 바늘 찾기</button></div>`;
}
function openMenu(next: Menu) { menu = next; mouseDown = false; if (document.pointerLockElement) document.exitPointerLock(); renderMenu(); save(); }
$('modal').addEventListener('click', e => {
  const target = e.target as HTMLElement;
  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
  if (action === 'reset') resetGame();
  if (action === 'resume') {
    started = true; menu = null; renderMenu();
    void renderer.domElement.requestPointerLock().catch(() => { fallbackControls = true; toast('마우스 왼쪽 드래그로 시점을 움직이고 건초를 치울 수 있습니다.'); });
  }
});
function removeHay(i: number, point: THREE.Vector3) {
  const c = cells[i]; if (c.remaining <= 0) return;
  const before = c.total - c.remaining; c.remaining -= 1;
  const dug = before + 1;
  removed += 1;
  hiddenStrands.set(i * STRAWS + (STRAWS - dug % STRAWS) % STRAWS, performance.now() + 480);
  const strand = new THREE.Mesh(strawMesh.geometry, new THREE.MeshStandardMaterial({ color: 0xf5dfa0, transparent: true, roughness: 1 }));
  strand.position.copy(point); strand.position.y += .12;
  strand.rotation.set(Math.random() * .5, Math.random() * Math.PI, Math.PI / 2);
  strand.scale.setScalar(1.4); scene.add(strand);
  flyingStraws.push({ mesh: strand, velocity: new THREE.Vector3((Math.random() - .5) * 2, 1.9 + Math.random(), (Math.random() - .5) * 2), life: .65 });
  updateCellVisual(i);
  if (i === needleIndex) updateNeedle();
}
function currentHayHit() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = raycaster.intersectObject(haySurface, false)[0];
  if (!hit || hit.point.y < .05) return undefined;
  let nearest = -1, distance = GRID_STEP * 1.15;
  const ix = Math.round(hit.point.x / GRID_STEP), iz = Math.round((hit.point.z - PILE_Z) / GRID_STEP);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const gx = ix + dx, gz = iz + dz;
    if (Math.abs(gx) > GRID_LIMIT || Math.abs(gz) > GRID_LIMIT) continue;
    const i = grid[gridIndex(gx, gz)]; if (i < 0 || cells[i].remaining <= 0) continue;
    const d = Math.hypot(cells[i].x - hit.point.x, cells[i].z - hit.point.z);
    if (d < distance) { nearest = i; distance = d; }
  }
  return nearest < 0 ? undefined : { instanceId: nearest, point: hit.point, distance: hit.distance };
}
function dig() {
  if ((!document.pointerLockElement && !fallbackControls) || menu) return;
  const hit = currentHayHit(); if (!hit || hit.instanceId === undefined) return;
  removeHay(hit.instanceId, hit.point);
  sound('rustle'); updateHUD(); save();
}
function needleFocused() {
  if (!needleGroup.visible || camera.position.distanceTo(needleGroup.position) > 3.3) return false;
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera); raycaster.far = 3.3;
  const hits = raycaster.intersectObjects(needleGroup.children, true);
  raycaster.far = 8.5;
  if (hits.length) return true;
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  return dir.angleTo(needleGroup.position.clone().sub(camera.position).normalize()) < .075;
}
function interact() {
  if (menu || (!document.pointerLockElement && !fallbackControls)) return;
  if (needleFocused()) {
    needleFound = true; won = true; needleGroup.visible = false; sound('win'); openMenu('win'); return;
  }
}
function inspect() {
  if (menu) return;
  if (needleFocused()) toast('가늘고 차가운 금속. 찾던 바늘입니다.');
  else if (currentHayHit()) toast('건초가 겹겹이 쌓여 있습니다. 더 헤집어 보세요.');
  else toast('주변의 건초더미를 수색해 보세요.');
}
function prompt() {
  const p = $('prompt'), crosshair = $('crosshair');
  let text = '';
  if (!menu && (document.pointerLockElement || fallbackControls)) {
    if (needleFocused()) text = '<strong>[E]</strong> 바늘 줍기';
    else if (currentHayHit()) text = '<strong>[좌클릭]</strong> 건초 한 가닥 치우기';
  }
  p.innerHTML = text; p.classList.toggle('show', !!text); crosshair.classList.toggle('active', !!text);
}

document.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Escape' && fallbackControls && started && !won) { if (menu) { menu = null; renderMenu(); } else openMenu('pause'); }
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyF') inspect();
  if (e.code === 'Space' && !menu && lastGround < .08) velocityY = 5.7;
});
document.addEventListener('keyup', e => keys.delete(e.code));
document.addEventListener('mousemove', e => {
  if ((!document.pointerLockElement && !(fallbackControls && mouseDown)) || menu) return;
  yaw -= e.movementX * .0022; pitch = THREE.MathUtils.clamp(pitch - e.movementY * .0022, -1.48, 1.48);
  camera.rotation.set(pitch, yaw, 0);
});
renderer.domElement.addEventListener('mousedown', e => { if (e.button === 0) { mouseDown = true; dig(); } });
document.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && !fallbackControls && started && !menu && !won) openMenu('pause'); });
renderer.domElement.addEventListener('click', () => { if (started && !menu && !document.pointerLockElement && !fallbackControls) void renderer.domElement.requestPointerLock().catch(() => { fallbackControls = true; }); });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

function surfaceHeight(x: number, z: number) {
  return sampleHayHeight(x, z);
}
function updatePlayer(dt: number) {
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const v = new THREE.Vector3();
  if (keys.has('KeyW')) v.add(forward); if (keys.has('KeyS')) v.sub(forward);
  if (keys.has('KeyD')) v.add(right); if (keys.has('KeyA')) v.sub(right);
  const moving = v.lengthSq() > 0;
  if (moving) {
    v.normalize().multiplyScalar((keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6.8 : keys.has('ControlLeft') || keys.has('KeyC') ? 2.5 : 4.3) * dt);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x + v.x, -52.5, 52.5);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z + v.z, -94.5, 18.5);
    stepTimer += dt; if (stepTimer > .43) { sound('step'); stepTimer = 0; }
  }
  const crouch = keys.has('ControlLeft') || keys.has('KeyC');
  const targetGround = surfaceHeight(camera.position.x, camera.position.z);
  const eye = crouch ? 1.05 : 1.7;
  velocityY -= 15 * dt;
  camera.position.y += velocityY * dt;
  const desired = targetGround + eye;
  if (camera.position.y <= desired || (lastGround < .08 && velocityY <= 0)) {
    camera.position.y = THREE.MathUtils.damp(camera.position.y, desired, 11, dt);
    if (Math.abs(camera.position.y - desired) < .1) camera.position.y = desired;
    velocityY = 0; lastGround = 0;
  } else lastGround += dt;
}
function animate() {
  requestAnimationFrame(animate); const dt = Math.min(clock.getDelta(), .05);
  if (!menu && (document.pointerLockElement || fallbackControls) && !won) {
    elapsed += dt; updatePlayer(dt);
    saveTimer += dt; if (saveTimer > 5) { save(); saveTimer = 0; }
    prompt();
  }
  for (let i = flyingStraws.length - 1; i >= 0; i--) {
    const straw = flyingStraws[i]; straw.life -= dt;
    straw.mesh.position.addScaledVector(straw.velocity, dt); straw.velocity.y -= 4 * dt; straw.mesh.rotation.z += dt * 2.4;
    (straw.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, straw.life / .65);
    if (straw.life <= 0) { scene.remove(straw.mesh); (straw.mesh.material as THREE.Material).dispose(); flyingStraws.splice(i, 1); }
  }
  if (hiddenStrands.size) {
    const ready = new Set<number>(), now = performance.now();
    for (const [index, until] of hiddenStrands) if (now >= until) { hiddenStrands.delete(index); ready.add(Math.floor(index / STRAWS)); }
    if (ready.size) refreshStrawCells([...ready]);
  }
  if (needleGroup.visible) glint.intensity = .45 + Math.sin(performance.now() * .004) * .2;
  if (toastUntil && performance.now() > toastUntil) { $('toast').classList.remove('show'); toastUntil = 0; }
  renderer.render(scene, camera);
}
updateHUD(); renderMenu(); animate();
