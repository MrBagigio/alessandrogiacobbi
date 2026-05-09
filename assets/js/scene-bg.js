/**
 * Background depth scene — subtle particle field on contact section.
 * Dark inverse palette: ink bg + paper particles + ox highlights.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export class BgScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.disposed = false;
    this.dpr = Math.min(window.devicePixelRatio, 2);

    this.init();
    this.bind();
    this.animate();
  }

  init() {
    const { offsetWidth: w, offsetHeight: h } = this.canvas;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
    this.camera.position.set(0, 0, 8);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x000000, 0);

    this.buildField();
    this.buildOxAccents();
  }

  buildField() {
    const count = 600;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const colorPaper = new THREE.Color(0xEDE6D6);
    const colorMute = new THREE.Color(0x8A8478);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 28;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 18;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 18;

      const c = Math.random() > 0.85 ? colorPaper : colorMute;
      colors[i * 3 + 0] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.05,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.6,
    });

    this.points = new THREE.Points(geom, mat);
    this.scene.add(this.points);
  }

  buildOxAccents() {
    // 3 floating tetrahedra in oxblood, depth-spaced
    this.oxObjects = [];
    for (let i = 0; i < 3; i++) {
      const geom = new THREE.TetrahedronGeometry(0.4 + i * 0.15, 0);
      const wire = new THREE.WireframeGeometry(geom);
      const mat = new THREE.LineBasicMaterial({
        color: 0xB8323F,
        transparent: true,
        opacity: 0.6 - i * 0.15,
      });
      const obj = new THREE.LineSegments(wire, mat);
      obj.position.set(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 4,
        -2 - i * 1.5
      );
      this.scene.add(obj);
      this.oxObjects.push(obj);
    }
  }

  bind() {
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize, { passive: true });
  }

  onResize() {
    if (this.disposed) return;
    const w = this.canvas.offsetWidth;
    const h = this.canvas.offsetHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  animate() {
    if (this.disposed) return;
    requestAnimationFrame(this.animate.bind(this));

    const t = performance.now() * 0.0003;

    if (this.points) {
      this.points.rotation.y = t * 0.15;
      this.points.rotation.x = t * 0.05;
    }

    this.oxObjects?.forEach((obj, i) => {
      obj.rotation.x = t * (1.2 + i * 0.4);
      obj.rotation.y = t * (0.8 + i * 0.3);
      obj.position.y += Math.sin(t * 2 + i) * 0.002;
    });

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
