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
        this.lastRangedAt = -99999;
        this.hurtEndAt = 0;
        this.ultEndAt = 0;
        this.invulnerableUntil = 0;

        this.input = {
            left: false, right: false,
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
            .add('hurt', HurtState)
            .add('dead', DeadState)
            .add('ultimate', UltimateState);
        this.fsm.change('idle');
    }

    playHeroAnim(animKey) {
        if (!this.scene.anims.exists(animKey)) {
            this.showHeroTexture('hero_jump');
            return;
        }
        if (this._currentHeroAnim === animKey && this.sprite.anims.isPlaying) return;
        this._currentHeroAnim = animKey;
        this._applySheetHeroScale();
        this._applySheetHeroBody();
        this.sprite.anims.play(animKey, true);
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
        this.sprite.setScale(PlayerConfig.heroDisplayHeight / PlayerConfig.heroFrameHeight);
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
            && !this.fsm.is('hurt') && !this.fsm.is('dead') && !this.fsm.is('ultimate');
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
        this.fsm.handleInput(input);
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
        for (let i = 0; i < 4; i++) {
            scene.time.delayedCall(i * 40, () => {
                const ghost = scene.add.image(this.x, this.y - 32, 'hero_dash');
                ghost.setOrigin(0.5, 0.5);
                ghost.setFlipX(this.facing < 0);
                ghost.setAlpha(0.5);
                ghost.setTint(Palette.hero);
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
        const offsetX = this.facing * 44;
        scene.spawnPlayerMelee(this.x + offsetX, this.y - 32, 64, 48, this.facing);
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
