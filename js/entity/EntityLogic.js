/**
 * 实体逻辑体：仅负责坐标、速度与 Arcade 碰撞盒，不含可见贴图。
 * body.offset 必须对应 referenceFrameWidth × referenceFrameHeight 的序列帧坐标系。
 */
class EntityLogic {
    constructor(scene, x, y, logicConfig) {
        this.scene = scene;
        this.config = logicConfig || {};

        const refW = logicConfig.referenceFrameWidth
            || logicConfig.referenceFrameHeight
            || 64;
        const refH = logicConfig.referenceFrameHeight || refW;
        const proxyKey = TextureFactory.logicProxy(scene, refW, refH);

        this.sprite = scene.physics.add.sprite(x, y, proxyKey);
        this.sprite.setAlpha(logicConfig.debugAlpha != null ? logicConfig.debugAlpha : 0);
        this.sprite.setVisible(!!logicConfig.visibleInNormalMode);

        const origin = logicConfig.origin || { x: 0.5, y: 1 };
        this.sprite.setOrigin(origin.x, origin.y);

        if (logicConfig.depth != null) this.sprite.setDepth(logicConfig.depth);
        if (logicConfig.collideWorldBounds) this.sprite.setCollideWorldBounds(true);
        if (logicConfig.maxVelocity) {
            this.sprite.setMaxVelocity(logicConfig.maxVelocity.x, logicConfig.maxVelocity.y);
        }
        if (logicConfig.allowGravity === false && this.sprite.body) {
            this.sprite.body.setAllowGravity(false);
        }

        this.applyBody(logicConfig.body);
    }

    applyBody(bodyCfg) {
        if (!bodyCfg || !this.sprite?.body) return;
        this.sprite.body.setSize(bodyCfg.width, bodyCfg.height);
        this.sprite.body.setOffset(bodyCfg.offsetX, bodyCfg.offsetY);
    }

    get x() {
        if (this.sprite) {
            this._lastX = this.sprite.x;
            return this.sprite.x;
        }
        return this._lastX ?? 0;
    }
    get y() {
        if (this.sprite) {
            this._lastY = this.sprite.y;
            return this.sprite.y;
        }
        return this._lastY ?? 0;
    }
    get body() { return this.sprite?.body ?? null; }

    setPosition(x, y) { this.sprite.setPosition(x, y); }
    setVelocityX(v) { this.sprite.setVelocityX(v); }
    setVelocityY(v) { this.sprite.setVelocityY(v); }
    setVelocity(x, y) { this.sprite.setVelocity(x, y); }

    destroy() {
        if (this.sprite) {
            this.sprite.destroy();
            this.sprite = null;
        }
    }
}
