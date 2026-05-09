/**
 * Lazy load — Vimeo iframes + images via IntersectionObserver.
 * Click-to-play for hero showreel.
 */
export function initLazyMedia() {
  // 1. Lazy iframes (data-src → src on intersection)
  const iframes = document.querySelectorAll('iframe[data-src]');
  if ('IntersectionObserver' in window && iframes.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const f = entry.target;
          f.src = f.dataset.src;
          io.unobserve(f);
        }
      });
    }, { rootMargin: '200px' });
    iframes.forEach((f) => io.observe(f));
  }

  // 2. Click-to-play hero showreel
  document.querySelectorAll('.showreel__placeholder').forEach((ph) => {
    ph.addEventListener('click', () => {
      const wrap = ph.closest('.showreel__frame');
      const id = ph.dataset.vimeoId;
      if (!id || id === 'PLACEHOLDER') {
        ph.innerHTML = '<div style="font-family:var(--fm); color:var(--mute); padding:2rem; text-align:center;">Reel coming soon — Vimeo ID da configurare</div>';
        return;
      }
      const iframe = document.createElement('iframe');
      iframe.src = `https://player.vimeo.com/video/${id}?autoplay=1&title=0&byline=0&portrait=0`;
      iframe.allow = 'autoplay; fullscreen; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.style.cssText = 'width:100%; height:100%; border:0;';
      wrap.replaceChildren(iframe);
    });
  });
}
