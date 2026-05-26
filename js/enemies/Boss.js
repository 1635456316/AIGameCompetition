/**
 * Boss：单一实体 + 两阶段，技能池调度，作为框架可扩展。
 */
class Boss {
    constructor(scene, x, y, config) {
        this.scene = scene;
        this.config = config || BossConfigs.mechanicalDino;
        this._useSheetVisual = this._hasSheetVisual();

        const vis = this.config.visual;
        const texKey = this._useSheetVisual ? vis.idleTexture : 'boss_default';
        const frameKey = this._useSheetVisual
            ? (vis.idleFrame || `${vis.framePrefix || 'idle'}_0`)
            : undefined;
        this.sprite = scene.physics.add.sprite(x, y, texKey, frameKey);
        this.sprite.setOrigin(0.5, 1);
        this.sprite.setCollideWorldBounds(true);
        this._applyBossVisualScale();
        this._applyBossBody();
        this.sprite.body.setAllowGravity(true);
        this.sprite.owner = this;

        if (this._useSheetVisual) {
            this._playBossIdle(true);
        } else {
            this.sprite.setTint(this.config.tint || Palette.boss);
        }

        this.maxHp = this.config.hp || 800;
        this.hp = this.maxHp;
        this.alive = true;
        this.phase = 1;
        this.facing = -1;
        this.nextSkillAt = scene.time.now + 1500;
        this.contactDamage = this.config.contactDamage || 14;

        // HUD blood bar（屏幕上方居中）
        const barY = 80;
        this.bossBarBg = scene.add.rectangle(GAME_WIDTH / 2, barY, 800, 22, 0x000000, 0.7)
            .setScrollFactor(0).setDepth(1000);
        this.bossBarFill = scene.add.rectangle(GAME_WIDTH / 2 - 396, barY, 792, 16, Palette.boss)
            .setOrigin(0, 0.5).setScrollFactor(0).setDepth(1000);
        this.bossLabel = scene.add.text(GAME_WIDTH / 2, 12, this.config.title || this.config.name || '未知 Boss', {
            font: 'bold 18px Arial', color: PaletteHex.warning
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    }

    _hasSheetVisual() {
        const vis = this.config.visual;
        return !!(vis && this.scene.textures.exists(vis.idleTexture));
    }

    _applyBossVisualScale() {
        const vis = this.config.visual;
        const displayH = vis?.displayHeight || 140;
        const refH = vis?.referenceFrameHeight
            || (this.sprite.frame && this.sprite.frame.height)
            || 640;
        this.sprite.setScale(displayH / refH);
    }

    _applyBossBody() {
        const vis = this.config.visual;
        if (this._useSheetVisual && vis?.sheetBody) {
            const b = vis.sheetBody;
            const refH = vis.referenceFrameHeight
                || (this.sprite.frame && this.sprite.frame.height)
                || 640;
            const height = b.height;
            const offsetY = b.feetAlign === false && b.offsetY != null
                ? b.offsetY
                : (refH - height);
            this.sprite.body.setSize(b.width, height);
            this.sprite.body.setOffset(b.offsetX, offsetY);
            return;
        }
        this.sprite.body.setSize(120, 158);
        this.sprite.body.setOffset(20, 2);
    }

    /** 将碰撞盒底边与地面对齐（origin 为脚底时，sprite.y 即地面高度） */
    snapFeetToGroundY(groundY) {
        const body = this.sprite?.body;
        if (!body) return;
        // body.position 只在 preUpdate 时根据当前 origin/scale/offset 重算。
        // 这里在构造完成后立即调用，必须先 updateFromGameObject() 触发刷新，
        // 否则读到的是 sprite 创建那一刻的旧 body.bottom，会把 Boss 推到地下。
        body.updateFromGameObject();
        const correction = body.bottom - groundY;
        if (Math.abs(correction) > 0.5) {
            this.sprite.y -= correction;
            body.updateFromGameObject();
        }
        // 清掉竖向速度，避免第一帧重力把 Boss 又踹进地里
        body.setVelocityY(0);
        if (typeof console !== 'undefined') {
            console.log('[Boss] snapFeetToGroundY', {
                groundY,
                spriteY: this.sprite.y,
                bodyBottom: body.bottom,
                bodyHeight: body.height,
                bodyOffsetY: body.offset.y,
                scaleY: this.sprite.scaleY,
                originY: this.sprite.originY,
                frameH: this.sprite.frame && this.sprite.frame.height
            });
        }
    }

    _playBossIdle(forceRestart = false) {
        if (!this._useSheetVisual) return;
        const animKey = this.config.visual?.idleAnim;
        if (!animKey || !this.scene.anims.exists(animKey)) return;
        if (!forceRestart && this.sprite.anims.isPlaying) return;
        this.sprite.anims.play(animKey, forceRestart);
        this._applyBossVisualScale();
    }

    _restoreBossTint() {
        if (!this.sprite) return;
        if (this._useSheetVisual) {
            if (this.phase === 2) {
                this.sprite.setTint(this.config.phase2Tint || 0xff5577);
            } else {
                this.sprite.clearTint();
            }
            return;
        }
        this.sprite.setTint(this.phase === 2
            ? (this.config.phase2Tint || 0xff5577)
            : (this.config.tint || Palette.boss));
    }

    get x() { return this.sprite.x; }
    get y() { return this.sprite.y; }
    get body() { return this.sprite.body; }

    update(time, delta, player) {
        if (!this.alive) return;
        const dx = player.x - this.x;
        this.facing = dx >= 0 ? 1 : -1;
        this.sprite.setFlipX(this.facing < 0);

        // 阶段切换
        if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
            this.enterPhase2();
        }

        // 走位 + 技能
        const dist = Math.abs(dx);
        const stopDistance = this.config.stopDistance || 220;
        if (dist > stopDistance) {
            this.sprite.setVelocityX(this.facing * (this.config.speed || 80));
        } else {
            this.sprite.setVelocityX(0);
        }

        if (time >= this.nextSkillAt) {
            this.castSkill(player);
            this.nextSkillAt = time + (this.phase === 1
                ? (this.config.phase1Cooldown || 1800)
                : (this.config.phase2Cooldown || 1100));
        }

        this._syncBossBar();
    }

    _syncBossBar() {
        if (!this.bossBarFill) return;
        const ratio = Math.max(0, this.hp / this.maxHp);
        this.bossBarFill.width = 792 * ratio;
    }

    enterPhase2() {
        this.phase = 2;
        this._restoreBossTint();
        Effects.bigText(this.scene, '暴 走！！', PaletteHex.danger);
        Effects.shake(this.scene, 320, 0.02);
    }

    castSkill(player) {
        const pool = this.phase === 1
            ? (this.config.phase1Skills || ['spread', 'tri'])
            : (this.config.phase2Skills || ['spread', 'tri', 'slam']);
        const choice = Phaser.Utils.Array.GetRandom(pool);
        if (choice === 'spread') this.skillSpread();
        else if (choice === 'tri') this.skillTri();
        else if (choice === 'slam') this.skillSlam(player);
        else if (choice === 'rain') this.skillRain(player);
    }

    skillSpread() {
        const scene = this.scene;
        const angles = [-30, -15, 0, 15, 30];
        angles.forEach(a => {
            const rad = Phaser.Math.DegToRad(a);
            const vx = Math.cos(rad) * this.facing * 360;
            const vy = Math.sin(rad) * 360;
            scene.spawnEnemyBullet(this.x + this.facing * 60, this.y - 90, vx, vy);
        });
    }

    skillTri() {
        const scene = this.scene;
        for (let i = 0; i < 3; i++) {
            scene.time.delayedCall(i * 180, () => {
                scene.spawnEnemyBullet(this.x + this.facing * 60, this.y - 90, this.facing * 440, 0);
            });
        }
    }

    skillSlam(player) {
        const scene = this.scene;
        this.sprite.setVelocity(this.facing * 220, -700);
        scene.time.delayedCall(600, () => {
            if (!this.alive) return;
            Effects.shake(scene, 240, 0.018);
            // 地震波 4 颗子弹
            for (let i = -1; i <= 1; i += 2) {
                scene.spawnEnemyBullet(this.x + i * 30, this.y - 10, i * 320, -60);
            }
        });
    }

    skillRain(player) {
        const scene = this.scene;
        for (let i = 0; i < 6; i++) {
            scene.time.delayedCall(i * 120, () => {
                if (!this.alive) return;
                const x = player.x + Phaser.Math.Between(-260, 260);
                scene.spawnEnemyBullet(x, 80, Phaser.Math.Between(-40, 40), 430);
            });
        }
    }

    takeDamage(amount, fromX) {
        if (!this.alive) return;
        this.hp = Math.max(0, this.hp - amount);
        this._syncBossBar();
        this.sprite.setTint(0xffffff);
        this.scene.time.delayedCall(70, () => this._restoreBossTint());
        if (this.hp <= 0) this.die();
    }

    die() {
        this.alive = false;
        this.hp = 0;
        this._syncBossBar();
        const scene = this.scene;
        Effects.bigText(scene, '胜 利！！', PaletteHex.warning);
        Effects.shake(scene, 600, 0.025);
        for (let i = 0; i < 6; i++) {
            scene.time.delayedCall(i * 140, () => {
                Effects.explosion(scene, this.x + Phaser.Math.Between(-60, 60), this.y - Phaser.Math.Between(20, 120), 1.2);
            });
        }
        scene.time.delayedCall(1200, () => this.sprite && this.sprite.destroy());
        scene.onBossDefeated && scene.onBossDefeated();
    }
}
