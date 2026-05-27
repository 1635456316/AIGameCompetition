/**
 * 玩家类：逻辑体（碰撞/坐标）与表现层（动画/贴图）分离，数值与状态机仍在此类。
 */
class Player {
    constructor(scene, x, y) {
        this.scene = scene;
        const entityCfg = PlayerConfig.buildEntityConfig(scene);
        this._useSheetVisual = entityCfg.useSheet;

        this.logic = new EntityLogic(scene, x, y, entityCfg.logic);
        this.view = new EntityView(scene, x, y, entityCfg.visual);
        this.logic.sprite.owner = this;
        this.sprite = this.logic.sprite;
        this.viewSprite = this.view.sprite;

        if (this._useSheetVisual) {
            this.view.playAnim('hero_idle', true);
        }

        this.facing = 1;
        this.hp = PlayerConfig.maxHp;
        this.energy = 0;
        this.jumpsRemaining = PlayerConfig.maxJumps;
        this.damageTakenCount = 0;

        this.lastDashAt = -99999;
        this.dashEndAt = 0;
        this.lastAttackAt = -99999;
        this.attackEndAt = 0;
        this.meleeComboStep = 0;
        this.lastMeleeComboAt = 0;
        this.attackDashEndAt = 0;
        this.attackDashBlockedByBoss = false;
        this.attackDashBlockedByWall = false;
        this.attackDashShockwave = null;
        this._attackDashHitTimes = null;
        this.lastRangedAt = -99999;
        this.lastSwordQiAt = -99999;
        this.swordChargeStartAt = 0;
        this.swordChargeRatio = 0;
        this.swordChargeMs = 0;
        this.swordReleaseEndAt = 0;
        this._heroDisplayScaleMult = 1;
        this.hurtEndAt = 0;
        this.ultEndAt = 0;
        this.invulnerableUntil = 0;
        this.platformDropUntil = 0;
        this._lastDownTapAt = 0;
        this._leaveGroundFrames = 0;
        this._landFrames = 0;

        this.input = {
            left: false, right: false, down: false, downPressed: false,
            jumpPressed: false, dashPressed: false,
            attackPressed: false, swordChargePressed: false, swordChargeHeld: false,
            ultimatePressed: false
        };

        this.fsm = new StateMachine(this);
        this.fsm
            .add('idle', IdleState)
            .add('run', RunState)
            .add('jump', JumpState)
            .add('fall', FallState)
            .add('dash', DashState)
            .add('attack', AttackState)
            .add('attackDash', AttackDashState)
            .add('swordCharge', SwordChargeState)
            .add('swordRelease', SwordReleaseState)
            .add('hurt', HurtState)
            .add('dead', DeadState)
            .add('ultimate', UltimateState);
        this.fsm.change('idle');
        this.syncView();
    }

    _preserveFeetWhile(fn) {
        const body = this.logic.body;
        if (!body) {
            fn();
            return;
        }
        const grounded = body.blocked.down || (body.touching.down && body.velocity.y >= -8);
        const prevBottom = body.bottom;
        const feetY = this.logic.y;

        fn();
        body.updateFromGameObject();

        if (grounded) {
            this.logic.sprite.y += prevBottom - body.bottom;
        } else {
            this.logic.sprite.y = feetY;
        }
        body.updateFromGameObject();
        this.syncView();
    }

    syncView() {
        this.view.syncFromLogic(this.logic);
    }

    playHeroAnim(animKey, forceRestart = false) {
        if (!this.scene.anims.exists(animKey)) {
            if (animKey !== 'hero_idle') {
                this.playHeroAnim('hero_idle', forceRestart);
            }
            return;
        }
        this._preserveFeetWhile(() => {
            this.view.playAnim(animKey, forceRestart);
        });
    }

    /** 停在序列帧某一帧（不播放动画） */
    showHeroSheetFrame(textureKey, frameKey) {
        this._preserveFeetWhile(() => {
            this.view.showFrame(textureKey, frameKey);
        });
    }

    showHeroTexture(textureKey) {
        this.view.showTexture(textureKey);
        this.applyStaticHeroBody();
    }

    setHeroDisplayScaleMult(mult) {
        this._heroDisplayScaleMult = mult || 1;
        this.view.setDisplayScaleMult(this._heroDisplayScaleMult);
    }

    isSuperArmored() {
        return this.fsm.is('swordRelease');
    }

    isSwordCharging() {
        return this.fsm.is('swordCharge');
    }

    applySheetHeroBody() {
        this.logic.applyBody(PlayerConfig.heroSheetBody);
    }

    applyStaticHeroBody() {
        this.logic.applyBody(PlayerConfig.heroStaticBody);
    }

    get body() { return this.logic.body; }
    get x() { return this.logic.x; }
    get y() { return this.logic.y; }

    setVelocityX(v) { this.logic.setVelocityX(v); }
    setVelocityY(v) { this.logic.setVelocityY(v); }
    setVelocity(x, y) { this.logic.setVelocity(x, y); }

    onGround() {
        const body = this.body;
        if (!body) return false;
        let grounded = body.blocked.down
            || (body.touching.down && body.velocity.y >= -20 && body.velocity.y <= 80);
        // 单向/坍塌平台：贴地吸附后往往没有 touching.down（坍塌台还有 overlap），需用台面支撑判定
        if (!grounded && this.scene.isPlayerOnPlatform?.(this)) {
            grounded = true;
        }
        if (grounded) {
            this.jumpsRemaining = PlayerConfig.maxJumps;
            this._leaveGroundFrames = 0;
        }
        return grounded;
    }

    isAirborne() {
        if (this.onGround()) return false;
        this._leaveGroundFrames = (this._leaveGroundFrames || 0) + 1;
        return this._leaveGroundFrames >= 3;
    }

    isLanded() {
        if (!this.onGround()) {
            this._landFrames = 0;
            return false;
        }
        this._landFrames = (this._landFrames || 0) + 1;
        return this._landFrames >= 2;
    }

    canDash() {
        return this.scene.time.now - this.lastDashAt >= PlayerConfig.dashCooldown
            && this.energy >= PlayerConfig.dashEnergyCost
            && !this.fsm.is('dash') && !this.fsm.is('hurt') && !this.fsm.is('dead');
    }
    canAttack() {
        return this.scene.time.now - this.lastAttackAt >= PlayerConfig.attackCooldown
            && !this.fsm.is('hurt') && !this.fsm.is('dead') && !this.fsm.is('ultimate')
            && !this.fsm.is('attackDash');
    }
    canRanged() {
        return this.canStartSwordCharge();
    }
    canStartSwordCharge() {
        return this.scene.time.now - this.lastSwordQiAt >= PlayerConfig.swordQiCooldown
            && this.energy >= PlayerConfig.swordQiEnergyCostMin
            && !this.fsm.is('hurt') && !this.fsm.is('dead') && !this.fsm.is('ultimate')
            && !this.fsm.is('attack') && !this.fsm.is('attackDash') && !this.fsm.is('dash')
            && !this.fsm.is('swordCharge') && !this.fsm.is('swordRelease');
    }
    canReleaseSwordCharge() {
        return this.getSwordChargeRatio() > 0;
    }
    getSwordChargeRatio() {
        if (!this.swordChargeStartAt) return 0;
        const rawMs = this.scene.time.now - this.swordChargeStartAt;
        if (rawMs <= PlayerConfig.swordChargeMinMs) return 0;
        return Phaser.Math.Clamp(
            (rawMs - PlayerConfig.swordChargeMinMs)
                / (PlayerConfig.swordChargeMaxMs - PlayerConfig.swordChargeMinMs),
            0,
            1
        );
    }
    getSwordChargeProgress() {
        if (!this.swordChargeStartAt) return 0;
        const rawMs = this.scene.time.now - this.swordChargeStartAt;
        return Phaser.Math.Clamp(rawMs / PlayerConfig.swordChargeMaxMs, 0, 1);
    }
    getSwordChargeMs() {
        if (!this.swordChargeStartAt) return 0;
        return Math.min(
            this.scene.time.now - this.swordChargeStartAt,
            PlayerConfig.swordChargeMaxMs
        );
    }
    getSwordQiEnergyCost(ratio) {
        return Phaser.Math.Linear(
            PlayerConfig.swordQiEnergyCostMin,
            PlayerConfig.swordQiEnergyCostMax,
            ratio
        );
    }
    startSwordCharge() {
        if (!this.canStartSwordCharge()) return false;
        this.fsm.change('swordCharge');
        return true;
    }
    releaseSwordCharge() {
        this.swordChargeMs = this.getSwordChargeMs();
        this.swordChargeRatio = this.getSwordChargeRatio();
        const cost = this.getSwordQiEnergyCost(this.swordChargeRatio);
        if (this.energy >= cost) {
            this.energy -= cost;
        } else {
            this.energy = 0;
        }
        this.lastSwordQiAt = this.scene.time.now;
        this.fsm.change('swordRelease');
    }

    /** L 键取消蓄力：不释放剑气、不扣能量 */
    cancelSwordCharge() {
        if (!this.fsm.is('swordCharge')) return;
        this.swordChargeStartAt = 0;
        this.swordChargeRatio = 0;
        this.swordChargeMs = 0;
        this.setHeroDisplayScaleMult(1);
        this.fsm.change(this.onGround() ? 'idle' : 'fall');
    }
    canUltimate() {
        return this.energy >= PlayerConfig.ultimateEnergyCost
            && !this.fsm.is('hurt') && !this.fsm.is('dead') && !this.fsm.is('ultimate');
    }

    update(time, delta) {
        this.view.setFlipX(this.facing < 0);
        if (this.hp > 0) {
            const regenMult = GameDebug.showHitboxes ? 20 : 1;
            this.energy = Math.min(
                PlayerConfig.maxEnergy,
                this.energy + PlayerConfig.energyRegenRate * regenMult * delta / 1000
            );
        }
        this.fsm.update(time, delta);
    }

    feedInput(input) {
        this.input = input;
        this._handlePlatformDropInput(input);
        this.fsm.handleInput(input);
    }

    _handlePlatformDropInput(input) {
        if (!this.scene.isStandingOnPlatform?.(this)) {
            this._lastDownTapAt = 0;
            if (!input.downPressed) return;
            return;
        }
        if (!input.downPressed) return;
        const now = this.scene.time.now;
        if (this._lastDownTapAt && now - this._lastDownTapAt <= PlayerConfig.platformDropTapWindow) {
            this.platformDropUntil = now + PlayerConfig.platformDropDuration;
            this._lastDownTapAt = 0;
            this.setVelocityY(Math.max(this.body.velocity.y, 120));
        } else {
            this._lastDownTapAt = now;
        }
    }

    handleJumpInput(input) {
        if (!input.jumpPressed || this.jumpsRemaining <= 0) return false;
        this.fsm.change('jump');
        return true;
    }

    prepareMeleeCombo() {
        const now = this.scene.time.now;
        if (now - this.lastMeleeComboAt > PlayerConfig.attackComboWindow) {
            this.meleeComboStep = 0;
        }
        this.meleeComboStep = (this.meleeComboStep % 3) + 1;
        this.lastMeleeComboAt = now;
        return this.meleeComboStep;
    }

    startMeleeAttack(fromDash = false) {
        if (!this.canAttack()) return false;
        const now = this.scene.time.now;
        let step;
        if (fromDash) {
            step = 3;
            this.meleeComboStep = 3;
            this.lastMeleeComboAt = now;
        } else {
            step = this.prepareMeleeCombo();
        }
        this.fsm.change(step === 3 ? 'attackDash' : 'attack');
        return true;
    }

    resetMeleeCombo() {
        this.meleeComboStep = 0;
        this.lastMeleeComboAt = 0;
    }

    gainEnergy(v) {
        this.energy = Phaser.Math.Clamp(this.energy + v, 0, PlayerConfig.maxEnergy);
    }

    performJump() {
        this.jumpsRemaining--;
        const isSecondJump = this.jumpsRemaining < PlayerConfig.maxJumps - 1;
        this.setVelocityY(isSecondJump ? PlayerConfig.secondJumpVelocity : PlayerConfig.jumpVelocity);
        if (isSecondJump) {
            const emitter = this.scene.add.particles(this.x, this.y - 4, 'particle_energy', {
                speed: { min: 40, max: 100 },
                angle: { min: 240, max: 300 },
                scale: { start: 0.8, end: 0 },
                lifespan: 260,
                quantity: 6,
                blendMode: 'ADD'
            });
            this.scene.time.delayedCall(60, () => emitter.stop());
            this.scene.time.delayedCall(400, () => emitter.destroy());
        }
    }

    takeDamage(amount, fromX) {
        if (this.fsm.is('dead')) return;
        if (this.isSuperArmored()) return;

        const now = this.scene.time.now;
        const charging = this.isSwordCharging();
        if (!charging && now < this.invulnerableUntil) return;

        if (charging) {
            amount *= PlayerConfig.swordChargeDamageMult;
        }

        this.hp = Math.max(0, this.hp - amount);
        this.damageTakenCount++;

        if (this.hp <= 0) {
            this.fsm.change('dead');
            return;
        }

        if (charging) {
            this.view.setTint(0xff8888);
            this.scene.time.delayedCall(90, () => {
                if (this.viewSprite.active && this.isSwordCharging()) {
                    this.view.clearTint();
                }
            });
            return;
        }

        this.invulnerableUntil = now + PlayerConfig.invulnAfterHurt;
        this.fsm.change('hurt', { fromRight: fromX > this.x });
    }

    heal(amount) {
        if (this.hp <= 0) return;
        this.hp = Math.min(PlayerConfig.maxHp, this.hp + amount);
    }

    spawnDashTrail() {
        const scene = this.scene;
        const useSheet = scene.textures.exists('tex_hero_dash');
        const texKey = useSheet ? 'tex_hero_dash' : 'hero_dash';
        const frameKey = useSheet ? 'dash_0' : undefined;
        let scale = PlayerConfig.heroDisplayHeight / 64;
        if (useSheet) {
            const frame = scene.textures.get('tex_hero_dash').get('dash_0');
            const h = frame ? frame.height : PlayerConfig.heroFrameHeight;
            scale = PlayerConfig.heroDisplayHeight / h;
        }

        for (let i = 0; i < 4; i++) {
            scene.time.delayedCall(i * 40, () => {
                if (!this.logic.sprite || !this.logic.sprite.active) return;
                const ghost = scene.add.image(this.x, this.y, texKey, frameKey);
                ghost.setOrigin(0.5, 1);
                ghost.setScale(scale);
                ghost.setFlipX(this.facing < 0);
                ghost.setAlpha(0.45);
                ghost.setDepth(this.viewSprite.depth - 1);
                if (!useSheet) ghost.setTint(Palette.hero);
                scene.tweens.add({
                    targets: ghost,
                    alpha: 0,
                    duration: 220,
                    onComplete: () => ghost.destroy()
                });
            });
        }
    }

    spawnMeleeHitbox() {
        const scene = this.scene;
        if (!scene.spawnPlayerMelee) return;
        const cfg = PlayerConfig;
        scene.spawnPlayerMelee(
            this.x + this.facing * cfg.meleeHitOffsetX,
            this.y - cfg.meleeHitOffsetY,
            cfg.meleeHitWidth,
            cfg.meleeHitHeight,
            this.facing
        );
    }

    _playSfx(key) {
        const scene = this.scene;
        const sound = scene?.game?.sound || scene?.sound;
        const cache = scene?.game?.cache?.audio || scene?.cache?.audio;
        if (!sound || !cache?.exists(key)) return;

        const volume = SaveSystem.getVolume();
        if (volume <= 0) return;

        try {
            const ctx = sound.context;
            if (ctx?.state === 'suspended' && typeof ctx.resume === 'function') {
                ctx.resume();
            }
        } catch (e) {}

        try {
            const sfx = sound.add(key, { volume, loop: false, destroy: true });
            sfx.play();
        } catch (e) {
            console.warn('[Player] 播放音效失败:', key, e);
        }
    }

    playPunchSfx() {
        this._playSfx('sfx_punch');
    }

    playDashSfx() {
        this._playSfx('sfx_dash');
    }

    startChargeSfx() {
        this.stopChargeSfx();
        const scene = this.scene;
        const sound = scene?.game?.sound || scene?.sound;
        const cache = scene?.game?.cache?.audio || scene?.cache?.audio;
        if (!sound || !cache?.exists('sfx_charge')) return;

        const volume = SaveSystem.getVolume();
        if (volume <= 0) return;

        try {
            const ctx = sound.context;
            if (ctx?.state === 'suspended' && typeof ctx.resume === 'function') {
                ctx.resume();
            }
        } catch (e) {}

        try {
            this._chargeSfx = sound.add('sfx_charge', { volume, loop: true });
            this._chargeSfx.play();
        } catch (e) {
            console.warn('[Player] 播放 sfx_charge 失败', e);
        }
    }

    stopChargeSfx() {
        const sfx = this._chargeSfx;
        this._chargeSfx = null;
        if (!sfx) return;
        try { sfx.stop(); } catch (e) {}
        try { sfx.destroy(); } catch (e) {}
    }

    startUltimateChargeSfx() {
        this.stopUltimateChargeSfx();
        const scene = this.scene;
        const sound = scene?.game?.sound || scene?.sound;
        const cache = scene?.game?.cache?.audio || scene?.cache?.audio;
        if (!sound || !cache?.exists('sfx_ultimate_charge')) return;

        const volume = Math.min(1, SaveSystem.getVolume() * (PlayerConfig.ultimateChargeSfxVolume ?? 1));
        if (volume <= 0) return;

        try {
            const ctx = sound.context;
            if (ctx?.state === 'suspended' && typeof ctx.resume === 'function') {
                ctx.resume();
            }
        } catch (e) {}

        try {
            this._ultimateChargeSfx = sound.add('sfx_ultimate_charge', { volume, loop: true });
            this._ultimateChargeSfx.play();
        } catch (e) {
            console.warn('[Player] 播放 sfx_ultimate_charge 失败', e);
        }
    }

    stopUltimateChargeSfx() {
        const sfx = this._ultimateChargeSfx;
        this._ultimateChargeSfx = null;
        if (!sfx) return;
        try { sfx.stop(); } catch (e) {}
        try { sfx.destroy(); } catch (e) {}
    }

    startUltimateFireSfx() {
        this.stopUltimateFireSfx();
        const scene = this.scene;
        const sound = scene?.game?.sound || scene?.sound;
        const cache = scene?.game?.cache?.audio || scene?.cache?.audio;
        if (!sound || !cache?.exists('sfx_ultimate_fire')) return;

        const volume = Math.min(1, SaveSystem.getVolume() * (PlayerConfig.ultimateFireSfxVolume ?? 1));
        if (volume <= 0) return;

        try {
            const ctx = sound.context;
            if (ctx?.state === 'suspended' && typeof ctx.resume === 'function') {
                ctx.resume();
            }
        } catch (e) {}

        try {
            this._ultimateFireSfx = sound.add('sfx_ultimate_fire', { volume, loop: false, destroy: true });
            this._ultimateFireSfx.play();
        } catch (e) {
            console.warn('[Player] 播放 sfx_ultimate_fire 失败', e);
        }
    }

    stopUltimateFireSfx() {
        const sfx = this._ultimateFireSfx;
        this._ultimateFireSfx = null;
        if (!sfx) return;
        try { sfx.stop(); } catch (e) {}
        try { sfx.destroy(); } catch (e) {}
    }

    spawnSwordQi(ratio) {
        const scene = this.scene;
        if (!scene.spawnPlayerSwordQi) return;
        this.playPunchSfx();
        const cfg = PlayerConfig;
        scene.spawnPlayerSwordQi(
            this.x + this.facing * Phaser.Math.Linear(cfg.swordQiSpawnOffsetXMin, cfg.swordQiSpawnOffsetXMax, ratio),
            this.y - cfg.swordQiOffsetY,
            this.facing,
            {
                damage: Phaser.Math.Linear(cfg.swordQiMinDamage, cfg.swordQiMaxDamage, ratio),
                scale: Phaser.Math.Linear(cfg.swordQiMinScale, cfg.swordQiMaxScale, ratio),
                speed: Phaser.Math.Linear(cfg.swordQiMinSpeed, cfg.swordQiMaxSpeed, ratio),
                maxRange: Phaser.Math.Linear(cfg.swordQiMinRange, cfg.swordQiMaxRange, ratio),
                pierce: (this.swordChargeMs || 0) >= cfg.swordQiPierceChargeMs
            }
        );
    }

    fireRanged() {
        this.startSwordCharge();
    }

    fireUltimate() {
        const scene = this.scene;
        if (!scene.spawnPlayerUltimate) return;
        scene.spawnPlayerUltimate(this);
    }
}
