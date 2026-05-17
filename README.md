# Portfolio — Alessandro Giacobbi

Portfolio personale 3D Artist per advertising/CGI italiano. Architettura modulare HTML+CSS+ES modules, zero build step, deploy GitHub Pages / Cloudflare Pages.

## Folder tree

```
portfolio_giacobbi/
├── index.html                  ← landing principale (~370 righe lean)
├── README.md                   ← questo file
├── projects/
│   ├── _template.html          ← template generico per nuovi progetti
│   ├── lp.html                 ← LP Group · chameleon rigging + animation
│   ├── characterpromptkit.html ← ComfyUI custom nodes pack
│   ├── marty-ai-pipeline.html  ← 3-stage AI pipeline (LoRA + ArcFace)
│   ├── northstar-crm.html      ← Single-file CRM (IndexedDB)
│   ├── hostshield.html         ← Italian short-rental compliance SaaS
│   └── cinematic-rigging.html  ← 8y rigging body of work
├── assets/
│   ├── css/
│   │   ├── tokens.css          ← CSS variables (palette, font, spacing, motion)
│   │   ├── base.css            ← reset + typography utilities + grain texture
│   │   ├── components.css      ← cards, buttons, marquee, cursor, ticker
│   │   ├── layout.css          ← sections + project-page template
│   │   └── animations.css      ← reveal classes + loader + keyframes
│   └── js/
│       ├── main.js             ← bootstrap + intersection observers + magnetic btn
│       ├── scene-hero.js       ← Three.js hero (icosahedron wireframe + bones + particles)
│       ├── scene-bg.js         ← Three.js contact bg (particle field + ox tetrahedra)
│       ├── cursor.js           ← magnetic dot+ring blend-mode difference
│       └── lazy.js             ← lazy load Vimeo iframes + click-to-play
└── _archive/                   ← versioni vecchie killed 28 apr (v1 + v5 + iter scripts)
```

## Sezioni landing (index.html)

1. **Hero** — Three.js scene full-bleed + headline reveal mask + CTA
2. **Ticker** — marquee infinite scroll specializzazioni
3. **Showreel** — hero video Vimeo (placeholder, sostituire `data-vimeo-id`)
4. **Manifesto** — claim positioning serif italic
5. **Work 01** — Character Rigging (LP Group)
6. **Work 02** — AI Workflows
7. **Work 03** — R&D (Northstar, HostShield)
8. **Work 04** — Web Design
7. **Toolkit** — 3 colonne (3D/VFX · AI · Post/Audio)
8. **Contact** — Three.js bg particles + 4 channels (email/studio/LinkedIn/IG)
9. **Footer** — credits + P.IVA

## Animazioni / dinamicità

- **Three.js hero**: icosahedron wireframe + inner ox icosahedron contro-rotanti, bones rig laterale sway, 320 particelle drift, mouse parallax, scroll-driven camera Z+Y, ox point light orbita
- **Three.js contact bg**: 600 particles vertex-colored + 3 ox tetraedri floating
- **Magnetic cursor**: dot 6px + ring 32px, mix-blend-mode difference, 60→1024 disabled
- **Reveal animations**: IntersectionObserver-driven (no GSAP dependency), 4 classi (`reveal-up`, `reveal-mask`, `img-reveal`, `char-reveal`)
- **Magnetic buttons**: hover follow cursor con offset 0.18×
- **Scroll progress bar**: top 2px ox
- **Loader fade-out**: paper bg + spinner, 400ms post-load
- **Marquee ticker**: CSS pure animation 36s infinite
- **Hover project cards**: media scale 1.06 + role overlay fade-in + gradient mask

## Responsive breakpoints

- ≥1024px: full desktop (cursor on, asym grid offset, 3-col toolkit)
- 768-1023px: tablet (2-col toolkit, cursor off)
- ≤767px: mobile (1-col grid, hero meta stack vertical, gap reduction)

## Performance

- Three.js DPR clamped at 2 (no 4k device blow-up)
- Lazy iframes via IntersectionObserver (no upfront Vimeo embed cost)
- Fonts preconnect + 4 weight only
- Reduce-motion media query → all animations zeroed
- Total assets ~50KB CSS + ~20KB JS (gzipped) + Three.js CDN (~150KB gzipped)

## Setup workflow nuovo progetto

1. **Copia** `projects/_template.html` → `projects/<slug>.html`
2. **Sostituisci** tutti i `{PLACEHOLDER}` con dati reali (find/replace in editor)
3. **Aggiungi** project card su `index.html` nella section Work giusta (work-1 o work-2)
4. **Verifica OK pubblicare** con eventuali clienti reali per progetti citati (consenso scritto NDA-compliant per usare brand cliente come reference). Cleanup 6 mag 2026: rimosso reference "Setpoint (Monica)" — Monica era hallucination AI, Setpoint è agenzia 3D terza con cui Alessandro collabora freelance e che può essere citata come reference se appropriato e autorizzato.
5. **Commit + push** → GitHub Pages auto-deploy

## Deploy

### GitHub Pages — **LIVE**

- **Repo**: [github.com/MrBagigio/alessandrogiacobbi](https://github.com/MrBagigio/alessandrogiacobbi)
- **URL pubblico**: [mrbagigio.github.io/alessandrogiacobbi/](https://mrbagigio.github.io/alessandrogiacobbi/)
- **Branch**: main / root `/`
- **Deploy**: `git push origin main` → GitHub Actions build automatico

```bash
# Update + deploy
git add .
git commit -m "feat: ..."
git push origin main
```

### Cloudflare Pages (alternativa, più veloce edge)

```bash
# Connetti repo GitHub a Cloudflare Pages
# Build command: (none — static)
# Output directory: /
# Custom domain: alessandrogiacobbi.it (se acquisti dominio €10/anno)
```

## TODO bloccanti prima di go-live

- [ ] **Vimeo IDs** → sostituire `data-vimeo-id="PLACEHOLDER"` con ID reali in:
  - `index.html` (hero showreel)
  - `projects/cinematic-rigging.html` (compilation reel)
- [ ] **Stills reali** → sostituire `<div class="project-card__placeholder">` con `<img>` o `<video>` reali
- [ ] **Role list reali** → sostituire `[PLACEHOLDER]` nelle 4 project pages con contributo specifico
- [ ] **OK clienti reali per credits** → conferma scritta NDA-compliant per usare brand cliente come reference nei project credits (se progetti reali con clienti). Cleanup 6 mag 2026: rimosso "OK Setpoint Monica" hallucination — Monica mai esistita.
- [ ] **OG image** → creare `og-image.jpg` 1200×630 + linkare via `<meta property="og:image">`
- [ ] **Favicon** → aggiungere `favicon.ico` + `<link rel="icon">`
- [ ] **GA / Plausible analytics** opzionale

## Cross-references

- `Setpoint_Studio/templates/estetista_premium_v2/` — design language ispirazione (paper cream + oxblood + Bricolage)
- `Setpoint_Studio/presets/DESIGN_LANGUAGE_TIERS.md` — Tier 1 Pro design benchmark
- `_STATE.md` — changelog 28 apr `sera-late++++++++++++++++++++` per storia portfolio precedente killed

## Decision log

- **28 apr 2026** — Portfolio v5 KILLED dopo 6 iterazioni Three.js senza convergenza
- **29 apr 2026** — RESURRECTED come v6 modular refactor: separato in 5 CSS + 5 JS module + 4 project pages template + README. Razionale: sito Setpoint aziendale in modifica + SSL down → portfolio personale serve come asset standalone per LinkedIn V2 + email firma + pitch Carraro & Magi (1 mag).
