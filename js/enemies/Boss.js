/**
 * Boss：逻辑体 + 表现层分离，技能与阶段逻辑仍在此类。
 */
class Boss {
    constructor(scene, x, y, config) {
        this.scene = scene;
        this.config = config || BossConfigs.mechanicalDino;
        const entityCfg = BossConfigs.buildEntityConfig(scene, this.config);
        this._useSheetVisual = entityCfg.useSheet;

        this.logic = new EntityLogic(scene, x, y, entityCfg.logic);
        this.view = new EntityView(scene, x, y, entityCfg.visual);
        this.logic.sprite.owner = this;
        this.logic.sprite.body.setAllowGravity(true);
        this.sprite = this.logic.sprite;
        this.viewSprite = this.view.sprite;

        if (this._useSheetVisual) {
            this._playBossIdle(true);
        } else {
            this._restoreBossTint();
        }

        this.maxHp = this.config.hp || 800;
        this.hp = this.maxHp;
        this.alive = true;
        this.phase = 1;
        this.facing = -1;
        this.nextSkillAt = scene.time.now + 1500;
        this.contactDamage = this.config.contactDamage || 14;

        const barY = 80;
        this.bossBarBg = scene.add.rectangle(GAME_WIDTH / 2, barY, 800, 22, 0x000000, 0.7)
            .setScrollFactor(0).setDepth(1000);
        this.bossBarFill = scene.add.rectangle(GAME_WIDTH / 2 - 396, barY, 792, 16, Palette.boss)
            .setOrigin(0, 0.5).setScrollFactor(0).setDepth(1000);
        this.bossLabel = scene.add.text(GAME_WIDTH / 2, 12, this.config.title || this.config.name || '未知 Boss', {
            font: 'bold 18px Arial', color: PaletteHex.warning
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1000);
        this.syncView();
    }

    _playBossIdle(forceRestart = false) {
        if (!this._useSheetVisual) return;
        const animKey = this.config.visual?.idleAnim;
        if (!animKey) return;
        this.view.playAnim(animKey, forceRestart);
    }

    _restoreBossTint() {
        if (!this.viewSprite) return;
        if (this._useSheetVisual) {
            if (this.phase === 2) {
                this.view.setTint(this.config.phase2Tint || 0xff5577);
            } else {
                this.view.clearTint();
            }
            return;
        }
        this.view.setTint(this.phase === 2
            ? (this.config.phase2Tint || 0xff5577)
            : (this.config.tint || Palette.boss));
    }

    /** 将逻辑锚点（脚底 origin）对齐到地面高度 */
    snapFeetToGroundY(groundY) {
        if (!this.logic?.sprite) return;
        this.logic.sprite.y = groundY;
        const body = this.logic.body;
        if (body) {
            body.updateFromGameObject();
            body.setVelocity(0, 0);
        }
        this.syncView();
    }

    syncView() {
        this.view.syncFromLogic(this.logic);
    }

    get x() { return this.logic.x; }
    get y() { return this.logic.y; }
    get body() { return this.logic.body; }

    update(time, delta, player) {
        if (!this.alive) return;
        const dx = player.x - this.x;
        this.facing = dx >= 0 ? 1 : -1;
        this.view.setFlipX(this.facing < 0);

        if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
            this.enterPhase2();
        }

        const dist = Math.abs(dx);
        const stopDistance = this.config.stopDistance || 220;
        if (dist > stopDistance) {
            this.logic.setVelocityX(this.facing * (this.config.speed || 80));
        } else {
            this.logic.setVelocityX(0);
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
        this.logic.setVelocity(this.facing * 220, -700);
        scene.time.delayedCall(600, () => {
            if (!this.alive) return;
            Effects.shake(scene, 240, 0.018);
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
        Effects.playMonsterHitSfx(this.scene);
        this.hp = Math.max(0, this.hp - amount);
        this._syncBossBar();
        this.view.setTint(0xffffff);
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
        scene.time.delayedCall(1200, () => {
            this.view.destroy();
            this.logic.destroy();
        });
        scene.onBossDefeated && scene.onBossDefeated();
    }
}
