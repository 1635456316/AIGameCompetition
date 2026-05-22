/**
 * Boss：单一实体 + 两阶段，技能池调度，作为框架可扩展。
 */
class Boss {
    constructor(scene, x, y, config) {
        this.scene = scene;
        this.config = config || BossConfigs.mechanicalDino;
        this.sprite = scene.physics.add.sprite(x, y, 'boss_default');
        this.sprite.setOrigin(0.5, 1);
        this.sprite.setCollideWorldBounds(true);
        this.sprite.body.setSize(120, 158);
        this.sprite.body.setOffset(20, 2);
        this.sprite.body.setAllowGravity(true);
        this.sprite.owner = this;
        this.sprite.setTint(this.config.tint || Palette.boss);

        this.maxHp = this.config.hp || 800;
        this.hp = this.maxHp;
        this.alive = true;
        this.phase = 1;
        this.facing = -1;
        this.nextSkillAt = scene.time.now + 1500;
        this.contactDamage = this.config.contactDamage || 14;

        // HUD blood bar
        this.bossBarBg = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 36, 800, 22, 0x000000, 0.7)
            .setScrollFactor(0).setDepth(1000);
        this.bossBarFill = scene.add.rectangle(GAME_WIDTH / 2 - 396, GAME_HEIGHT - 36, 792, 16, Palette.boss)
            .setOrigin(0, 0.5).setScrollFactor(0).setDepth(1000);
        this.bossLabel = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 60, this.config.title || this.config.name || '未知 Boss', {
            font: 'bold 18px Arial', color: PaletteHex.warning
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1000);
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

        // 血条
        this.bossBarFill.width = 792 * Math.max(0, this.hp / this.maxHp);
    }

    enterPhase2() {
        this.phase = 2;
        this.sprite.setTint(this.config.phase2Tint || 0xff5577);
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
        this.hp -= amount;
        this.sprite.setTint(0xffffff);
        this.scene.time.delayedCall(70, () => {
            if (!this.sprite || !this.sprite.setTint) return;
            this.sprite.setTint(this.phase === 2
                ? (this.config.phase2Tint || 0xff5577)
                : (this.config.tint || Palette.boss));
        });
        if (this.hp <= 0) this.die();
    }

    die() {
        this.alive = false;
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
