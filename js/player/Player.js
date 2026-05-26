/**
 * 玩家类。本身是一个 Phaser.GameObjects.Container 的轻量替代——
 * 这里直接持有一个 sprite，外部通过 player.sprite 访问显示对象，
 * 但物理体绑定在 sprite 上，player 自身负责逻辑与状态机。
 */
class Player {
    constructor(scene, x, y) {
        this.scene = scene;
        const idleTex = scene.textures.exists('tex_hero_idle') ? 'tex_hero_idle' : 'hero_jump';
        const idleFrame = scene.textures.exists('tex_hero_idle') ? 'idle_0' : undefined;
        this.sprite = scene.physics.add.sprite(x, y, idleTex, idleFrame);
        this.sprite.setOrigin(0.5, 1);
        if (scene.textures.exists('tex_hero_idle')) {
            this._applySheetHeroBody();
            this._applySheetHeroScale();
        } else {
            this._applyStaticHeroBody();
            this.sprite.setScale(PlayerConfig.heroDisplayHeight / 64);
        }
        this.sprite.setCollideWorldBounds(true);
        this.sprite.setMaxVelocity(800, 1400);
        this.sprite.setDepth(20);
        this.sprite.owner = this;

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
        this.hurtEndAt = 0;
        this.ultEndAt = 0;
        this.invulnerableUntil = 0;
        this.platformDropUntil = 0;
        this._lastDownTapAt = 0;

        this.input = {
            left: false, right: false, down: false, downPressed: false,
            jumpPressed: false, dashPressed: false,
            attackPressed: false, rangedPressed: false, ultimatePressed: false
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
            .add('hurt', HurtState)
            .add('dead', DeadState)
            .add('ultimate', UltimateState);
        this.fsm.change('idle');
    }

    playHeroAnim(animKey, forceRestart = false) {
        if (!this.scene.anims.exists(animKey)) {
            if (animKey !== 'hero_idle') {
                this.playHeroAnim('hero_idle', forceRestart);
            }
            return;
        }
        if (!forceRestart && this._currentHeroAnim === animKey && this.sprite.anims.isPlaying) return;
        this._currentHeroAnim = animKey;
        this.sprite.anims.play(animKey, forceRestart);
        this._applySheetHeroScale();
        this._applySheetHeroBody();
    }

    /** 停在序列帧某一帧（不播放动画） */
    showHeroSheetFrame(textureKey, frameKey) {
        this._currentHeroAnim = null;
        this.sprite.anims.stop();
        this.sprite.setTexture(textureKey, frameKey);
        this._applySheetHeroScale();
        this._applySheetHeroBody();
    }

    showHeroTexture(textureKey) {
        this._currentHeroAnim = null;
        this.sprite.anims.stop();
        this.sprite.setTexture(textureKey);
        const frame = this.sprite.frame;
        const frameH = frame ? frame.height : 64;
        this.sprite.setScale(PlayerConfig.heroDisplayHeight / frameH);
        this._applyStaticHeroBody();
    }

    _applySheetHeroScale() {
        const h = (this.sprite.frame && this.sprite.frame.height) || PlayerConfig.heroFrameHeight;
        this.sprite.setScale(PlayerConfig.heroDisplayHeight / h);
    }

    _applySheetHeroBody() {
        const b = PlayerConfig.heroSheetBody;
        this.sprite.body.setSize(b.width, b.height);
        this.sprite.body.setOffset(b.offsetX, b.offsetY);
    }

    _applyStaticHeroBody() {
        const b = PlayerConfig.heroStaticBody;
        this.sprite.body.setSize(b.width, b.height);
        this.sprite.body.setOffset(b.offsetX, b.offsetY);
    }

    get body() { return this.sprite.body; }
    get x() { return this.sprite.x; }
    get y() { return this.sprite.y; }

    setVelocityX(v) { this.sprite.setVelocityX(v); }
    setVelocityY(v) { this.sprite.setVelocityY(v); }
    setVelocity(x, y) { this.sprite.setVelocity(x, y); }

    onGround() {
        const grounded = this.body.blocked.down || this.body.touching.down;
        if (grounded) this.jumpsRemaining = PlayerConfig.maxJumps;
        return grounded;
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
        return this.scene.time.now - this.lastRangedAt >= PlayerConfig.rangedCooldown
            && this.energy >= PlayerConfig.rangedEnergyCost
            && !this.fsm.is('hurt') && !this.fsm.is('dead') && !this.fsm.is('ultimate');
    }
    canUltimate() {
        return this.energy >= PlayerConfig.ultimateEnergyCost
            && !this.fsm.is('hurt') && !this.fsm.is('dead') && !this.fsm.is('ultimate');
    }

    update(time, delta) {
        this.sprite.setFlipX(this.facing < 0);
        if (this.hp > 0) {
            this.energy = Math.min(PlayerConfig.maxEnergy, this.energy + PlayerConfig.energyRegenRate * delta / 1000);
        }
        this.fsm.update(time, delta);
    }

    feedInput(input) {
        this.input = input;
        this._handlePlatformDropInput(input);
        this.fsm.handleInput(input);
    }

    _handlePlatformDropInput(input) {
        // 离地后必须清空连按计时，否则 A 台点过「下」再跳到 B 台会误触发穿落
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
            // 冲刺中接 J：直接第三段前冲，不占用 1/2 段连击
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
        this.setVelocityY(PlayerConfig.jumpVelocity);
        if (this.jumpsRemaining < PlayerConfig.maxJumps - 1) {
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
        const now = this.scene.time.now;
        if (now < this.invulnerableUntil) return;
        if (this.fsm.is('dead')) return;
        this.hp = Math.max(0, this.hp - amount);
        this.damageTakenCount++;
        this.invulnerableUntil = now + PlayerConfig.invulnAfterHurt;
        if (this.hp <= 0) {
            this.fsm.change('dead');
        } else {
            this.fsm.change('hurt', { fromRight: fromX > this.x });
        }
    }

    spawnDashTrail() {
        const scene = this.scene;
        const useSheet = scene.textures.exists('tex_hero_dash');
        const texKey = useSheet ? 'tex_hero_dash' : 'hero_dash';
        const frameKey = useSheet ? 'dash_0' : undefined;
        let scale = PlayerConfig.heroDisplayHeight / 64;
        if (useSheet) {
            const frame = scene.textures.get('tex_hero_dash').get('dash_0');
            const h = frame ? frame.height : 1024;
            scale = PlayerConfig.heroDisplayHeight / h;
        }

        for (let i = 0; i < 4; i++) {
            scene.time.delayedCall(i * 40, () => {
                if (!this.sprite || !this.sprite.active) return;
                const ghost = scene.add.image(this.x, this.y, texKey, frameKey);
                ghost.setOrigin(0.5, 1);
                ghost.setScale(scale);
                ghost.setFlipX(this.facing < 0);
                ghost.setAlpha(0.45);
                ghost.setDepth(this.sprite.depth - 1);
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
            this.x + this.facing * cfg.meleeOffsetX,
            this.y - cfg.meleeOffsetY,
            cfg.meleeHitWidth,
            cfg.meleeHitHeight,
            this.facing
        );
    }

    fireRanged() {
        const scene = this.scene;
        if (!scene.spawnPlayerBullet) return;
        this.lastRangedAt = scene.time.now;
        this.energy = Math.max(0, this.energy - PlayerConfig.rangedEnergyCost);
        scene.spawnPlayerBullet(this.x + this.facing * 28, this.y - 36, this.facing * PlayerConfig.bulletSpeed);
    }

    fireUltimate() {
        const scene = this.scene;
        if (!scene.spawnPlayerUltimate) return;
        scene.spawnPlayerUltimate(this);
    }
}
