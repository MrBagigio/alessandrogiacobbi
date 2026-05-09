/**
 * Hero scene v3 — single cinematic product render style.
 *
 * Strategy: ONE central hero object (faceted icosahedron with PBR material)
 * lit dramatically with key + rim + ox accent — emulates Redshift studio shot.
 * Slow camera dolly + idle rotation. No clutter, no overlapping geometries.
 *
 * Background: subtle particle field (depth signal) + soft fog atmospheric.
 * Mouse parallax very subtle (0.15 weight).
 *
 * Replaces V2 (7 layered shapes + bones + torus + tetraedro = busy).
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export class HeroScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    this.scrollY = 0;
    this.dpr = Math.min(window.devicePixelRatio, 2);
    this.disposed = false;

    this.init();
    this.bind();
    this.animate();
  }

  init() {
    const { offsetWidth: w, offsetHeight: h } = this.canvas;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xEDE6D6, 0.04);

    this.camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 60);
    this.camera.position.set(0, 0, 7);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.setupLights();
    this.buildHeroObject();
    this.buildAtmosphere();
  }

  setupLights() {
    // Key light — front-right, warm cinematic
    this.keyLight = new THREE.DirectionalLight(0xFFEFD8, 1.6);
    this.keyLight.position.set(4, 3, 5);
    this.scene.add(this.keyLight);

    // Fill light — front-left, cool subtle
    const fill = new THREE.DirectionalLight(0xC8D4E0, 0.4);
    fill.position.set(-4, 1, 3);
    this.scene.add(fill);

    // Rim light — ox accent from back
    this.rimLight = new THREE.DirectionalLight(0xB8323F, 0.9);
    this.rimLight.position.set(-2, 0, -5);
    this.scene.add(this.rimLight);

    // Ox accent point — orbits subtly
    this.oxLight = new THREE.PointLight(0xB8323F, 1.6, 14);
    this.oxLight.position.set(2, 1, 3);
    this.scene.add(this.oxLight);

    // Ambient minimal — preserve contrast
    const ambient = new THREE.AmbientLight(0xEDE6D6, 0.25);
    this.scene.add(ambient);
  }

  buildHeroObject() {
    // Central faceted hero — Icosahedron with metallic PBR material
    const geom = new THREE.IcosahedronGeometry(1.6, 1);

    // Use MeshPhysicalMaterial for proper PBR look (clearcoat, metalness)
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x161310,           // ink base
      metalness: 0.85,
      roughness: 0.32,
      clearcoat: 0.9,
      clearcoatRoughness: 0.18,
      reflectivity: 0.6,
      flatShading: true,         // faceted look
    });

    this.hero = new THREE.Mesh(geom, mat);
    this.hero.position.set(0, 0, 0);
    this.scene.add(this.hero);

    // Subtle ox glow inside — emissive smaller core
    const coreGeom = new THREE.IcosahedronGeometry(0.55, 0);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xB8323F,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    this.heroCore = new THREE.Mesh(coreGeom, coreMat);
    this.scene.add(this.heroCore);

    // Wireframe outline overlay (subtle ridges accentuated)
    const wireGeom = new THREE.WireframeGeometry(geom);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0xB8323F,
      transparent: true,
      opacity: 0.18,
    });
    this.heroWire = new THREE.LineSegments(wireGeom, wireMat);
    this.scene.add(this.heroWire);
  }

  buildAtmosphere() {
    // Single subtle particle field — depth signal, no clutter
    const count = 280;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 22;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14 - 2;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x161310,
      size: 0.025,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.32,
    });
    this.particles = new THREE.Points(geom, mat);
    this.scene.add(this.particles);

    // Floor reflection plane (very subtle gradient — anchors the hero object)
    const floorGeom = new THREE.PlaneGeometry(20, 20);
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0xEDE6D6,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    this.floor = new THREE.Mesh(floorGeom, floorMat);
    this.floor.rotation.x = Math.PI / 2;
    this.floor.position.y = -3;
    this.scene.add(this.floor);
  }

  bind() {
    this.onResize = this.onResize.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onScroll = this.onScroll.bind(this);
    window.addEventListener('resize', this.onResize, { passive: true });
    window.addEventListener('mousemove', this.onMouseMove, { passive: true });
    window.addEventListener('scroll', this.onScroll, { passive: true });
  }

  onResize() {
    if (this.disposed) return;
    const w = this.canvas.offsetWidth;
    const h = this.canvas.offsetHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  onMouseMove(e) {
    this.mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    this.mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  }

  onScroll() {
    this.scrollY = window.scrollY;
  }

  animate() {
    if (this.disposed) return;
    requestAnimationFrame(this.animate.bind(this));

    const t = performance.now() * 0.0005;

    // Smooth mouse interpolation (subtle)
    this.mouse.x += (this.mouse.tx - this.mouse.x) * 0.04;
    this.mouse.y += (this.mouse.ty - this.mouse.y) * 0.04;

    // Hero idle rotation + subtle mouse parallax (0.15 weight)
    if (this.hero) {
      this.hero.rotation.x = t * 0.25 + this.mouse.y * 0.15;
      this.hero.rotation.y = t * 0.4 + this.mouse.x * 0.2;
    }
    if (this.heroCore) {
      this.heroCore.rotation.x = -t * 0.5;
      this.heroCore.rotation.y = -t * 0.7;
      // Pulse scale subtle (breathing)
      const pulse = 1 + Math.sin(t * 1.5) * 0.04;
      this.heroCore.scale.set(pulse, pulse, pulse);
    }
    if (this.heroWire) {
      this.heroWire.rotation.x = this.hero.rotation.x;
      this.heroWire.rotation.y = this.hero.rotation.y;
    }

    // Particles drift very slow
    if (this.particles) {
      this.particles.rotation.y = t * 0.05;
    }

    // Camera dolly on scroll (subtle)
    const scrollProgress = Math.min(this.scrollY / window.innerHeight, 1);
    this.camera.position.z = 7 + scrollProgress * 3;
    this.camera.position.y = -scrollProgress * 0.8;
    // Camera mouse parallax (very subtle)
    this.camera.position.x += (this.mouse.x * 0.25 - this.camera.position.x) * 0.03;
    this.camera.lookAt(0, 0, 0);

    // Ox light orbit (slow, dramatic shadows)
    if (this.oxLight) {
      this.oxLight.position.x = Math.sin(t * 1.0) * 3;
      this.oxLight.position.z = Math.cos(t * 1.0) * 3 + 1;
      this.oxLight.position.y = 1 + Math.sin(t * 0.7) * 0.6;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('scroll', this.onScroll);
    this.renderer.dispose();
  }
}
