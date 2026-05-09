// assets/js/modules/cursors/asteroids/managers/UIManager.js
import { hangarService } from '../_stubs/HangarService.js';

export class UIManager {
    constructor(scoreElementId = 'global-score') {
        this.scoreEl = document.getElementById(scoreElementId);
        this.creditsEl = document.querySelector('#credits-display span');
        this.isSuppressed = false;
        this._credits = hangarService?.getCredits ? hangarService.getCredits() : 0;
        this.reset();
        this._updateCreditsDisplay();
    }

    reset() { this.notifications = []; this.scorePopups = []; this.hudNotifications = []; this.hudOpacity = 0; this.waveFlashTimer = 0; this.isSuppressed = false; if (this.scoreEl) this.scoreEl.classList.remove('score-visible'); }

    addNotification(text, color, life = 120) { this.notifications.push({ text, color, life, maxLife: life }); }
    addHudNotification(text, color, life = 120) { this.hudNotifications.push({ text, color, life, maxLife: life }); }
    addScorePopup(x, y, text) { this.scorePopups.push({ x, y, text, life: 60 }); }
    triggerWaveFlash(duration = 120) { this.waveFlashTimer = duration; }
    update(isShipMode, isRespawning, isSuppressed = false) { this.isSuppressed = !!isSuppressed; const targetOpacity = (isShipMode && !isRespawning && !this.isSuppressed) ? 1 : 0; this.hudOpacity += (targetOpacity - this.hudOpacity) * 0.1; if (this.waveFlashTimer > 0) this.waveFlashTimer--; for (let i = this.notifications.length - 1; i >= 0; i--) { if (--this.notifications[i].life <= 0) this.notifications.splice(i, 1); } for (let i = this.hudNotifications.length - 1; i >= 0; i--) { if (--this.hudNotifications[i].life <= 0) this.hudNotifications.splice(i, 1); } for (let i = this.scorePopups.length - 1; i >= 0; i--) { const s = this.scorePopups[i]; s.life--; s.y -= 0.5; if (s.life <= 0) this.scorePopups.splice(i, 1); } }
    draw(ctx, gameState) { if (this.isSuppressed) return; if (this.hudOpacity > 0.01) this._drawHUD(ctx, gameState); this._drawNotifications(ctx); this._drawScorePopups(ctx); if (gameState.isGameOver) this._drawGameOver(ctx, gameState); }

    showFinalScore(score) { if (this.scoreEl) { this.scoreEl.textContent = `GAME OVER - FINAL SCORE: ${score}`; this.scoreEl.classList.add('score-visible'); } }
    _drawHUD(ctx, { lives, score, wave, comboMultiplier, playerX, playerY }) {
        ctx.save();
        ctx.globalAlpha = this.hudOpacity;
        ctx.font = "bold 12px 'Share Tech Mono', monospace";
        ctx.textAlign = 'right';
        const hudX = playerX + 95;
        const hudY = playerY + 5;
        ctx.fillStyle = 'white';
        ctx.fillText(`SCORE: ${score}`, hudX, hudY);
        ctx.fillText('▲ '.repeat(lives).trim(), hudX, hudY + 15);
        const shouldDrawWaveText = !(this.waveFlashTimer > 0 && this.waveFlashTimer % 20 < 10);
        if (shouldDrawWaveText) {
            ctx.fillStyle = this.waveFlashTimer > 0 ? '#FFD700' : 'white';
            ctx.fillText(`WAVE: ${wave}`, hudX, hudY + 30);
        }

        // Combo System HUD
        if (comboMultiplier && comboMultiplier > 1.0) {
            const rawValue = comboMultiplier;
            const rounded = rawValue.toFixed(1).replace(/\.0$/, '');
            const t = Date.now() * 0.01;
            const pulse = 0.5 + 0.5 * Math.sin(t);
            const comboAlpha = 0.5 + 0.5 * pulse;
            ctx.font = "bold 13px 'Share Tech Mono', monospace";
            ctx.globalAlpha = this.hudOpacity * comboAlpha;
            ctx.fillStyle = '#FF0055';
            ctx.fillText(`COMBO x${rounded}`, hudX, hudY - 8);
        }

        ctx.font = "bold 11px 'Share Tech Mono', monospace";
        this.hudNotifications.forEach((n, index) => {
            const alpha = n.life < 30 ? n.life / 30 : 1;
            ctx.globalAlpha = this.hudOpacity * alpha;
            ctx.fillStyle = n.color;
            ctx.fillText(n.text, hudX, hudY + 50 + (index * 15));
        });
        ctx.restore();
    }
    _drawNotifications(ctx) { this.notifications.forEach(n => { ctx.save(); const alpha = n.life < 30 ? n.life / 30 : 1; ctx.globalAlpha = alpha; ctx.font = "bold 16px 'Share Tech Mono', monospace"; ctx.fillStyle = n.color; ctx.textAlign = "center"; const yPos = window.innerHeight / 2 - 50 - (n.maxLife - n.life) * 0.3; ctx.fillText(n.text, window.innerWidth / 2, yPos); ctx.restore(); }); }
    _drawScorePopups(ctx) { this.scorePopups.forEach(s => { ctx.save(); ctx.font = "bold 14px 'Share Tech Mono', monospace"; ctx.fillStyle = `rgba(255, 255, 255, ${s.life / 60})`; ctx.textAlign = "center"; ctx.fillText(s.text, s.x, s.y); ctx.restore(); }); }
    _drawGameOver(ctx, { mouseX, mouseY }) { ctx.save(); ctx.font = "bold 20px 'Share Tech Mono', monospace"; ctx.fillStyle = 'white'; ctx.textAlign = "center"; ctx.fillText("GAME OVER", mouseX, mouseY - 10); ctx.font = "14px 'Share Tech Mono', monospace"; ctx.fillText("(Click to Restart)", mouseX, mouseY + 12); ctx.restore(); }

    // Credits management (persistent)
    _loadCredits() {
        try {
            if (hangarService?.getCredits) {
                return hangarService.getCredits();
            }
        } catch (e) {}
        return this._credits || 0;
    }

    _saveCredits(v) {
        const next = Math.max(0, Math.floor(v));
        try {
            if (hangarService?.addCredits && hangarService?.spendCredits) {
                const current = this._loadCredits();
                const diff = next - current;
                if (diff > 0) {
                    hangarService.addCredits(diff);
                } else if (diff < 0) {
                    hangarService.spendCredits(-diff);
                }
                this._credits = hangarService.getCredits();
                return;
            }
        } catch (e) {}
        this._credits = next;
    }

    _updateCreditsDisplay() {
        const value = this._loadCredits();
        if (this.creditsEl) this.creditsEl.textContent = String(value);
    }

    getCredits() {
        return this._loadCredits();
    }

    setCredits(v) {
        this._saveCredits(v);
        this._updateCreditsDisplay();
    }

    addCredits(v) {
        const delta = Math.floor(v);
        if (!delta) return this.getCredits();
        const next = this.getCredits() + delta;
        this._saveCredits(next);
        this._updateCreditsDisplay();
        this.addHudNotification(`+${v} CREDITS`, '#FFD700', 90);
        return this.getCredits();
    }

    spendCredits(v) {
        const cost = Math.floor(v);
        if (!cost) return false;
        if (this.getCredits() >= cost) {
            this._saveCredits(this.getCredits() - cost);
            this._updateCreditsDisplay();
            return true;
        }
        return false;
    }
}