# R&D Assets — Portfolio Giacobbi sezione 04 R&D · Tooling & SaaS

**Path**: `assets/images/projects/rd/`
**Use case**: screenshot/render dei 4 progetti R&D personali Alessandro per sezione 04 del portfolio V6.
**Linked from**: `projects/northstar-crm.html` · `projects/hostshield.html` · `projects/characterpromptkit.html` · `projects/marty-ai-pipeline.html`

---

## 📁 Struttura subfolder

```
rd/
├── northstar-crm/         (CRM v5.3.2, 87.65% mutation testing, 294 unit + 52 E2E tests)
├── hostshield/            (SaaS PM Airbnb CIN compliance, MVP 985 test 95.12% mutation)
├── characterpromptkit/    (11 nodi ComfyUI v1.0.0 OSS MIT)
├── marty-ai-pipeline/     (LoRA training + V2V + ComfyUI workflow)
└── _misc/                 (screenshot vari R&D non assigned a un progetto specifico)
```

---

## 📸 Naming convention raccomandato

Per ogni screenshot, usa pattern:
```
[progetto]_[contesto]_[dimensione].[ext]
```

Esempi:
- `northstar-crm/dashboard_main_1440.png`
- `northstar-crm/lead-scoring_table_1440.png`
- `hostshield/widget_embed_375.png` (mobile)
- `hostshield/audit-engine_results_1440.png`
- `characterpromptkit/comfyui-nodes_canvas_1440.png`
- `characterpromptkit/character-prompt-builder_node_1440.png`
- `marty-ai-pipeline/lora-training_step3_1440.png`
- `marty-ai-pipeline/v2v-output_grid_1440.png`

---

## 🎯 Formato consigliato

| Use case | Format | Width | Note |
|----------|--------|-------|------|
| Hero shot project page | PNG o WebP | 1440px | Lossless, max quality |
| Inline content gallery | WebP | 1080px o 768px | -30% peso vs PNG |
| Mobile screenshot | PNG | 375px | Native iPhone width |
| Thumbnail card index page | WebP | 600×400 | Crop 3:2 ratio |

**Optimization tip**: usa `cwebp` (Google) o pwa-asset-generator per batch conversion PNG → WebP:
```powershell
# Install cwebp (Google Chocolatey)
choco install webp
# Convert single
cwebp -q 85 input.png -o output.webp
# Batch (PowerShell)
Get-ChildItem *.png | ForEach-Object { cwebp -q 85 $_.FullName -o ($_.BaseName + '.webp') }
```

---

## 🔗 Come integrare nel sito (projects/*.html)

Pattern HTML/CSS già usato nel template:
```html
<figure class="project-hero">
  <img src="../assets/images/projects/rd/northstar-crm/dashboard_main_1440.png"
       alt="Northstar CRM dashboard — KPI cards lead pipeline + filtri"
       loading="lazy" decoding="async" width="1440" height="900">
  <figcaption>Dashboard principale Northstar CRM, vista 1440px</figcaption>
</figure>
```

---

## ⚠️ Anti-pattern Karpathy

1. ❌ NO uploadare RAW screenshot 4K se non serve (peso bundle web → Lighthouse perf drop)
2. ❌ NO screenshot con dati clienti reali visibili (privacy + NDA) — usa demo data fittizio
3. ❌ NO screenshot con credenziali / token API / chiavi visibili (sec)
4. ❌ NO usare estensione `.HEIC` (iPhone default) — convertire PNG/WebP prima
5. ❌ NO mettere screenshot in `screenshots/` root del portfolio — quella cartella è per Playwright test snapshots, non production asset

---

## 🚀 Quick start operativo

1. **Cattura screenshot** (Win+Shift+S o Snipping Tool su Windows, Cmd+Shift+4 su Mac)
2. **Crop**: rimuovi browser chrome (URL bar, taskbar) — solo content
3. **Optimize**: convert WebP @ 85 quality (oppure resize PNG a max 1440px)
4. **Save**: dentro la subfolder progetto giusta con naming convention sopra
5. **Link**: aggiungi `<img src>` o `<figure>` nel project HTML pertinente
6. **Commit + push** repo portfolio_giacobbi
7. **Verify**: open browser locale OR GitHub Pages preview

---

## 📊 Status target go-live

Per chiudere il blocker portfolio go-live (vedi `_STATE.md` 16 mag), serve almeno **1 screenshot hero per ogni progetto R&D**:

- [ ] `northstar-crm/dashboard_main_1440.png`
- [ ] `hostshield/widget_embed_1440.png` (o landing MVP)
- [ ] `characterpromptkit/comfyui-nodes_canvas_1440.png`
- [ ] `marty-ai-pipeline/lora-training_step3_1440.png`

Quando hai 4/4 → portfolio è pronto per GitHub Pages deploy (`mrbagigio.github.io/alessandrogiacobbi/`).

---

## File source

- `Setpoint_Studio/portfolio_giacobbi/projects/*.html` — 4 pagine R&D che linkano questi asset
- `Setpoint_Studio/portfolio_giacobbi/index.html` — section 04 R&D · Tooling & SaaS
- `CLAUDE.md` line 103 — portfolio_giacobbi spec V6 + go-live checklist
