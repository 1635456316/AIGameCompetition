/**
 * Debug 模式下绘制实体逻辑碰撞盒与坐标。
 */
class EntityDebugRenderer {
    constructor(scene) {
        this.scene = scene;
        this.graphics = scene.add.graphics().setDepth(10000).setScrollFactor(1);
        this.enabled = GameDebug.showHitboxes;
        this._hintText = null;
        this._labels = [];
        this._labelIndex = 0;
    }

    setEnabled(enabled) {
        this.enabled = !!enabled;
        if (!this.enabled) {
            this.graphics.clear();
            if (this._hintText) this._hintText.setVisible(false);
            this._hideAllLabels();
        }
    }

    toggle() {
        this.setEnabled(!this.enabled);
        GameDebug.showHitboxes = this.enabled;
        this._updateHint();
        return this.enabled;
    }

    _updateHint() {
        if (!this._hintText) {
            this._hintText = this.scene.add.text(12, GAME_HEIGHT - 28,
                'Debug: 碰撞盒 + 坐标 (F3 切换)', {
                    font: '14px Arial',
                    color: '#88ff88',
                    backgroundColor: '#000000aa',
                    padding: { x: 6, y: 4 }
                }).setScrollFactor(0).setDepth(10001);
        }
        this._hintText.setVisible(this.enabled);
    }

    beginFrame() {
        if (!this.enabled) return;
        this.graphics.clear();
        this._labelIndex = 0;
        this._updateHint();
    }

    endFrame() {
        if (!this.enabled) return;
        for (let i = this._labelIndex; i < this._labels.length; i++) {
            this._labels[i].setVisible(false);
        }
    }

    _hideAllLabels() {
        this._labels.forEach(t => t.setVisible(false));
    }

    _hexColor(color) {
        if (typeof color === 'string') return color;
        return `#${(color >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
    }

    drawBody(body, color = 0x00ff88, alpha = 0.35) {
        if (!this.enabled || !body) return;
        this.graphics.lineStyle(2, color, 1);
        this.graphics.strokeRect(body.x, body.y, body.width, body.height);
        this.graphics.fillStyle(color, alpha);
        this.graphics.fillRect(body.x, body.y, body.width, body.height);
    }

    _drawOrigin(x, y, color) {
        const r = 5;
        this.graphics.lineStyle(2, color, 1);
        this.graphics.strokeCircle(x, y, r);
        this.graphics.lineBetween(x - r - 3, y, x + r + 3, y);
        this.graphics.lineBetween(x, y - r - 3, x, y + r + 3);
    }

    _drawCoordLabel(entity, color, labelPrefix = '') {
        const x = Math.round(entity.x);
        const y = Math.round(entity.y);
        const body = entity.body;
        const bodyInfo = body
            ? ` body:(${Math.round(body.x)},${Math.round(body.y)}) ${Math.round(body.width)}×${Math.round(body.height)}`
            : '';
        const prefix = labelPrefix ? `${labelPrefix} ` : '';
        const text = `${prefix}pos:(${x}, ${y})${bodyInfo}`;

        const idx = this._labelIndex++;
        let txt = this._labels[idx];
        if (!txt) {
            txt = this.scene.add.text(0, 0, '', {
                font: '11px monospace',
                color: '#ffffff',
                backgroundColor: '#000000cc',
                padding: { x: 4, y: 2 }
            }).setDepth(10002).setScrollFactor(1);
            this._labels[idx] = txt;
        }

        txt.setVisible(true);
        txt.setText(text);
        txt.setColor(this._hexColor(color));
        const labelY = body ? body.y - 4 : y - 12;
        txt.setPosition(x, labelY);
        txt.setOrigin(0.5, 1);
    }

    drawEntity(entity, color, options = {}) {
        if (!entity?.body) return;
        this.drawBody(entity.body, color);
        this._drawOrigin(entity.x, entity.y, color);
        this._drawCoordLabel(entity, color, options.label || '');
    }

    drawEntities(entities, color = 0x00ff88, options = {}) {
        if (!this.enabled) return;
        const label = options.label || '';
        entities.forEach((e, i) => {
            if (e?.alive !== false && e?.body) {
                const suffix = entities.length > 1 ? `#${i + 1}` : '';
                this.drawEntity(e, color, { label: label + suffix });
            }
        });
    }
}
