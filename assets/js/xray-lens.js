/**
 * xray-lens.js — Dual-video X-ray reveal: geo layer underneath,
 * rig layer revealed inside a circular lens that follows the cursor.
 *
 * Both videos are kept time-synced (drift correction every 500 ms) so the
 * lens shows the same rotational frame as the geo, just with rig controls
 * visible.
 *
 * HTML contract:
 *   <div class="project-xray">
 *     <video class="project-xray__layer--geo" autoplay loop muted playsinline></video>
 *     <video class="project-xray__layer--rig" autoplay loop muted playsinline></video>
 *     <div class="project-xray__reticle"></div>
 *     <!-- optional HUD spans wired up by video-hud.js -->
 *   </div>
 *
 * Container CSS variables driven by this module:
 *   --lens-x / --lens-y  — cursor position relative to container (px)
 *   --lens-r             — lens radius (px), 0 when not hovering, full when active
 */

/* Lens radius scales with container width so it never swallows the whole
   frame on small screens (and never feels tiny on ultra-wide). */
function lensRadiusFor(el) {
  const w = el.getBoundingClientRect().width;
  return Math.round(Math.max(70, Math.min(190, w * 0.16)));
}

export function initXrayLens() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const containers = document.querySelectorAll('.project-xray');
  if (!containers.length) return;

  containers.forEach((el) => {
    const geo = el.querySelector('.project-xray__layer--geo');
    const rig = el.querySelector('.project-xray__layer--rig');
    if (!geo || !rig) return;

    // Initial lens state — off-center until hover
    el.style.setProperty('--lens-x', '50%');
    el.style.setProperty('--lens-y', '50%');
    el.style.setProperty('--lens-r', '0px');

    // ── One-shot sync at start: align rig to geo when both have metadata.
    // No interval-based drift correction — seeking causes visible stutter on
    // the rig layer. Both videos autoplay+loop with identical 5s duration,
    // so they stay in practical sync without runtime resync. ──
    const alignOnce = () => {
      if (!geo.duration || !rig.duration) return;
      try { rig.currentTime = geo.currentTime; } catch (_) { /* no-op */ }
    };
    if (geo.readyState >= 1 && rig.readyState >= 1) alignOnce();
    else {
      geo.addEventListener('loadedmetadata', alignOnce, { once: true });
      rig.addEventListener('loadedmetadata', alignOnce, { once: true });
    }
    geo.addEventListener('pause', () => { rig.pause(); });
    geo.addEventListener('play', () => { rig.play().catch(() => {}); });

    // ── Lens follows the mouse ──
    let lensActive = false;
    let lastX = 0, lastY = 0;
    let rafQueued = false;

    function applyLens() {
      rafQueued = false;
      el.style.setProperty('--lens-x', `${lastX}px`);
      el.style.setProperty('--lens-y', `${lastY}px`);
    }

    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      lastX = e.clientX - rect.left;
      lastY = e.clientY - rect.top;
      if (!rafQueued) {
        rafQueued = true;
        requestAnimationFrame(applyLens);
      }
      if (!lensActive) {
        lensActive = true;
        el.classList.add('is-xray-active');
        el.style.setProperty('--lens-r', `${lensRadiusFor(el)}px`);
      }
    });

    el.addEventListener('mouseleave', () => {
      lensActive = false;
      el.classList.remove('is-xray-active');
      el.style.setProperty('--lens-r', '0px');
    });

    // ── Touch fallback: tap toggles lens (centered where tapped) ──
    el.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      const rect = el.getBoundingClientRect();
      lastX = touch.clientX - rect.left;
      lastY = touch.clientY - rect.top;
      applyLens();
      if (!lensActive) {
        lensActive = true;
        el.classList.add('is-xray-active');
        el.style.setProperty('--lens-r', `${lensRadiusFor(el)}px`);
      } else {
        lensActive = false;
        el.classList.remove('is-xray-active');
        el.style.setProperty('--lens-r', '0px');
      }
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      const rect = el.getBoundingClientRect();
      lastX = touch.clientX - rect.left;
      lastY = touch.clientY - rect.top;
      if (!rafQueued) {
        rafQueued = true;
        requestAnimationFrame(applyLens);
      }
    }, { passive: true });
  });
}
