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
        this.contactDamage = this.config.contactDamage ?? 14;
        this.skillState = null;

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

        if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
            this.enterPhase2();
        }

        if (this._updateSkill(time, player)) {
            if (!(this.skillState === 'jumpSlam' && this._jumpSlamPhase === 'air')) {
                this.syncView();
            }
            this._syncBossBar();
            return;
        }

        this.view.setFlipX(this.facing < 0);

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

        this.syncView();
        this._syncBossBar();
    }

    _skillCfg(name) {
        return this.config.skills?.[name] || {};
    }

    _endSkill(opts = {}) {
        Effects.stopBossChargeFx(this, opts);
        if (this.skillState === 'jumpSlam') {
            this._setJumpSlamAirMode(false);
        }
        this._clearJumpSlamMarker();
        this._restoreJumpSlamPhysics();
        this.skillState = null;
        this._jumpSlamPhase = null;
        this._jumpSlamLeftGround = false;
        this._jumpSlamTargetX = null;
        this._jumpSlamTargetY = null;
        this._jumpSlamGroundY = null;
        this._jumpSlamMarkerPlayer = null;
        this._chargePhase = null;
        this.logic.setVelocityX(0);
    }

    _restoreJumpSlamPhysics() {
        this._setJumpSlamAirMode(false);
        if (this.logic?.body) {
            this.logic.body.setAllowGravity(true);
            this.logic.body.setVelocity(0, 0);
        }
    }

    /** 跳跃砸地空中：关闭物理体，避免与脚本轨迹冲突 */
    _setJumpSlamAirMode(active) {
        const body = this.logic?.body;
        if (!body) return;

        if (active) {
            if (this._jumpSlamSavedBody) return;
            this._jumpSlamSavedBody = {
                enable: body.enable,
                allowGravity: body.allowGravity
            };
            body.setAllowGravity(false);
            body.setVelocity(0, 0);
            body.enable = false;
            return;
        }

        const saved = this._jumpSlamSavedBody;
        if (!saved) return;
        body.enable = true;
        body.setAllowGravity(saved.allowGravity);
        body.reset(this.logic.sprite.x, this.logic.sprite.y);
        body.updateFromGameObject();
        this._jumpSlamSavedBody = null;
    }

    /** 查询 x 处可站立的地面高度（逻辑锚点 y，即脚底） */
    _findGroundFeetYAt(x, refFeetY) {
        const scene = this.scene;
        const defaultY = scene.levelHeight - 64;
        const refY = refFeetY ?? this.y;
        let bestTop = null;
        let bestScore = Infinity;

        const visit = (group) => {
            group?.children?.iterate((block) => {
                const body = block?.body;
                if (!body) return;
                const pad = 40;
                if (x < body.left - pad || x > body.right + pad) return;
                const top = body.top;
                if (top > refY + 56) return;
                const score = Math.abs(top - refY);
                if (score < bestScore) {
                    bestScore = score;
                    bestTop = top;
                }
            });
        };

        visit(scene.groundSolids);
        visit(scene.platforms);
        return bestTop ?? defaultY;
    }

    _clampJumpSlamTargetX(x) {
        const scene = this.scene;
        const margin = 100;
        const maxX = (scene.levelWidth || GAME_WIDTH) - margin;
        return Phaser.Math.Clamp(x, margin, maxX);
    }

    _clearJumpSlamMarker() {
        if (this._jumpSlamMarker) {
            this._jumpSlamMarker.destroy();
            this._jumpSlamMarker = null;
        }
    }

    _updateJumpSlamMarker(time) {
        if (this._jumpSlamTargetX == null) return;
        const scene = this.scene;
        const markerY = this._jumpSlamTargetY ?? this._jumpSlamGroundY ?? (scene.levelHeight - 64);
        const cfg = this._skillCfg('jumpSlam');
        const radius = cfg.radius || 210;
        const pulse = 0.5 + 0.5 * Math.sin(time * 0.013);

        if (!this._jumpSlamMarker) {
            this._jumpSlamMarker = scene.add.graphics().setDepth(12);
        }
        const g = this._jumpSlamMarker;
        g.clear();
        g.fillStyle(Palette.danger, 0.1 + pulse * 0.14);
        g.fillEllipse(this._jumpSlamTargetX, markerY - 6, radius * 1.05, radius * 0.42);
        g.lineStyle(3, Palette.warning, 0.32 + pulse * 0.42);
        g.strokeEllipse(this._jumpSlamTargetX, markerY - 6, radius * 1.05, radius * 0.42);
        g.lineStyle(2, Palette.danger, 0.45 + pulse * 0.35);
        g.strokeEllipse(this._jumpSlamTargetX, markerY - 6, radius * 0.62, radius * 0.26);
    }

    _launchJumpSlam(cfg, player) {
        const scene = this.scene;
        this._jumpSlamStartX = this.x;
        this._jumpSlamStartY = this.y;
        this._jumpSlamTargetY = this._findGroundFeetYAt(this._jumpSlamTargetX, player?.y ?? this.y);
        this._jumpSlamArcHeight = cfg.arcHeight || 300;
        this._jumpSlamAirDuration = cfg.airDurationMs || 950;
        this._jumpSlamAirStart = scene.time.now;
        this._jumpSlamPhase = 'air';
        this._jumpSlamLeftGround = false;

        const dx = this._jumpSlamTargetX - this.x;
        this.facing = dx >= 0 ? 1 : -1;
        this.view.setFlipX(this.facing < 0);
        this._setJumpSlamAirMode(true);
    }

    _updateSkill(time, player) {
        if (!this.skillState) return false;
        if (this.skillState === 'jumpSlam') return this._updateJumpSlam(time, player);
        if (this.skillState === 'charge') return this._updateCharge(time, player);
        this._endSkill();
        return false;
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
        if (this.skillState) return;
        const pool = this.phase === 1
            ? (this.config.phase1Skills || ['spread', 'tri'])
            : (this.config.phase2Skills || ['spread', 'tri', 'slam']);
        const choice = Phaser.Utils.Array.GetRandom(pool);
        if (choice === 'spread') this.skillSpread();
        else if (choice === 'tri') this.skillTri();
        else if (choice === 'slam') this.skillSlam(player);
        else if (choice === 'rain') this.skillRain(player);
        else if (choice === 'jumpSlam') this.skillJumpSlam(player);
        else if (choice === 'charge') this.skillCharge(player);
    }

    skillJumpSlam(player) {
        if (this.skillState) return;
        const cfg = this._skillCfg('jumpSlam');
        const scene = this.scene;
        this.skillState = 'jumpSlam';
        this._jumpSlamPhase = 'windup';
        this._jumpSlamPhaseEnd = scene.time.now + (cfg.windupMs || 420);
        this._skillTimeout = scene.time.now + (cfg.maxDurationMs || 2600);
        this._jumpSlamGroundY = this.y;
        this._jumpSlamTargetX = this._clampJumpSlamTargetX(player.x);
        this._jumpSlamTargetY = this._findGroundFeetYAt(this._jumpSlamTargetX, player.y);
        this.facing = player.x >= this.x ? 1 : -1;
        this.view.setFlipX(this.facing < 0);
        this.logic.setVelocity(0, 0);
    }

    _updateJumpSlam(time, player) {
        const cfg = this._skillCfg('jumpSlam');

        if (this._jumpSlamPhase === 'windup') {
            this.logic.setVelocity(0, 0);
            this._jumpSlamTargetX = this._clampJumpSlamTargetX(player.x);
            this._jumpSlamTargetY = this._findGroundFeetYAt(this._jumpSlamTargetX, player.y);
            this._updateJumpSlamMarker(time);
            if (time >= this._jumpSlamPhaseEnd) {
                this._launchJumpSlam(cfg, player);
            }
            return true;
        }

        this._jumpSlamMarkerPlayer = player;
        this._updateJumpSlamMarker(time);
        return true;
    }

    /** 物理步结束后应用跳跃轨迹（避免 update → physics → syncView 链路造成上下抖动） */
    syncJumpSlamFrame(time, player) {
        if (this.skillState !== 'jumpSlam' || this._jumpSlamPhase !== 'air') return;

        const cfg = this._skillCfg('jumpSlam');
        const refPlayer = player || this._jumpSlamMarkerPlayer;

        const elapsed = time - this._jumpSlamAirStart;
        const t = Phaser.Math.Clamp(elapsed / this._jumpSlamAirDuration, 0, 1);
        const x = Phaser.Math.Linear(this._jumpSlamStartX, this._jumpSlamTargetX, t);
        const linearY = Phaser.Math.Linear(this._jumpSlamStartY, this._jumpSlamTargetY, t);
        const y = linearY - this._jumpSlamArcHeight * 4 * t * (1 - t);

        this.logic.setPosition(x, y);
        this.syncView();

        if (t > 0.04) {
            this._jumpSlamLeftGround = true;
        }

        if (t >= 1) {
            this._setJumpSlamAirMode(false);
            this.snapFeetToGroundY(this._jumpSlamTargetY);
            this._jumpSlamImpact(refPlayer, cfg);
            this._endSkill();
            return;
        }

        if (time >= this._skillTimeout) {
            this._setJumpSlamAirMode(false);
            this.snapFeetToGroundY(this._jumpSlamTargetY ?? this._jumpSlamGroundY);
            this._jumpSlamImpact(refPlayer, cfg);
            this._endSkill();
        }
    }

    _jumpSlamImpact(player, cfg) {
        const scene = this.scene;
        const radius = cfg.radius || 210;
        const damage = cfg.damage || 18;
        Effects.shake(scene, 320, 0.022);
        Effects.explosion(scene, this.x, this.y - 20, 1.35, true);

        if (scene._playerIsPhasing?.() || !player?.body) return;
        const dx = player.x - this.x;
        const dy = (player.y - 28) - (this.y - 40);
        if (Math.abs(dx) <= radius && Math.abs(dy) <= radius * 0.65) {
            scene._damagePlayer(damage, this.x);
            Effects.hitFlash(scene, player.x, player.y - 24);
        }
    }

    skillCharge(player) {
        if (this.skillState) return;
        const cfg = this._skillCfg('charge');
        const scene = this.scene;
        this.skillState = 'charge';
        this._chargePhase = 'windup';
        this._chargeDir = player.x >= this.x ? 1 : -1;
        this._chargeHitPlayer = false;
        this.facing = this._chargeDir;
        this.view.setFlipX(this.facing < 0);
        this._chargePhaseEnd = scene.time.now + (cfg.windupMs || 480);
        this._chargeEndAt = 0;
        this.logic.setVelocity(0, 0);
        Effects.startBossChargeFx(this, this._chargeDir);
    }

    _updateCharge(time, player) {
        const cfg = this._skillCfg('charge');
        const scene = this.scene;
        const body = this.logic.body;

        Effects.updateBossChargeFx(this, time);

        if (this._chargePhase === 'windup') {
            this.logic.setVelocity(0, 0);
            if (time >= this._chargePhaseEnd) {
                this._chargePhase = 'dash';
                this._chargeEndAt = time + (cfg.durationMs || 680);
                this.logic.setVelocityX(this._chargeDir * (cfg.speed || 440));
                Effects.beginBossChargeDash(this);
            }
            return true;
        }

        if (this._chargePhase === 'dash') {
            if (!this._chargeHitPlayer && player?.body && body) {
                const bossRect = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
                const playerRect = new Phaser.Geom.Rectangle(
                    player.body.x, player.body.y, player.body.width, player.body.height
                );
                if (Phaser.Geom.Intersects.RectangleToRectangle(bossRect, playerRect)) {
                    if (!scene._playerIsPhasing?.()) {
                        scene._damagePlayer(cfg.damage || 16, this.x);
                        Effects.hitFlash(scene, player.x, player.y - 24);
                    }
                    this._chargeHitPlayer = true;
                }
            }

            if (body && (body.blocked.left || body.blocked.right)) {
                this._endSkill({ wallImpact: true });
                return true;
            }

            if (time >= this._chargeEndAt) {
                this._endSkill();
            }
            return true;
        }

        this._endSkill();
        return false;
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
        this.hp = Math.max(0, this.hp - amount);
        this._syncBossBar();
        this.view.setTint(0xffffff);
        this.scene.time.delayedCall(70, () => this._restoreBossTint());
        if (this.hp <= 0) {
            this.die();
            return;
        }
        Effects.playMonsterHitSfx(this.scene);
    }

    die() {
        this.alive = false;
        Effects.stopBossChargeFx(this);
        this._clearJumpSlamMarker();
        this._restoreJumpSlamPhysics();
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
