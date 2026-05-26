/**
 * 实体表现层：纯视觉 Sprite/动画，不参与物理碰撞。
 */
class EntityView {
    constructor(scene, x, y, visualConfig) {
        this.scene = scene;
        this.config = visualConfig || {};
        const texKey = visualConfig.texture || visualConfig.idleTexture || 'particle_white';
        const frameKey = visualConfig.frame || visualConfig.idleFrame;
        this.sprite = scene.add.sprite(x, y, texKey, frameKey);

        const origin = visualConfig.origin || { x: 0.5, y: 1 };
        this.sprite.setOrigin(origin.x, origin.y);
        if (visualConfig.depth != null) this.sprite.setDepth(visualConfig.depth);
        if (visualConfig.tint != null) this.sprite.setTint(visualConfig.tint);

        this._displayScaleMult = 1;
        this._currentAnim = null;
        this.applyDisplayScale();
    }

    applyDisplayScale() {
        const cfg = this.config;
        const frame = this.sprite.frame;
        const refH = cfg.referenceFrameHeight || (frame && frame.height) || 64;
        const displayH = cfg.displayHeight || refH;
        const mult = this._displayScaleMult || 1;
        this.sprite.setScale(displayH / refH * mult);
    }

    setDisplayScaleMult(mult) {
        this._displayScaleMult = mult || 1;
        this.applyDisplayScale();
    }

    syncFromLogic(logic) {
        if (!this.sprite?.active || !logic?.sprite) return;
        const offsetY = this.config.feetVisualOffsetY || 0;
        this.sprite.setPosition(logic.sprite.x, logic.sprite.y + offsetY);
    }

    setFlipX(flip) { this.sprite.setFlipX(flip); }
    setTint(color) { this.sprite.setTint(color); }
    clearTint() { this.sprite.clearTint(); }
    setDepth(d) { this.sprite.setDepth(d); }

    playAnim(animKey, forceRestart = false) {
        if (!animKey || !this.scene.anims.exists(animKey)) return false;
        if (!forceRestart && this._currentAnim === animKey && this.sprite.anims.isPlaying) return true;
        this._currentAnim = animKey;
        this.sprite.anims.play(animKey, forceRestart);
        this.applyDisplayScale();
        return true;
    }

    showFrame(textureKey, frameKey) {
        this._currentAnim = null;
        this.sprite.anims.stop();
        this.sprite.setTexture(textureKey, frameKey);
        this.applyDisplayScale();
    }

    showTexture(textureKey) {
        this._currentAnim = null;
        this.sprite.anims.stop();
        this.sprite.setTexture(textureKey);
        this.applyDisplayScale();
    }

    stopAnim() {
        this._currentAnim = null;
        this.sprite.anims.stop();
    }

    onceAnimComplete(event, fn) {
        this.sprite.once(event, fn);
    }

    offAnimComplete(event, fn) {
        this.sprite.off(event, fn);
    }

    destroy() {
        if (this.sprite) {
            this.sprite.destroy();
            this.sprite = null;
        }
    }
}
