import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FACES } from './topology.js';

const SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua","URW Palladio L",Georgia,"DejaVu Serif",serif';
const SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';

const IVORY = new THREE.Color('#d9d3c3');
const INK = new THREE.Color('#1c2236');
const INK_REVEALED = new THREE.Color('#1f6f8b');
const INK_WRONG = new THREE.Color('#c0293f');
const NUM_INK = new THREE.Color('#5b6074');

const TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0.3, 0, 'XYZ'));
const easeOutBack = (x) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function makeLetterAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 1024;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = `600 196px ${SERIF}`;
  for (let i = 0; i < 26; i++) {
    const col = i % 8, row = (i / 8) | 0;
    g.fillText(String.fromCharCode(65 + i), col * 256 + 128, row * 256 + 196);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
function makeNumberAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 1280; cv.height = 1280;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.font = `700 78px ${SANS}`;
  for (let i = 0; i < 100; i++) {
    const col = i % 10, row = (i / 10) | 0;
    g.fillText(String(i), col * 128 + 8, row * 128 + 10);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
function makeGlowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.18)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const BG_VERT = `
varying vec2 vUv;
void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
const BG_FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime; uniform vec2 uRes; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform vec2 uPar;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.02+vec2(1.7,9.2); a*=.5; } return v; }
void main(){
  vec2 uv = (vUv - .5) * vec2(uRes.x/uRes.y, 1.) + uPar * 0.05;
  float t = uTime * .035;
  vec2 q = vec2(fbm(uv*1.3 + t), fbm(uv*1.3 + vec2(5.2,1.3) - t));
  float f = fbm(uv*1.15 + q*1.9 + vec2(t*2., -t));
  vec3 col = mix(c1, c2, smoothstep(.12,.85,f));
  col = mix(col, c3, smoothstep(.45,1.,f) * .85);
  float ridge = smoothstep(.0,.5,abs(f-.55));
  col += c3 * (1.-ridge) * .05;
  float vig = smoothstep(1.3, .15, length(uv));
  col *= mix(.34, 1.25, vig);
  col += (hash(gl_FragCoord.xy + uTime) - .5) * .012;
  gl_FragColor = vec4(col, 1.);
}`;

const STAR_VERT = `
attribute float aSize; attribute float aPhase; attribute float aSpeed; attribute vec3 aCol;
uniform float uTime; uniform float uPx;
varying float vTw; varying vec3 vCol;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPx * (70.0 / -mv.z);
  vTw = .55 + .45 * sin(uTime * aSpeed + aPhase);
  vCol = aCol;
}`;
const STAR_FRAG = `
precision highp float;
varying float vTw; varying vec3 vCol;
void main(){
  float d = length(gl_PointCoord - .5);
  float a = smoothstep(.5, .0, d);
  a *= a;
  gl_FragColor = vec4(vCol, a * vTw * .9);
}`;

const LET_VERT = `
attribute float aLetter; attribute float aSize; attribute float aPhase; attribute float aRot; attribute vec3 aCol;
uniform float uTime; uniform float uPx;
varying float vL; varying float vTw; varying float vA; varying vec3 vCol;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPx * (260.0 / -mv.z);
  vL = aLetter; vCol = aCol;
  vTw = .5 + .5 * sin(uTime * .4 + aPhase);
  vA = aPhase * .7 + uTime * aRot;
}`;
const LET_FRAG = `
precision highp float;
uniform sampler2D uAtlas;
varying float vL; varying float vTw; varying float vA; varying vec3 vCol;
void main(){
  vec2 p = gl_PointCoord - .5;
  float c = cos(vA), s = sin(vA);
  p = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + .5;
  if (p.x < 0. || p.x > 1. || p.y < 0. || p.y > 1.) discard;
  float col = mod(vL, 8.), row = floor(vL / 8.);
  vec2 uv = vec2((col + p.x) / 8., 1. - (row + p.y) / 4.);
  float a = texture2D(uAtlas, uv).a;
  gl_FragColor = vec4(vCol, a * (.05 + .13 * vTw));
}`;

const SPARK_VERT = `
attribute float aA; attribute float aR; attribute float aY; attribute float aSpd; attribute float aS2; attribute float aP; attribute float aSize;
uniform float uTime; uniform float uPx; uniform vec3 uCol; uniform vec3 uCol2;
varying float vTw; varying vec3 vCol;
void main(){
  float a = aA + uTime * aSpd;
  vec3 pos = vec3(cos(a) * aR, aY + sin(uTime * aS2 + aP) * .5, sin(a) * aR);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPx * (90.0 / -mv.z);
  vTw = .4 + .6 * abs(sin(uTime * aS2 * 1.7 + aP));
  vCol = mix(uCol, uCol2, fract(aP * .37));
}`;
const SPARK_FRAG = `
precision highp float;
varying float vTw; varying vec3 vCol;
void main(){
  float d = length(gl_PointCoord - .5);
  float a = smoothstep(.5, .0, d); a = a * a * a;
  gl_FragColor = vec4(vCol * 1.4, a * vTw);
}`;

export class CubeScene {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.time = 0;
    this.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.quality = 'high';
    this.insets = { left: 0, right: 0, top: 0, bottom: 0 };
    this.zoom = 1;
    this.zoomTarget = 1;
    this.q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.42, 0.62, 0, 'XYZ'));
    this.vel = new THREE.Vector2();
    this.autoTarget = null;
    this.dragging = false;
    this.pointers = new Map();
    this.cells = [];
    this.pickables = [];
    this.hoverId = -1;
    this.N = 5;
    this.idleSpin = 0.12;
    this.lastInput = 0;
    this.par = new THREE.Vector2();
    this.parT = new THREE.Vector2();
    this.celebrating = 0;
    this.frameTimes = [];
    this.palette = null;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer = renderer;
    this.maxDpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(this.maxDpr);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
    this.camera.position.set(0, 0, 14);

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.22;

    this.buildBackground();
    this.buildLights();

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.cubeGroup = new THREE.Group();
    this.world.add(this.cubeGroup);
    this.buildSparkles();
    this.buildGlow();
    this.buildConfetti();

    this.letterAtlas = makeLetterAtlas();
    this.numberAtlas = makeNumberAtlas();
    this.buildFloatingLetters();

    this.tileGeo = new RoundedBoxGeometry(0.9, 0.9, 0.18, 3, 0.07);
    this.blockGeo = new RoundedBoxGeometry(0.9, 0.9, 0.1, 3, 0.05);
    this.arrow = this.buildArrow();

    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.4, 0.55, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.bloomBase = 0.4;

    this.raycaster = new THREE.Raycaster();
    this.bindInput();
    this.resize();
    this.last = performance.now();
    this._tick = this.tick.bind(this);
    requestAnimationFrame(this._tick);
  }

  // ---------- scene furniture ----------
  buildBackground() {
    this.bgMat = new THREE.ShaderMaterial({
      vertexShader: BG_VERT,
      fragmentShader: BG_FRAG,
      uniforms: {
        uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uPar: { value: new THREE.Vector2() },
        c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() }, c3: { value: new THREE.Color() },
      },
      depthTest: false, depthWrite: false,
    });
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    bg.frustumCulled = false;
    bg.renderOrder = -100;
    this.scene.add(bg);

    // stars
    const n = 900;
    const pos = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n), sp = new Float32Array(n), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 40 + Math.random() * 90, th = Math.random() * Math.PI * 2, y = (Math.random() * 2 - 1) * 0.9;
      pos[i * 3] = Math.cos(th) * r * Math.sqrt(1 - y * y);
      pos[i * 3 + 1] = y * r * 0.8;
      pos[i * 3 + 2] = -Math.abs(Math.sin(th)) * r - 12;
      size[i] = 0.7 + Math.pow(Math.random(), 3) * 2.8;
      ph[i] = Math.random() * 6.28; sp[i] = 0.5 + Math.random() * 2.5;
      const warm = Math.random();
      col[i * 3] = 0.8 + warm * 0.2; col[i * 3 + 1] = 0.85 + warm * 0.05; col[i * 3 + 2] = 1 - warm * 0.25;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aSpeed', new THREE.BufferAttribute(sp, 1));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
      uniforms: { uTime: { value: 0 }, uPx: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  buildFloatingLetters() {
    const n = 110;
    const pos = new Float32Array(n * 3), letter = new Float32Array(n), size = new Float32Array(n), ph = new Float32Array(n), rot = new Float32Array(n), col = new Float32Array(n * 3);
    this._letCols = col;
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * 40;
      pos[i * 3 + 1] = (Math.random() * 2 - 1) * 26;
      pos[i * 3 + 2] = -14 - Math.random() * 50;
      letter[i] = Math.floor(Math.random() * 26);
      size[i] = 1.4 + Math.random() * 3.2;
      ph[i] = Math.random() * 6.28;
      rot[i] = (Math.random() - 0.5) * 0.25;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aLetter', new THREE.BufferAttribute(letter, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aRot', new THREE.BufferAttribute(rot, 1));
    this.letColAttr = new THREE.BufferAttribute(col, 3);
    g.setAttribute('aCol', this.letColAttr);
    this.letMat = new THREE.ShaderMaterial({
      vertexShader: LET_VERT, fragmentShader: LET_FRAG,
      uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uAtlas: { value: this.letterAtlas } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.letters = new THREE.Points(g, this.letMat);
    this.letters.frustumCulled = false;
    this.scene.add(this.letters);
  }

  buildLights() {
    this.key = new THREE.DirectionalLight('#fff3df', 1.5);
    this.key.position.set(6, 9, 11);
    this.fill = new THREE.DirectionalLight('#9fc4ff', 0.55);
    this.fill.position.set(-9, -3, 7);
    this.rim = new THREE.DirectionalLight('#ffffff', 1.0);
    this.rim.position.set(0, 5, -11);
    this.orb = new THREE.PointLight('#ffffff', 14, 0, 2);
    this.scene.add(this.key, this.fill, this.rim, this.orb);
    this.scene.add(new THREE.AmbientLight('#8896c8', 0.25));
  }

  buildSparkles() {
    const n = 110;
    const a = new Float32Array(n), r = new Float32Array(n), y = new Float32Array(n), spd = new Float32Array(n), s2 = new Float32Array(n), p = new Float32Array(n), size = new Float32Array(n), pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      a[i] = Math.random() * 6.28; r[i] = 5.2 + Math.random() * 4.5; y[i] = (Math.random() * 2 - 1) * 5.5;
      spd[i] = (0.05 + Math.random() * 0.18) * (Math.random() < 0.5 ? -1 : 1);
      s2[i] = 0.4 + Math.random() * 1.2; p[i] = Math.random() * 20; size[i] = 0.6 + Math.random() * 1.5;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aA', new THREE.BufferAttribute(a, 1));
    g.setAttribute('aR', new THREE.BufferAttribute(r, 1));
    g.setAttribute('aY', new THREE.BufferAttribute(y, 1));
    g.setAttribute('aSpd', new THREE.BufferAttribute(spd, 1));
    g.setAttribute('aS2', new THREE.BufferAttribute(s2, 1));
    g.setAttribute('aP', new THREE.BufferAttribute(p, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.sparkMat = new THREE.ShaderMaterial({
      vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG,
      uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uCol: { value: new THREE.Color('#fff') }, uCol2: { value: new THREE.Color('#fff') } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.sparkles = new THREE.Points(g, this.sparkMat);
    this.sparkles.frustumCulled = false;
    this.world.add(this.sparkles);
  }

  buildGlow() {
    this.glowTex = makeGlowTexture();
    this.glowMat = new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffffff', opacity: 0.55 });
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.glowMat);
    this.glow.renderOrder = -50;
    this.glow.position.z = -6;
    this.world.add(this.glow);
    this.glowFloor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.glowMat.clone());
    this.glowFloor.rotation.x = -Math.PI / 2;
    this.world.add(this.glowFloor);
  }

  buildConfetti() {
    this.confN = 260;
    const geo = new THREE.PlaneGeometry(0.2, 0.11);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    this.confetti = new THREE.InstancedMesh(geo, mat, this.confN);
    this.confetti.frustumCulled = false;
    this.confetti.visible = false;
    this.confetti.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.confN * 3), 3);
    this.confData = Array.from({ length: this.confN }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), s: new THREE.Vector3(), life: 0 }));
    this.confDummy = new THREE.Object3D();
    this.confTime = 0;
    this.scene.add(this.confetti);
  }

  buildArrow() {
    const s = new THREE.Shape();
    s.moveTo(0.17, 0); s.lineTo(-0.07, 0.12); s.lineTo(-0.02, 0); s.lineTo(-0.07, -0.12); s.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false }));
    m.visible = false;
    m.renderOrder = 5;
    return m;
  }

  // ---------- palette ----------
  setPalette(p) {
    this.palette = p;
    this.cAccent = new THREE.Color(p.accent);
    this.cAccent2 = new THREE.Color(p.accent2);
    this.bgMat.uniforms.c1.value.set(p.bg[0]);
    this.bgMat.uniforms.c2.value.set(p.bg[1]);
    this.bgMat.uniforms.c3.value.set(p.bg[2]);
    this.sparkMat.uniforms.uCol.value.set(p.accent);
    this.sparkMat.uniforms.uCol2.value.set(p.accent2);
    this.glowMat.color.set(p.accent2);
    this.glowFloor.material.color.set(p.accent);
    this.orb.color.set(p.accent);
    this.rim.color.set(p.accent2);
    const col = this._letCols;
    const a = new THREE.Color(p.accent), b = new THREE.Color(p.accent2), w = new THREE.Color('#ffffff');
    const tmp = new THREE.Color();
    for (let i = 0; i < col.length / 3; i++) {
      const t = Math.random();
      tmp.copy(t < 0.4 ? a : t < 0.8 ? b : w);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    this.letColAttr.needsUpdate = true;
    if (this.frame) this.frame.material.color.set(p.accent);
    for (const o of this.cells) if (!o.white) o.tcol.copy(this.blockColor());
    this.dirtyHighlight = true;
  }
  blockColor() {
    const c = new THREE.Color('#0d1124');
    if (this.palette) c.lerp(new THREE.Color(this.palette.bg[1]), 0.5);
    return c;
  }

  // ---------- puzzle construction ----------
  async loadPuzzle(puzzle, letters, flags) {
    await this.clearPuzzle();
    const N = puzzle.N;
    this.N = N;
    this.puzzle = puzzle;
    const { cubeGroup } = this;

    const coreMat = new THREE.MeshPhysicalMaterial({ color: '#0a0d1c', roughness: 0.4, metalness: 0.7, clearcoat: 0.6, envMapIntensity: 0.8 });
    this.core = new THREE.Mesh(new RoundedBoxGeometry(N - 0.02, N - 0.02, N - 0.02, 4, 0.08), coreMat);
    cubeGroup.add(this.core);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(N + 0.2, N + 0.2, N + 0.2));
    this.frame = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: this.palette ? this.palette.accent : '#ffd98a', transparent: true, opacity: 0.55, toneMapped: false }));
    cubeGroup.add(this.frame);
    this.corners = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: this.palette ? this.palette.accent : '#ffd98a', toneMapped: false }));
      m.position.set(sx, sy, sz).multiplyScalar((N + 0.2) / 2);
      cubeGroup.add(m);
      this.corners.push(m);
    }

    this.cells = [];
    this.pickables = [];
    const cellMap = new Array(puzzle.cells.length);
    const basis = new THREE.Matrix4();
    const letterGeoBase = new THREE.PlaneGeometry(0.8, 0.8);
    const numGeoBase = new THREE.PlaneGeometry(0.27, 0.27);
    const centroid = new THREE.Vector3();

    puzzle.cells.forEach((cell) => {
      const F = FACES[cell.face];
      const group = new THREE.Group();
      group.position.set(cell.pos[0], cell.pos[1], cell.pos[2]);
      basis.makeBasis(new THREE.Vector3(...F.r), new THREE.Vector3(...F.u), new THREE.Vector3(...F.n));
      group.quaternion.setFromRotationMatrix(basis);
      const lift = new THREE.Group();
      group.add(lift);

      const white = !cell.blocked;
      const mat = new THREE.MeshPhysicalMaterial(white
        ? { color: IVORY, roughness: 0.52, metalness: 0.0, clearcoat: 0.2, clearcoatRoughness: 0.45, envMapIntensity: 0.5 }
        : { color: this.blockColor(), roughness: 0.28, metalness: 0.55, clearcoat: 1.0, clearcoatRoughness: 0.12, envMapIntensity: 1.0 });
      const tile = new THREE.Mesh(white ? this.tileGeo : this.blockGeo, mat);
      tile.position.z = white ? 0.07 : 0.04;
      lift.add(tile);

      const o = {
        cell, white, group, lift, tile, mat,
        col: mat.color.clone(), tcol: mat.color.clone(),
        emi: new THREE.Color(0, 0, 0), temi: new THREE.Color(0, 0, 0),
        emiI: 0, temiI: 0, liftV: 0, tlift: 0, pop: 0, flash: 0, flashCol: new THREE.Color('#fff'),
        flow: 0, flowPh: 0, wave: -1, kind: 0, letter: '',
        appear: -1, delay: 0, gone: -1,
      };
      cellMap[cell.id] = o;
      centroid.add(group.position);

      if (white) {
        const lg = letterGeoBase.clone();
        const lm = new THREE.MeshBasicMaterial({ map: this.letterAtlas, transparent: true, depthWrite: false, color: INK.clone(), toneMapped: true });
        const lmesh = new THREE.Mesh(lg, lm);
        lmesh.position.set(0.0, -0.01, 0.163);
        lmesh.visible = false;
        lift.add(lmesh);
        o.letterMesh = lmesh; o.letterMat = lm; o.letterGeo = lg;
        if (cell.num > 0) {
          const ng = numGeoBase.clone();
          const idx = cell.num;
          const col = idx % 10, row = (idx / 10) | 0;
          const uv = ng.attributes.uv;
          const u0 = col / 10, u1 = (col + 1) / 10, vt = 1 - row / 10, vb = 1 - (row + 1) / 10;
          uv.setXY(0, u0, vt); uv.setXY(1, u1, vt); uv.setXY(2, u0, vb); uv.setXY(3, u1, vb);
          uv.needsUpdate = true;
          const nm = new THREE.MeshBasicMaterial({ map: this.numberAtlas, transparent: true, depthWrite: false, color: NUM_INK.clone() });
          const nmesh = new THREE.Mesh(ng, nm);
          nmesh.position.set(-0.275, 0.275, 0.164);
          lift.add(nmesh);
          o.numMesh = nmesh;
        }
        tile.userData.cellId = cell.id;
        this.pickables.push(tile);
      }
      cubeGroup.add(group);
      this.cells[cell.id] = o;
      // intro animation: pieces fly in with a stagger
      o.delay = (this.reduced ? 0 : 0.05) + Math.random() * 0.7 + (cell.face * 0.06);
      o.appear = 0;
      o.tcol = mat.color.clone();
    });
    // blocks: initial target colour
    for (const o of this.cells) if (!o.white) o.tcol.copy(this.blockColor());

    // restore letters
    if (letters) {
      for (const c of puzzle.cells) {
        if (!c.blocked && letters[c.id]) this.setLetter(c.id, letters[c.id], { pop: false, kind: flags && flags[c.id] === 1 ? 1 : 0 });
      }
    }
    this.cubeGroup.add(this.arrow);
    this.arrow.visible = false;
    this.zoomTarget = 1;
    this.assembleT = 0;
    this.applyLayoutFit();
    this.dirtyHighlight = true;
    this.hooks.onAssemble && this.hooks.onAssemble();
  }

  clearPuzzle() {
    return new Promise((resolve) => {
      if (!this.cells.length) { resolve(); return; }
      for (const o of this.cells) { o.gone = 0; o.goneDelay = Math.random() * 0.18; }
      this.celebrating = 0;
      setTimeout(() => {
        for (const o of this.cells) {
          o.mat.dispose();
          if (o.letterGeo) { o.letterGeo.dispose(); o.letterMat.dispose(); }
          if (o.numMesh) { o.numMesh.geometry.dispose(); o.numMesh.material.dispose(); }
        }
        this.cubeGroup.clear();
        this.cells = [];
        this.pickables = [];
        this.core = null; this.frame = null;
        this.hoverId = -1;
        resolve();
      }, this.reduced ? 30 : 520);
    });
  }

  // ---------- state setters ----------
  setLetter(id, ch, { pop = true, kind = 0 } = {}) {
    const o = this.cells[id];
    if (!o || !o.white) return;
    o.letter = ch;
    if (!ch) { o.letterMesh.visible = false; return; }
    const i = ch.charCodeAt(0) - 65;
    const col = i % 8, row = (i / 8) | 0;
    const u0 = col / 8, u1 = (col + 1) / 8, vt = 1 - row / 4, vb = 1 - (row + 1) / 4;
    const uv = o.letterGeo.attributes.uv;
    uv.setXY(0, u0, vt); uv.setXY(1, u1, vt); uv.setXY(2, u0, vb); uv.setXY(3, u1, vb);
    uv.needsUpdate = true;
    o.letterMesh.visible = true;
    this.setKind(id, kind);
    if (pop && !this.reduced) o.pop = 1;
  }
  setKind(id, kind) {
    const o = this.cells[id];
    if (!o || !o.white) return;
    o.kind = kind;
    o.letterMat.color.copy(kind === 1 ? INK_REVEALED : kind === 2 ? INK_WRONG : INK);
  }
  flashCells(ids, color, strength = 1) {
    for (const id of ids) {
      const o = this.cells[id];
      if (!o) continue;
      o.flash = strength;
      o.flashCol.set(color);
    }
  }
  // state: { sel, word: [ids], cross: [ids], dir: {from,to} }
  setHighlight(state) {
    this.hl = state;
    this.dirtyHighlight = true;
  }
  applyHighlight() {
    this.dirtyHighlight = false;
    const hl = this.hl || {};
    const word = new Set(hl.word || []);
    const cross = new Set(hl.cross || []);
    const accent = this.cAccent || new THREE.Color('#ffd98a');
    const accent2 = this.cAccent2 || new THREE.Color('#9fc4ff');
    const wordList = hl.word || [];
    for (const o of this.cells) {
      if (!o.white) continue;
      const id = o.cell.id;
      const isSel = id === hl.sel;
      const inWord = word.has(id);
      const inCross = cross.has(id);
      const hovered = id === this.hoverId;
      if (isSel) {
        o.tcol.copy(IVORY).lerp(accent, 0.78);
        o.temi.copy(accent); o.temiI = 0.55;
        o.tlift = 0.085;
      } else if (inWord) {
        o.tcol.copy(IVORY).lerp(accent, 0.46);
        o.temi.copy(accent); o.temiI = 0.14;
        o.tlift = 0.04;
      } else if (inCross) {
        o.tcol.copy(IVORY).lerp(accent2, 0.3);
        o.temi.copy(accent2); o.temiI = 0.05;
        o.tlift = 0.012;
      } else {
        o.tcol.copy(IVORY);
        o.temi.set(0, 0, 0); o.temiI = 0;
        o.tlift = 0;
      }
      if (hovered && !isSel) { o.tlift += 0.03; o.temiI += 0.06; if (!inWord) o.temi.copy(accent); }
      o.flow = inWord ? 1 : 0;
      o.flowPh = inWord ? wordList.indexOf(id) : 0;
    }
    // direction arrow on the selected cell
    const so = hl.sel !== undefined ? this.cells[hl.sel] : null;
    if (so && hl.dir) {
      const F = FACES[so.cell.face];
      const a = this.puzzle.cells[hl.dir.from].pos, b = this.puzzle.cells[hl.dir.to].pos;
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const x = d[0] * F.r[0] + d[1] * F.r[1] + d[2] * F.r[2];
      const y = d[0] * F.u[0] + d[1] * F.u[1] + d[2] * F.u[2];
      this.arrow.parent && this.arrow.parent.remove(this.arrow);
      so.lift.add(this.arrow);
      const ang = Math.atan2(y, x);
      this.arrow.position.set(Math.cos(ang) * 0.33, Math.sin(ang) * 0.33, 0.17);
      this.arrow.rotation.set(0, 0, ang);
      this.arrow.material.color.copy(accent).multiplyScalar(1.6);
      this.arrow.visible = true;
    } else this.arrow.visible = false;
  }
  setHover(id) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.dirtyHighlight = true;
    this.canvas.style.cursor = id >= 0 ? 'pointer' : (this.dragging ? 'grabbing' : 'grab');
  }

  // ---------- camera / orientation ----------
  setInsets(i) { this.insets = i; this.resize(); }
  resize() {
    const cv = this.canvas;
    const W = cv.clientWidth || window.innerWidth, H = cv.clientHeight || window.innerHeight;
    this.W = W; this.H = H;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(W, H, false);
    this.composer.setPixelRatio(this.pixelRatio());
    this.composer.setSize(W, H);
    this.camera.aspect = W / H;
    const { left, right, top, bottom } = this.insets;
    const dx = (left - right) / 2, dy = (top - bottom) / 2;
    this.camera.setViewOffset(W, H, -dx, -dy, W, H);
    this.camera.updateProjectionMatrix();
    this.bgMat.uniforms.uRes.value.set(W, H);
    const px = this.renderer.getPixelRatio();
    this.starMat.uniforms.uPx.value = px;
    this.letMat.uniforms.uPx.value = px;
    this.sparkMat.uniforms.uPx.value = px;
    this.applyLayoutFit();
  }
  pixelRatio() { return this.quality === 'low' ? Math.min(this.maxDpr, 1.25) : this.maxDpr; }
  applyLayoutFit() {
    const N = this.N;
    const { left, right, top, bottom } = this.insets;
    const effW = Math.max(120, this.W - left - right), effH = Math.max(120, this.H - top - bottom);
    const tHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tv = tHalf * effH / this.H;
    const th = tHalf * effW / this.H;
    const t = Math.min(tv, th);
    const faceFit = N / 2 + (N / 2 + 0.55) / t;
    const R = N * 0.866 + 0.55;
    const sphereFit = R / (t / Math.sqrt(1 + t * t));
    this.fitDist = (faceFit * 0.55 + sphereFit * 0.45) * (this.W < 600 ? 1.12 : 1);
  }

  focusCells(ids, selId, { strict = false, force = false } = {}) {
    if (!this.cells.length || !ids.length) return;
    const minDot = strict ? 0.45 : 0.3;
    const n = new THREE.Vector3();
    let allVisible = true;
    const faces = new Set();
    for (const id of ids) {
      const f = this.puzzle.cells[id].face;
      faces.add(f);
      n.set(...FACES[f].n).applyQuaternion(this.q);
      if (n.z < minDot) allVisible = false;
    }
    if (allVisible && !force) return;
    const d = new THREE.Vector3();
    if (faces.size === 1) d.set(...FACES[[...faces][0]].n);
    else {
      for (const id of ids) { const p = this.puzzle.cells[id].pos; d.x += p[0]; d.y += p[1]; d.z += p[2]; }
      d.normalize();
    }
    const dWorld = d.clone().applyQuaternion(this.q);
    const r = new THREE.Quaternion().setFromUnitVectors(dWorld, new THREE.Vector3(0, 0, 1));
    const qn = r.multiply(this.q.clone());
    const sf = this.puzzle.cells[selId ?? ids[0]].face;
    const u = new THREE.Vector3(...FACES[sf].u).applyQuaternion(qn);
    if (Math.abs(u.x) + Math.abs(u.y) > 0.25) {
      const theta = Math.PI / 2 - Math.atan2(u.y, u.x);
      qn.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), theta));
    }
    // keep a slight three-quarter view so neighbouring faces and wrap-around edges stay visible
    qn.premultiply(TILT);
    this.autoTarget = qn.normalize();
    this.vel.set(0, 0);
  }

  // ---------- input ----------
  bindInput() {
    const cv = this.canvas;
    cv.style.touchAction = 'none';
    cv.style.cursor = 'grab';
    let downPos = null, downT = 0, moved = false, pinchD = 0;

    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) { downPos = { x: e.clientX, y: e.clientY }; downT = performance.now(); moved = false; }
      if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); moved = true; }
      this.dragging = true;
      this.autoTarget = null;
      this.vel.set(0, 0);
      this.lastInput = performance.now();
      this.hooks.onInteract && this.hooks.onInteract();
    });
    cv.addEventListener('pointermove', (e) => {
      const rect = cv.getBoundingClientRect();
      this.parT.set(((e.clientX - rect.left) / rect.width - 0.5) * 2, -((e.clientY - rect.top) / rect.height - 0.5) * 2);
      const p = this.pointers.get(e.pointerId);
      if (!p) {
        if (e.pointerType === 'mouse') this.setHover(this.pick(e.clientX, e.clientY));
        return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD > 0) this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * (pinchD / dist), 0.55, 1.6);
        pinchD = dist;
        return;
      }
      if (downPos && !moved && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5) moved = true;
      if (moved) {
        const k = 0.0062;
        const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(dy * k, dx * k, 0, 'XYZ'));
        this.q.premultiply(dq).normalize();
        const now = performance.now();
        const dt = Math.max(1, now - (this._lastMove || now)) / 1000;
        this._lastMove = now;
        this.vel.lerp(new THREE.Vector2(dx * k / dt, dy * k / dt), 0.4);
        this.lastInput = now;
        cv.style.cursor = 'grabbing';
      }
    });
    const end = (e) => {
      const had = this.pointers.has(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0) {
        this.dragging = false;
        cv.style.cursor = this.hoverId >= 0 ? 'pointer' : 'grab';
        if (had && e.type === 'pointerup' && !moved && downPos && performance.now() - downT < 450) {
          const id = this.pick(e.clientX, e.clientY);
          if (id >= 0 && this.hooks.onPick) this.hooks.onPick(id);
          this.vel.set(0, 0);
        } else if (moved) {
          if (performance.now() - (this._lastMove || 0) > 90) this.vel.set(0, 0);
          const sp = this.vel.length();
          if (sp > 7) this.vel.multiplyScalar(7 / sp);
        }
        downPos = null;
      }
      if (this.pointers.size === 1) pinchD = 0;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { if (!this.dragging) this.setHover(-1); });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * Math.exp(e.deltaY * 0.0011), 0.55, 1.6);
      this.lastInput = performance.now();
    }, { passive: false });
    window.addEventListener('resize', () => this.resize());
  }

  pick(clientX, clientY) {
    if (!this.pickables.length) return -1;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    // the camera's view offset is part of its projection matrix, so plain canvas NDC is correct
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    if (!hits.length) return -1;
    return hits[0].object.userData.cellId;
  }

  // ---------- celebration ----------
  celebrate(originId) {
    this.celebrating = 1;
    this.celebrateT = 0;
    const origin = this.puzzle.cells[originId].pos;
    for (const o of this.cells) {
      const p = o.cell.pos;
      const d = Math.hypot(p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]);
      o.wave = d * 0.085;
      o.waveDist = d;
    }
    this.bloom.strength = 1.1;
    this.vel.set(1.6, -0.9);
    this.autoTarget = null;
    this.burstConfetti();
  }
  burstConfetti() {
    const cols = [this.palette ? this.palette.accent : '#ffd98a', this.palette ? this.palette.accent2 : '#9fc4ff', '#ffffff', '#ffd98a', '#ff9fb8'];
    const c = new THREE.Color();
    for (let i = 0; i < this.confN; i++) {
      const d = this.confData[i];
      d.p.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 3 + Math.random());
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 - 0.15, Math.random() * 0.8 + 0.2).normalize();
      d.v.copy(dir).multiplyScalar(5 + Math.random() * 11);
      d.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      d.s.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      d.life = 2.4 + Math.random() * 2.2;
      c.set(cols[i % cols.length]);
      this.confetti.setColorAt(i, c);
    }
    this.confetti.instanceColor.needsUpdate = true;
    this.confetti.visible = true;
    this.confTime = 0;
  }

  // test/debug helper: finish the intro animation immediately
  skipIntro() {
    for (const o of this.cells) o.appear = 4;
    this.assembleT = 2;
  }

  snap() { if (this.autoTarget) { this.q.copy(this.autoTarget); this.autoTarget = null; } }

  setQuality(q) {
    this.quality = q;
    this.bloom.enabled = q === 'high';
    this.resize();
  }

  // ---------- main loop ----------
  tick(now) {
    requestAnimationFrame(this._tick);
    if (document.hidden) { this.last = now; return; }
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const t = this.time;

    // adaptive quality
    this.frameTimes.push(dt);
    if (this.frameTimes.length >= 120) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.frameTimes.length = 0;
      if (avg > 0.034 && !this._degraded) {
        this._degraded = true;
        this.setQuality('low');
        this.hooks.onDegrade && this.hooks.onDegrade();
      }
    }

    // uniforms
    this.bgMat.uniforms.uTime.value = t;
    this.starMat.uniforms.uTime.value = t;
    this.letMat.uniforms.uTime.value = t;
    this.sparkMat.uniforms.uTime.value = t;
    this.par.lerp(this.parT, 1 - Math.exp(-dt * 2));
    this.bgMat.uniforms.uPar.value.copy(this.par);
    this.stars.position.set(-this.par.x * 1.4, -this.par.y * 1.0, 0);
    this.letters.position.set(-this.par.x * 2.6, -this.par.y * 1.8, 0);
    this.stars.rotation.z = t * 0.004;

    // rotation: drag inertia, auto-orient, idle spin
    if (!this.dragging) {
      if (this.autoTarget) {
        this.q.slerp(this.autoTarget, 1 - Math.exp(-dt * (this.reduced ? 12 : 5.2)));
        if (this.q.angleTo(this.autoTarget) < 0.002) { this.q.copy(this.autoTarget); this.autoTarget = null; }
      } else if (this.vel.lengthSq() > 1e-5) {
        const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.vel.y * dt, this.vel.x * dt, 0, 'XYZ'));
        this.q.premultiply(dq).normalize();
        this.vel.multiplyScalar(Math.exp(-dt * 3.2));
      } else if (!this.reduced && this.idleSpin && now - this.lastInput > 14000 && !this.celebrating) {
        // very slow showcase drift when nobody is touching
        const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.idleSpin * 0.25 * dt, 0, 'XYZ'));
        this.q.premultiply(dq).normalize();
      }
    }
    if (this.celebrating) {
      this.celebrateT += dt;
      if (this.celebrateT > 6) this.celebrating = 0;
      this.bloom.strength += (this.bloomBase + (this.celebrating ? 0.25 : 0) - this.bloom.strength) * (1 - Math.exp(-dt * 1.2));
    } else this.bloom.strength += (this.bloomBase - this.bloom.strength) * (1 - Math.exp(-dt * 2));

    this.cubeGroup.quaternion.copy(this.q);
    if (!this.reduced) {
      this.world.rotation.set(Math.sin(t * 0.35) * 0.02, Math.sin(t * 0.27 + 1) * 0.03, 0);
      this.world.position.y = Math.sin(t * 0.8) * 0.07;
    }
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-dt * 8));
    const assemble = this.assembleT === undefined ? 1 : (this.assembleT = Math.min(1.4, this.assembleT + dt));
    const dist = this.fitDist * this.zoom * (1 + (1 - easeOutCubic(clamp01(assemble / 1.2))) * 0.25);
    this.camera.position.z = dist;

    const s = this.N;
    this.glow.scale.setScalar(s * 3.8);
    this.glow.position.z = -s * 1.4;
    this.glowFloor.position.y = -s * 0.5 - 1.5;
    this.glowFloor.scale.setScalar(s * (1.8 + Math.sin(t * 0.8) * 0.05));
    this.glowMat.opacity = 0.32 + Math.sin(t * 0.5) * 0.04;
    this.glowFloor.material.opacity = 0.34;

    // orbiting light for living reflections
    this.orb.position.set(Math.cos(t * 0.5) * 9, Math.sin(t * 0.37) * 5 + 2, Math.sin(t * 0.5) * 9 + 3);

    if (this.dirtyHighlight && this.cells.length) this.applyHighlight();
    this.updateCells(dt, t);
    this.updateConfetti(dt);

    if (this.frame) {
      this.frame.material.opacity = 0.45 + Math.sin(t * 1.3) * 0.1 + (this.celebrating ? 0.3 : 0);
      for (let i = 0; i < this.corners.length; i++) {
        const k = 1 + Math.sin(t * 2 + i) * 0.25;
        this.corners[i].scale.setScalar(k);
      }
    }
    if (this.arrow.visible) {
      const k = 1 + Math.sin(t * 6) * 0.12;
      this.arrow.scale.set(k, k, 1);
    }

    this.composer.render(dt);
  }

  updateCells(dt, t) {
    const k = 1 - Math.exp(-dt * 13);
    const kc = 1 - Math.exp(-dt * 10);
    const accent2 = this.cAccent2 || IVORY;
    const tmp = this._tmp || (this._tmp = new THREE.Color());
    const tmp2 = this._tmp2 || (this._tmp2 = new THREE.Color());
    for (const o of this.cells) {
      if (o.appear < 4) o.appear = Math.min(4, o.appear + dt);
      const ix = clamp01((o.appear - o.delay) / 0.75);
      let off = 0, sc = 1;
      if (ix < 1) {
        off = (1 - easeOutCubic(ix)) * 3.2;
        sc = Math.max(0.0001, easeOutBack(ix));
      }
      if (o.gone >= 0) {
        o.gone += dt;
        const x = clamp01((o.gone - o.goneDelay) / 0.32);
        off = x * x * 4;
        sc = Math.max(0.0001, 1 - x);
      }
      o.col.lerp(o.tcol, kc);
      o.emi.lerp(o.temi, kc);
      o.emiI += (o.temiI - o.emiI) * kc;
      o.liftV += (o.tlift - o.liftV) * k;

      let flow = 0;
      if (o.flow) flow = (0.5 + 0.5 * Math.sin(t * 3.2 - o.flowPh * 0.85)) * 0.2;

      let wave = 0;
      if (this.celebrating) {
        const wt = this.celebrateT - o.wave;
        if (wt > 0 && wt < 3.2) {
          wave = Math.sin(clamp01(wt / 1.6) * Math.PI) * (1 - clamp01((wt - 1.6) / 1.6));
          o.lift.position.z = o.liftV + wave * 0.22 + off;
        }
      }

      tmp.copy(o.col);
      tmp2.copy(o.emi);
      let ei = o.emiI + flow;
      if (o.flash > 0.001) {
        tmp.lerp(o.flashCol, o.flash * 0.75);
        tmp2.lerp(o.flashCol, o.flash);
        ei += o.flash * 0.6;
        o.flash *= Math.exp(-dt * 2.2);
      }
      if (wave > 0.001 && o.white) {
        const hue = (o.waveDist * 0.07 + t * 0.35) % 1;
        tmp2.setHSL(hue, 0.85, 0.6);
        tmp.lerp(tmp2, wave * 0.5);
        ei += wave * 0.9;
      }
      if (o.white) {
        o.mat.color.copy(tmp);
        o.mat.emissive.copy(tmp2);
        o.mat.emissiveIntensity = ei;
      } else {
        o.mat.color.copy(o.col);
        o.mat.emissive.copy(accent2).multiplyScalar(0.05);
        o.mat.emissiveIntensity = 1 + (wave > 0 ? wave * 3 : 0) + (this.celebrating ? 0.3 : 0);
      }

      let pz = o.liftV + off + (wave > 0.001 ? wave * 0.22 : 0);
      if (o.pop > 0.001) {
        o.pop *= Math.exp(-dt * 9);
        const ps = 1 + o.pop * 0.28;
        if (o.letterMesh) o.letterMesh.scale.setScalar(ps);
      } else if (o.letterMesh && o.letterMesh.scale.x !== 1) o.letterMesh.scale.setScalar(1);
      o.lift.position.z = pz;
      o.lift.scale.setScalar(sc);
    }
  }

  updateConfetti(dt) {
    if (!this.confetti.visible) return;
    this.confTime += dt;
    let alive = 0;
    const d = this.confDummy;
    for (let i = 0; i < this.confN; i++) {
      const c = this.confData[i];
      c.life -= dt;
      if (c.life <= 0) { d.position.set(0, -999, 0); d.scale.setScalar(0); d.updateMatrix(); this.confetti.setMatrixAt(i, d.matrix); continue; }
      alive++;
      c.v.y -= 9.5 * dt;
      c.v.multiplyScalar(Math.exp(-dt * 0.55));
      c.p.addScaledVector(c.v, dt);
      c.r.x += c.s.x * dt; c.r.y += c.s.y * dt; c.r.z += c.s.z * dt;
      d.position.copy(c.p);
      d.rotation.copy(c.r);
      d.scale.setScalar(Math.min(1, c.life * 2));
      d.updateMatrix();
      this.confetti.setMatrixAt(i, d.matrix);
    }
    this.confetti.instanceMatrix.needsUpdate = true;
    if (!alive) this.confetti.visible = false;
  }
}
