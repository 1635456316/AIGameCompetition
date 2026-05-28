/**
 * Debug 模式下绘制实体与战斗判定碰撞盒。
 */
class EntityDebugRenderer {
    constructor(scene) {
        this.scene = scene;
        this.graphics = scene.add.graphics().setDepth(10000).setScrollFactor(1);
        this.enabled = GameDebug.showHitboxes;
        this._hintText = null;
        this._minionText = null;
        this._labels = [];
        this._labelIndex = 0;
    }

    setEnabled(enabled) {
        this.enabled = !!enabled;
        if (!this.enabled) {
            this.graphics.clear();
            if (this._hintText) this._hintText.setVisible(false);
            if (this._minionText) this._minionText.setVisible(false);
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
        const key = GameDebug.toggleKey || 'F9';
        const hint = `Debug [${key}] 绿=玩家 红=敌 黄=Boss | 青=近战 蓝=剑气 橙=敌弹 紫=冲斩 金=大招`;
        if (!this._hintText) {
            this._hintText = this.scene.add.text(12, GAME_HEIGHT - 28, hint, {
                font: '13px Arial',
                color: '#88ff88',
                backgroundColor: '#000000aa',
                padding: { x: 6, y: 4 }
            }).setScrollFactor(0).setDepth(10001);
        } else {
            this._hintText.setText(hint);
        }
        this._hintText.setVisible(this.enabled);
    }

    _updateMinionCount() {
        const enemies = this.scene?.enemies;
        const total = enemies?.length ?? 0;
        if (!this.enabled || total === 0) {
            if (this._minionText) this._minionText.setVisible(false);
            return;
        }
        const remaining = enemies.reduce((n, e) => n + (e?.alive ? 1 : 0), 0);
        const label = `剩余小怪 ${remaining} / ${total}`;
        if (!this._minionText) {
            this._minionText = this.scene.add.text(12, 68, label, {
                font: 'bold 14px Arial',
                color: '#ffaa44',
                backgroundColor: '#000000aa',
                padding: { x: 6, y: 4 }
            }).setScrollFactor(0).setDepth(10001);
        } else {
            this._minionText.setText(label);
        }
        this._minionText.setVisible(true);
        if (remaining === 0) {
            this._minionText.setColor('#88ff88');
        } else {
            this._minionText.setColor('#ffaa44');
        }
    }

    beginFrame() {
        if (!this.enabled) return;
        this.graphics.clear();
        this._labelIndex = 0;
        this._updateHint();
        this._updateMinionCount();
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

    drawRect(x, y, width, height, color = 0xffffff, alpha = 0.3) {
        if (!this.enabled) return;
        this.graphics.lineStyle(2, color, 1);
        this.graphics.strokeRect(x, y, width, height);
        this.graphics.fillStyle(color, alpha);
        this.graphics.fillRect(x, y, width, height);
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
        if (options.showOrigin !== false) {
            this._drawOrigin(entity.x, entity.y, color);
        }
        if (options.label) {
            this._drawCoordLabel(entity, color, options.label);
        }
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

    /** 绘制 Phaser 物理组内活跃对象的 body */
    drawPhysicsGroup(group, color, alpha = 0.28) {
        if (!this.enabled || !group?.children) return;
        group.children.iterate((obj) => {
            if (!obj?.active || !obj.body) return;
            this.drawBody(obj.body, color, alpha);
        });
    }

    /** 近战 hitbox：绘制居中后的 physics body */
    _drawMeleeGroup(group) {
        if (!this.enabled || !group?.children) return;
        group.children.iterate((m) => {
            if (!m?.active || !m.body) return;
            this.drawBody(m.body, 0x00ccff, 0.35);
        });
    }

    /** 绘制战斗投射物与技能判定区 */
    drawCombat(scene) {
        if (!this.enabled || !scene) return;

        this.drawPhysicsGroup(scene.playerBullets, 0x4488ff);
        this.drawPhysicsGroup(scene.enemyBullets, 0xff8800);
        this._drawMeleeGroup(scene.playerMelees);

        const player = scene.player;
        if (!player) return;

        const cfg = PlayerConfig;

        if (player.fsm?.is('attackDash')) {
            const facing = player.facing;
            const cx = player.x + facing * cfg.attackDashHitOffsetX;
            const cy = player.y - cfg.attackDashHitOffsetY;
            this.drawRect(
                cx - cfg.attackDashHitWidth / 2,
                cy - cfg.attackDashHitHeight / 2,
                cfg.attackDashHitWidth,
                cfg.attackDashHitHeight,
                0xff44ff,
                0.32
            );
        }

        if (player.fsm?.is('ultimate') && player.ultPhase === 'release') {
            const cfg = PlayerConfig;
            const beamY = player.y - cfg.ultimateBeamOffsetY;
            const hitHalfH = cfg.ultimateHitHalfHeight;
            const width = player.facing > 0
                ? Math.max(0, (scene.levelWidth || GAME_WIDTH) - player.x)
                : player.x;
            const x = player.facing > 0 ? player.x : player.x - width;
            this.drawRect(x, beamY - hitHalfH, width, hitHalfH * 2, 0xff2b2b, 0.22);
        }
    }
}
