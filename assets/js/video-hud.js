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
  xray: [
    'layer · geo',
    'lens · reveal rig',
    'orbit · 360°',
    'controls: 247 ctrl',
    'jnt_chain · skeleton',
    'overlay · technical',
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

/* Wire the "scrub on mousemove" interaction onto one monitor. The horizontal
   mouse position inside the tile maps to video.currentTime — turns the tile
   into a live diagnostic monitor the user can shuttle through. */
function wireScrub(item) {
  const { el, video } = item;
  const onEnter = () => {
    video.pause();
    el.classList.add('is-scrubbing');
  };
  const onLeave = () => {
    el.classList.remove('is-scrubbing');
    video.play().catch(() => { /* autoplay policy */ });
  };
  const onMove = (e) => {
    if (!video.duration || !isFinite(video.duration)) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = x * video.duration;
    if (!el.classList.contains('has-been-scrubbed')) {
      el.classList.add('has-been-scrubbed');
    }
  };
  const onClick = () => {
    // Quick taps on touch / non-hover devices just resume autoplay
    el.classList.remove('is-scrubbing');
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };
  el.addEventListener('mouseenter', onEnter);
  el.addEventListener('mouseleave', onLeave);
  el.addEventListener('mousemove', onMove);
  el.addEventListener('click', onClick);
}

export function initVideoHud() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Both regular monitors and the xray container carry HUD readouts.
  // Scrub interaction only applies to .project-still--hud (the xray uses
  // its own lens interaction in xray-lens.js).
  const containers = document.querySelectorAll('.project-still--hud, .project-xray');
  if (!containers.length) return;

  const items = [];
  containers.forEach((el) => {
    // For the xray container, the timecode tracks the geo layer (the bottom video).
    const video = el.classList.contains('project-xray')
      ? el.querySelector('.project-xray__layer--geo')
      : el.querySelector('video');
    if (!video) return;
    const tcEl = el.querySelector('[data-tc]');
    const frameEl = el.querySelector('[data-frame]');
    const diagEl = el.querySelector('[data-diag]');
    const fileEl = el.querySelector('.project-still__hud-file');
    const type = el.dataset.hudType || (el.classList.contains('project-xray') ? 'xray' : 'clay');
    const messages = PRESETS[type] || PRESETS.clay;
    const startNow = performance.now();
    const isXray = el.classList.contains('project-xray');
    const it = { el, video, tcEl, frameEl, diagEl, fileEl, messages, isXray, nextGlitchAt: 0 };
    scheduleGlitch(it, startNow);
    items.push(it);

    // Wire interactive scrub only on .project-still--hud monitors —
    // the xray container has its own lens interaction.
    if (!isXray && video.tagName === 'VIDEO') {
      wireScrub(it);
      if (!el.querySelector('.project-still__hud-hint')) {
        const hint = document.createElement('span');
        hint.className = 'project-still__hud-hint';
        hint.setAttribute('aria-hidden', 'true');
        hint.textContent = '← SCRUB →';
        el.appendChild(hint);
      }
    }
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
