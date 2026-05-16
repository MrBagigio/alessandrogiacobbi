/**
 * video-hud.js — live HUD readouts on top of BTS rig clips.
 *
 * For each .project-still--hud:
 *   • [data-tc]    — timecode HH:MM:SS:FF (24fps), synced to video.currentTime
 *   • [data-frame] — frame counter f.NNNN
 *   • [data-diag]  — rotating diagnostic line; cycles through messages
 *                    in PRESETS[data-hud-type] every ~1.6s based on currentTime
 *
 * Uses requestAnimationFrame on a single shared loop (cheap — one rAF per page
 * regardless of how many videos are visible).
 *
 * Under prefers-reduced-motion the diagnostic line stops cycling but TC still
 * tracks the video (so the video itself isn't penalised — only the rotation).
 */

const FPS = 24;
const DIAG_CYCLE_MS = 1600;

const PRESETS = {
  clay: [
    'mat: clay_neutral_v03',
    'lookdev pass · pre-shading',
    'turntable orbit 360°',
    'displ_subdiv: 3 → 5',
    'lights: hdri_studio_02',
    'render: arnold_4k_aa6',
  ],
  tail: [
    'IK_spline · 14 jnt',
    'twist_decay: 0.85',
    'overlap delay: 3f',
    'CV_curve_tail · 18 pts',
    'curl_attr: 0.72',
    'secondary: dynamic',
  ],
  tail2: [
    'curl_roll: 1.40 → 1.62',
    'jnt_tip · rot_z -34.2°',
    'spline_twist · enabled',
    'noise_layer · 0.12',
    'recoil decay: 4f',
    'sec_motion · pass 02',
  ],
  face: [
    'blink_L: 0.42',
    'jaw_open: 0.31',
    'eye_aim_R · tracker_01',
    'blendshape · expr_alert',
    'eyelid_L_upper: 0.68',
    'puff_cheek: 0.18',
  ],
  tongue: [
    'tongue_curve · 18 CV',
    'strike_t: 0.72',
    'recoil decay: 4f',
    'squash_stretch · 1.40',
    'attach_jaw · constraint',
    'curl_progress: 0.55',
  ],
  sound: [
    'tracks · 18 active',
    'master: -6.2 LUFS',
    'rev_send · 0.34',
    'foley · 4 layers',
    'ambient · sub-bus B',
    'export · 48kHz/24bit',
  ],
};

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function formatTC(seconds) {
  const totalFrames = Math.floor(seconds * FPS);
  const ff = totalFrames % FPS;
  const ss = Math.floor(seconds) % 60;
  const mm = Math.floor(seconds / 60) % 60;
  const hh = Math.floor(seconds / 3600);
  return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)}:${pad(ff, 2)}`;
}

function formatFrame(seconds) {
  const totalFrames = Math.floor(seconds * FPS) + 1;
  return `f.${pad(totalFrames, 4)}`;
}

/* Schedule the next glitch for one item — random 5–14s window. */
function scheduleGlitch(item, now) {
  item.nextGlitchAt = now + 5000 + Math.random() * 9000;
}

/* Fire a glitch on one item: 50% chance whole-monitor signal drop,
   otherwise just an RGB-shift on a single HUD readout. */
function fireGlitch(item) {
  if (item._glitching) return;
  item._glitching = true;
  const targets = [item.tcEl, item.frameEl, item.diagEl, item.fileEl].filter(Boolean);
  const wholeMonitor = Math.random() < 0.5 && targets.length > 0;

  if (wholeMonitor) {
    item.el.classList.add('is-monitor-glitch');
    setTimeout(() => {
      item.el.classList.remove('is-monitor-glitch');
      item._glitching = false;
    }, 440);
  } else if (targets.length) {
    const pick = targets[Math.floor(Math.random() * targets.length)];
    pick.classList.add('is-glitching');
    setTimeout(() => {
      pick.classList.remove('is-glitching');
      item._glitching = false;
    }, 400);
  } else {
    item._glitching = false;
  }
}

export function initVideoHud() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const containers = document.querySelectorAll('.project-still--hud');
  if (!containers.length) return;

  const items = [];
  containers.forEach((el) => {
    const video = el.querySelector('video');
    if (!video) return;
    const tcEl = el.querySelector('[data-tc]');
    const frameEl = el.querySelector('[data-frame]');
    const diagEl = el.querySelector('[data-diag]');
    const fileEl = el.querySelector('.project-still__hud-file');
    const type = el.dataset.hudType || 'clay';
    const messages = PRESETS[type] || PRESETS.clay;
    const startNow = performance.now();
    const it = { el, video, tcEl, frameEl, diagEl, fileEl, messages, nextGlitchAt: 0 };
    scheduleGlitch(it, startNow);
    items.push(it);
  });

  if (!items.length) return;

  function tick() {
    const now = performance.now();
    for (const it of items) {
      const t = it.video.currentTime || 0;
      if (it.tcEl) it.tcEl.textContent = formatTC(t);
      if (it.frameEl) it.frameEl.textContent = formatFrame(t);
      if (it.diagEl && !reduced) {
        const idx = Math.floor(now / DIAG_CYCLE_MS) % it.messages.length;
        if (it.diagEl._lastIdx !== idx) {
          it.diagEl._lastIdx = idx;
          it.diagEl.textContent = it.messages[idx];
        }
      }
      // Random glitch trigger (skip under reduced-motion)
      if (!reduced && now >= it.nextGlitchAt) {
        fireGlitch(it);
        scheduleGlitch(it, now);
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  // Only run rAF while at least one HUD container is in viewport
  let rafId = null;
  let visibleCount = 0;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visibleCount++;
        else visibleCount = Math.max(0, visibleCount - 1);
      }
      if (visibleCount > 0 && !rafId) {
        rafId = requestAnimationFrame(tick);
      } else if (visibleCount === 0 && rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
    { rootMargin: '50px' }
  );
  items.forEach((it) => io.observe(it.el));
}
