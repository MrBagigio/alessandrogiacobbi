# -*- coding: utf-8 -*-
"""
Rigenera le copie portfolio dei template a partire dai master.

master  : Setpoint_Studio/templates/<v>/index.html      (quello che si vende)
portfolio: portfolio_giacobbi/templates/<v>/index.html  (master + striscia demo)

Differenze applicate alla copia portfolio:
  1. favicon emoji (data-URI SVG)
  2. striscia demo fissa in fondo + tap target AA
  3. link legali (/privacy, /cookies) neutralizzati a "#": nella demo non esistono
  3b. mailto, action="mailto:", canonical e link social del marchio inventato tolti
  4. le barre fisse del template (.sticky-call, .whatsapp-fab) sollevate sopra
     la striscia, e il padding del body calcolato su entrambe
  5. font self-hosted: la cartella fonts/ del master copiata accanto

Uso:  python tools/inject_demobar.py <slug> [<slug> ...]
      python tools/inject_demobar.py --all
"""
import io, os, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = os.path.join(os.path.dirname(HERE), "templates")
MASTER = os.path.join(os.path.dirname(os.path.dirname(HERE)), "templates")

EMOJI = {
    "ristorante_v1": "🍽️", "hotel_luxury_v1": "🏨", "hotel_3d_premium_v1": "🏔️",
    "fotografo_v1": "📷", "notaio_v1": "⚖️", "commercialista_v1": "📊",
    "agenzia_immobiliare_v1": "🏠", "dentista_v1": "🦷", "estetista_v1": "🌿",
    "estetista_premium_v2": "✨", "parrucchiere_v1": "💇", "coach_fitness_v1": "🏋️",
    "scuola_danza_v1": "💃", "idraulico_v1": "🔧",
    "autofficina_v1": "🔩", "alimentari_v1": "🧺", "abbigliamento_v1": "🧥",
    "ferramenta_v1": "🛠️", "gioielleria_v1": "💍",
    "libri_cartoleria_v1": "📖", "concessionaria_v1": "🚗",
    "arredo_casalinghi_v1": "🪑", "falegname_v1": "🪚",
    "tabaccheria_v1": "📮",
    "fiorista_v1": "💐", "azienda_agricola_v1": "🌾",
    "sartoria_v1": "🧵", "farmacia_v1": "⚕️",
    "macelleria_v1": "🥩", "toelettatura_v1": "🐕",
    "ottico_v1": "👓", "onoranze_funebri_v1": "🕯️",
}

FAVICON = ('  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 '
           'viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>{e}</text></svg>">\n')

DEMOBAR = """<!-- ── Striscia demo (iniettata dal portfolio) ─────────────────────────
     Questi template sono demo complete, con un marchio inventato: serve a farle
     vedere finite. Senza questa striscia però sembrano il sito di un cliente
     vero. Fissa in basso; il padding del body è misurato a runtime, perché a
     390px la barra va a capo e un'altezza fissa lasciava il fondo pagina
     coperto (misurato: 110px reali contro 58 riservati).

     I template che hanno una loro barra CTA fissa in fondo (.sticky-call) o un
     bottone WhatsApp flottante finirebbero SOTTO questa striscia: vengono
     sollevati di --sp-demobar-h, e il padding del body somma le due altezze. -->
<style>
  .sp-demobar {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483000;
    display: flex; align-items: center; justify-content: center;
    flex-wrap: wrap; gap: 0.3rem 0.9rem;
    padding: 0.55rem 1rem;
    background: #161310; color: #EDE6D6;
    font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px; line-height: 1.35; letter-spacing: 0.04em;
    text-align: center;
    box-shadow: 0 -8px 24px rgba(22, 19, 16, 0.18);
  }
  .sp-demobar__tag {
    color: #EDE6D6; background: #B4313D;
    padding: 0.15rem 0.5rem; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase;
  }
  .sp-demobar__txt { color: #948E84; }
  .sp-demobar__cta {
    color: #EDE6D6; text-decoration: none;
    border-bottom: 1px dashed rgba(237, 230, 214, 0.5);
    /* target da 22px: sotto il minimo AA di 24 (misurato) */
    display: inline-flex; align-items: center; min-height: 26px;
    padding: 0.15rem 0;
    transition: color 200ms, border-color 200ms;
  }
  .sp-demobar__cta:hover, .sp-demobar__cta:focus-visible { color: #D2747E; border-bottom-color: #D2747E; }
  /* stretto: una riga sola, la frase lunga sparisce */
  @media (max-width: 620px) {
    .sp-demobar { font-size: 11px; gap: 0.5rem; padding: 0.5rem 0.75rem; }
    .sp-demobar__txt { display: none; }
  }
  @media print { .sp-demobar { display: none; } }
  /* tap target: i link del footer misuravano 14-15px (minimo AA: 24) */
  footer a, form a, nav a, .meta a, .prova__notes a, .price a { display: inline-block; padding-block: 0.3rem; margin-block: -0.3rem; }
  /* barre del template sopra la striscia, non sotto */
  .sticky-call { bottom: var(--sp-demobar-h, 0px); }
  .whatsapp-fab { bottom: calc(var(--sp-demobar-h, 0px) + 1.25rem); }
</style>
<div class="sp-demobar" role="note">
  <span class="sp-demobar__tag">Demo</span>
  <span class="sp-demobar__txt">Demo di Alessandro Giacobbi &middot; nome, foto e testi sono di esempio</span>
  <a class="sp-demobar__cta" href="../../index.html#contact">Lo voglio per la mia attivit&agrave; &rarr;</a>
</div>
<script>
  (function () {
    var bar = document.querySelector('.sp-demobar');
    if (!bar) return;
    var sticky = document.querySelector('.sticky-call');
    var sync = function () {
      var h = bar.offsetHeight;
      document.documentElement.style.setProperty('--sp-demobar-h', h + 'px');
      // su desktop la barra del template è display:none e misura 0, quindi
      // la stessa somma vale per entrambi i casi senza un ramo dedicato
      var s = sticky ? sticky.offsetHeight : 0;
      document.body.style.paddingBottom = (h + s) + 'px';
    };
    sync();
    addEventListener('resize', sync, { passive: true });
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(sync);
      ro.observe(bar);
      if (sticky) ro.observe(sticky);
    }
  })();
</script>
"""


def build(slug):
    src = os.path.join(MASTER, slug, "index.html")
    dst = os.path.join(PORT, slug, "index.html")
    s = io.open(src, encoding="utf-8").read()

    # 1. favicon dopo il meta viewport
    if 'rel="icon"' not in s:
        e = EMOJI[slug]
        icon = FAVICON.replace("{e}", e)
        s = re.sub(r'(<meta name="viewport"[^>]*>\n)', lambda m: m.group(1) + icon, s, count=1)

    # 2. link legali inesistenti nella demo
    s = s.replace('href="/privacy"', 'href="#"').replace('href="/cookies"', 'href="#"')

    # 2b. contatti del marchio inventato: nella demo non devono raggiungere nessuno.
    #     8 master usavano un dominio che esisteva davvero (codafelice.it, casaeco.it...):
    #     moduli e mailto scrivevano ad aziende vere. Anche un dominio oggi libero può
    #     essere registrato domani, quindi si neutralizza tutto, non solo quelli noti.
    s = re.sub(r'\s*<link rel="canonical"[^>]*>', "", s)
    s = re.sub(r'href="mailto:[^"]*"', 'href="#" data-demo-contatto', s)
    s = re.sub(r'action="mailto:[^"]*"',
               'action="#" onsubmit="event.preventDefault();alert(\'Questa è una demo: il modulo non invia nulla.\')"', s)
    s = re.sub(r'href="https://(?:www\.)?(?:facebook|instagram|linkedin|tiktok)\.com/[^"]*"', 'href="#"', s)
    s = re.sub(r'href="https://g\.page/[^"]*"', 'href="#"', s)
    s = re.sub(r'"sameAs"\s*:\s*\[[^\]]*\]', '"sameAs":[]', s)

    # 3. striscia demo. Il CSS va in <head>: un <style> dentro <body> non e'
    #    HTML valido (element-permitted-content). Il markup resta in fondo.
    j = DEMOBAR.index("</style>") + len("</style>")
    css, markup = DEMOBAR[:j], DEMOBAR[j:]
    s = s.replace("</head>", css + "\n</head>", 1)
    s = re.sub(r"\n?</body>\s*</html>\s*$", markup + "\n</body>\n</html>\n", s)

    os.makedirs(os.path.dirname(dst), exist_ok=True)
    io.open(dst, "w", encoding="utf-8", newline="\n").write(s)

    # 4. font self-hosted: la copia portfolio referenzia fonts/ relativa
    fsrc = os.path.join(MASTER, slug, "fonts")
    if os.path.isdir(fsrc):
        fdst = os.path.join(PORT, slug, "fonts")
        os.makedirs(fdst, exist_ok=True)
        for fn in os.listdir(fsrc):
            shutil.copy2(os.path.join(fsrc, fn), os.path.join(fdst, fn))
    return dst


if __name__ == "__main__":
    slugs = sorted(EMOJI) if sys.argv[1:] == ["--all"] else sys.argv[1:]
    for slug in slugs:
        print("built", build(slug))
