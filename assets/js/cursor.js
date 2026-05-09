/**
 * Magnetic cursor — dot + ring with mix-blend-mode difference.
 * Disabled on touch devices automatically (CSS @media).
 */
export class Cursor {
  constructor() {
    this.dot = document.querySelector('.cursor-dot');
    this.ring = document.querySelector('.cursor-ring');
    if (!this.dot || !this.ring) return;

    this.x = window.innerWidth / 2;
    this.y = window.innerHeight / 2;
    this.tx = this.x;
    this.ty = this.y;

    this.bind();
    this.animate();
  }

  bind() {
    window.addEventListener('mousemove', (e) => {
      this.tx = e.clientX;
      this.ty = e.clientY;
      this.dot.style.transform = `translate(${this.tx}px, ${this.ty}px) translate(-50%, -50%)`;
    }, { passive: true });

    // Hover targets
    const targets = document.querySelectorAll('a, button, .project-card, .showreel__placeholder');
    targets.forEach((el) => {
      el.addEventListener('mouseenter', () => this.ring.classList.add('is-hover'));
      el.addEventListener('mouseleave', () => this.ring.classList.remove('is-hover'));
    });
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.x += (this.tx - this.x) * 0.18;
    this.y += (this.ty - this.y) * 0.18;
    this.ring.style.transform = `translate(${this.x}px, ${this.y}px) translate(-50%, -50%)`;
  }
}
