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

  // 2. Click-to-play hero showreel.
  //    Only wire placeholders that actually carry a usable Vimeo id, and never
  //    hijack a real navigation link: the current showreel is an <a mailto:>
  //    "request the reel" CTA, and the old code replaced its content with a
  //    developer-facing "Vimeo ID da configurare" message on click.
  document.querySelectorAll('.showreel__placeholder').forEach((ph) => {
    const id = ph.dataset.vimeoId;
    if (!id || id === 'PLACEHOLDER') return;
    const href = ph.getAttribute('href');
    const isRealLink = ph.tagName === 'A' && href && !href.startsWith('#');
    if (isRealLink) return;

    ph.addEventListener('click', () => {
      const wrap = ph.closest('.showreel__frame');
      if (!wrap) return;
      const iframe = document.createElement('iframe');
      iframe.src = `https://player.vimeo.com/video/${id}?autoplay=1&title=0&byline=0&portrait=0`;
      iframe.allow = 'autoplay; fullscreen; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.style.cssText = 'width:100%; height:100%; border:0;';
      wrap.replaceChildren(iframe);
    });
  });

  // 3. Click-to-play facade for project films (poster + play button). The
  //    Vimeo iframe sets third-party cookies (vuid, __cf_bm) and pulls ~1MB of
  //    player JS the moment it loads, even with dnt=1 — so it is mounted only
  //    when the visitor actually asks for the film. autoplay=1 keeps it to a
  //    single click, exactly like the embedded player behaved.
  document.querySelectorAll('.project-film__facade').forEach((btn) => {
    const id = btn.dataset.vimeoId;
    if (!id) return;
    btn.addEventListener('click', () => {
      const wrap = btn.closest('.project-film__embed');
      if (!wrap) return;
      const iframe = document.createElement('iframe');
      iframe.src = `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1&title=0&byline=0&portrait=0`;
      iframe.title = btn.getAttribute('aria-label') || 'Video';
      iframe.allow = 'autoplay; fullscreen; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; border:0;';
      wrap.replaceChildren(iframe);
      iframe.focus?.();
    }, { once: true });
  });
}
