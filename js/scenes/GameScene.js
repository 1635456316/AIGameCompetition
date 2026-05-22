class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    init(data) {
        this.levelId = data?.levelId || 1;
        this.levelConfig = LevelConfigs.find(level => level.id === this.levelId) || LevelConfigs[0];
    }

    create() {
        const W = GAME_WIDTH;
        const H = GAME_HEIGHT;
        this.levelWidth = this.levelConfig.width || 3200;
        this.levelHeight = H;

        this.physics.world.setBounds(0, 0, this.levelWidth, this.levelHeight);
        this.cameras.main.setBounds(0, 0, this.levelWidth, this.levelHeight);

        // 视差背景
        this.bgFar  = this.add.tileSprite(0, 0, this.levelWidth, H, 'bg_far').setOrigin(0).setScrollFactor(0.1);
        this.bgMid  = this.add.tileSprite(0, 0, this.levelWidth, H, 'bg_mid').setOrigin(0).setScrollFactor(0.35);
        this.bgNear = this.add.tileSprite(0, 0, this.levelWidth, H, 'bg_near').setOrigin(0).setScrollFactor(0.6);

        // 平台组
        this.solids = this.physics.add.staticGroup();
        this._buildLevel();

        // 玩家
        const start = this.levelConfig.playerStart || { x: 160, yOffset: 120 };
        this.player = new Player(this, start.x, H - start.yOffset);
        this.physics.add.collider(this.player.sprite, this.solids);

        // 输入
        this.inputCtl = new InputController(this);

        // 敌人组
        this.enemies = [];
        this.enemySprites = this.physics.add.group();
        this._spawnEnemies();
        this.physics.add.collider(this.enemySprites, this.solids);

        // 子弹组
        this.playerBullets = this.physics.add.group();
        this.enemyBullets = this.physics.add.group();
        this.playerMelees = this.physics.add.group(); // 一次性 hitbox

        // 碰撞 / 重叠规则
        this.physics.add.overlap(this.playerBullets, this.enemySprites, (b, eSpr) => {
            const enemy = eSpr.owner;
            if (enemy && enemy.alive) {
                enemy.takeDamage(15, b.x);
                Effects.hitFlash(this, b.x, b.y);
                this.player.gainEnergy(4 * this.hud.getEnergyMultiplier());
                this.hud.addCombo(this.time.now);
            }
            b.destroy();
        });
        this.physics.add.overlap(this.enemyBullets, this.player.sprite, (a, b) => {
            const bullet = this.enemyBullets.contains(a) ? a : (this.enemyBullets.contains(b) ? b : null);
            if (!bullet || !bullet.active) return;
            this._damagePlayer(8, bullet.x);
            Effects.hitFlash(this, bullet.x, bullet.y);
            bullet.destroy();
        });
        this.physics.add.overlap(this.playerMelees, this.enemySprites, (m, eSpr) => {
            const enemy = eSpr.owner;
            if (!enemy || !enemy.alive) return;
            if (m._hitSet && m._hitSet.has(enemy)) return;
            (m._hitSet = m._hitSet || new Set()).add(enemy);
            enemy.takeDamage(25, m.x);
            Effects.hitFlash(this, enemy.x, enemy.y - 24);
            Effects.shake(this, 90, 0.008);
            Effects.hitStop(this, 50);
            this.player.gainEnergy(6 * this.hud.getEnergyMultiplier());
            this.hud.addCombo(this.time.now);
        });
        this.physics.add.overlap(this.enemySprites, this.player.sprite, (eSpr, pSpr) => {
            const enemy = eSpr.owner;
            if (!enemy || !enemy.alive) return;
            this._damagePlayer(enemy.contactDamage, enemy.x);
        });

        // Boss（关卡尾部触发）
        this.boss = null;
        this.bossTriggered = false;
        this.paused = false;
        this.startTime = this.time.now;

        // HUD
        this.hud = new HUD(this, this.player);

        // 镜头
        this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12);
        this.cameras.main.setDeadzone(120, 80);

        // 玩家击杀回调
        this.onEnemyKilled = (enemy) => {
            this.player.gainEnergy(10);
            this.hud.addScore(100);
        };
        this.onBossDefeated = () => {
            SaveSystem.completeLevel(this.levelId);
            const isFinal = this.levelId >= LevelConfigs.length;
            const timeSec = Math.floor((this.time.now - this.startTime) / 1000);
            this.time.delayedCall(2200, () => {
                if (isFinal) {
                    this.scene.start('ResultScene', {
                        levelId: this.levelId,
                        score: this.hud.score,
                        maxCombo: this.hud.maxCombo,
                        timeSec: timeSec,
                        damageTaken: this.player.damageTakenCount,
                        isFinal: true
                    });
                } else {
                    this.scene.start('ResultScene', {
                        levelId: this.levelId,
                        score: this.hud.score,
                        maxCombo: this.hud.maxCombo,
                        timeSec: timeSec,
                        damageTaken: this.player.damageTakenCount,
                        isFinal: false
                    });
                }
            });
        };
        this.onPlayerDead = () => {
            this.time.delayedCall(800, () => {
                this.add.text(this.cameras.main.scrollX + GAME_WIDTH / 2,
                              this.cameras.main.scrollY + GAME_HEIGHT / 2,
                              '失败  按 R 重试 / ESC 返回菜单', {
                    font: 'bold 36px Arial', color: PaletteHex.danger,
                    stroke: '#000', strokeThickness: 6
                }).setOrigin(0.5).setScrollFactor(0).setDepth(2000);
            });
        };

        // 暂停菜单
        this.pauseMenu = new PauseMenu(this);

        // 系统快捷键
        this.input.keyboard.on('keydown-ESC', () => {
            if (this.paused) {
                this.pauseMenu.hide();
            } else {
                this.pauseMenu.show();
            }
        });
        this.input.keyboard.on('keydown-R', () => {
            if (!this.paused) this.scene.restart();
        });

        // 关卡机关
        this.hazards = Hazards.spawn(this, this.levelConfig);

        Effects.bigText(this, this.levelConfig.title, PaletteHex.warning);
    }

    _buildLevel() {
        const tile = 64;
        const groundY = this.levelHeight - tile;

        // 地面（用静态矩形 + 贴图覆盖）
        const groundCount = Math.ceil(this.levelWidth / tile);
        for (let i = 0; i < groundCount; i++) {
            const x = i * tile + tile / 2;
            const block = this.solids.create(x, groundY + tile / 2, 'tile_ground');
            block.setOrigin(0.5, 0.5);
            block.refreshBody();
        }

        // 浮空平台若干
        (this.levelConfig.platforms || []).forEach(([x, y, n]) => {
            for (let i = 0; i < n; i++) {
                const px = x + i * 96;
                const p = this.solids.create(px, y, 'tile_platform');
                p.setOrigin(0.5, 0.5);
                p.refreshBody();
            }
        });

        // 边界墙
        const leftWall = this.solids.create(-16, this.levelHeight / 2, 'tile_ground');
        leftWall.displayWidth = 32; leftWall.displayHeight = this.levelHeight;
        leftWall.refreshBody();
        const rightWall = this.solids.create(this.levelWidth + 16, this.levelHeight / 2, 'tile_ground');
        rightWall.displayWidth = 32; rightWall.displayHeight = this.levelHeight;
        rightWall.refreshBody();
    }

    _spawnEnemies() {
        const groundY = this.levelHeight - 64;
        (this.levelConfig.spawns || []).forEach(s => {
            const e = new Enemy(this, s.x, s.y || groundY - 4, s.type);
            this.enemies.push(e);
            this.enemySprites.add(e.sprite);
        });
    }

    update(time, delta) {
        if (this.paused) return;

        // 关卡尾部触发 Boss
        const triggerOffset = this.levelConfig.bossTriggerOffset || 600;
        if (!this.bossTriggered && this.player.x > this.levelWidth - triggerOffset) {
            this.bossTriggered = true;
            this._spawnBoss();
        }

        // 玩家
        const input = this.inputCtl.sample();
        this.player.feedInput(input);
        this.player.update(time, delta);

        // 敌人
        this.enemies.forEach(e => e.alive && e.update(time, delta, this.player));

        // Boss
        if (this.boss && this.boss.alive) {
            this.boss.update(time, delta, this.player);
        }

        // 关卡机关
        if (this.hazards) {
            this.hazards.forEach(h => h.update && h.update(time, delta, this.player));
        }

        // 清理越界子弹
        this.playerBullets.children.iterate(b => {
            if (!b) return;
            if (b.x < this.cameras.main.scrollX - 200 || b.x > this.cameras.main.scrollX + GAME_WIDTH + 200) {
                b.destroy();
            }
        });
        this.enemyBullets.children.iterate(b => {
            if (!b) return;
            if (b.x < this.cameras.main.scrollX - 200 || b.x > this.cameras.main.scrollX + GAME_WIDTH + 200) {
                b.destroy();
            }
        });

        this.hud.update(time);
    }

    _spawnBoss() {
        const bossInfo = this.levelConfig.boss || { type: 'mechanicalDino', xOffset: 220, yOffset: 80 };
        const x = this.levelWidth - (bossInfo.xOffset || 220);
        const y = this.levelHeight - (bossInfo.yOffset || 80);
        const bossConfig = BossConfigs[bossInfo.type] || BossConfigs.mechanicalDino;
        this.boss = new Boss(this, x, y, bossConfig);
        this.physics.add.collider(this.boss.sprite, this.solids);
        this.physics.add.overlap(this.playerBullets, this.boss.sprite, (b, bossSpr) => {
            if (this.boss.alive) {
                this.boss.takeDamage(10, b.x);
                Effects.hitFlash(this, b.x, b.y);
                this.player.gainEnergy(3 * this.hud.getEnergyMultiplier());
                this.hud.addCombo(this.time.now);
            }
            b.destroy();
        });
        this.physics.add.overlap(this.playerMelees, this.boss.sprite, (m, bossSpr) => {
            this._damageBossFromMelee(m, false);
        });
        this.physics.add.overlap(this.boss.sprite, this.player.sprite, () => {
            if (this.boss && this.boss.alive) this._damagePlayer(this.boss.contactDamage, this.boss.x);
        });

        Effects.bigText(this, '⚠ BOSS 来 袭 ⚠', PaletteHex.danger);
        Effects.shake(this, 400, 0.018);
    }

    // === 由 Player 状态机回调的接口 ===

    spawnPlayerBullet(x, y, vx) {
        const b = this.playerBullets.create(x, y, 'bullet_hero');
        b.body.allowGravity = false;
        b.setVelocityX(vx);
        b.setTint(Palette.heroAccent);
    }

    spawnEnemyBullet(x, y, vx, vy = 0) {
        const b = this.enemyBullets.create(x, y, 'bullet_enemy');
        b.body.allowGravity = false;
        b.setVelocity(vx, vy);
    }

    spawnPlayerMelee(x, y, w, h, facing) {
        const m = this.playerMelees.create(x, y, 'particle_white');
        // 物理组可能复用旧 hitbox，对每次新攻击显式清掉命中记录。
        m._hitSet = new Set();
        m._hitBoss = false;
        m._meleeWidth = w;
        m._meleeHeight = h;
        m.setVisible(false);
        m.body.allowGravity = false;
        m.body.setSize(w, h);
        m.setVelocity(0, 0);

        // 主动检测 Boss：不完全依赖 Arcade overlap 的时序。
        this._damageBossFromMelee(m, true);
        this.time.delayedCall(45, () => this._damageBossFromMelee(m, true));
        this.time.delayedCall(90, () => this._damageBossFromMelee(m, true));

        // 命中可视化（白色矩形闪一下）
        const ghost = this.add.rectangle(x, y, w, h, 0xffffff, 0.3).setDepth(800);
        this.tweens.add({
            targets: ghost,
            alpha: 0,
            duration: 180,
            onComplete: () => ghost.destroy()
        });

        this.time.delayedCall(140, () => m && m.destroy());
    }

    _damageBossFromMelee(melee, checkBounds) {
        if (!melee || !melee.active || !this.boss || !this.boss.alive) return false;
        melee._hitSet = melee._hitSet || new Set();
        if (melee._hitSet.has(this.boss)) return false;

        if (checkBounds) {
            const bossBody = this.boss.sprite.body;
            if (!bossBody) return false;
            const meleeWidth = melee._meleeWidth || (melee.body && melee.body.width) || 64;
            const meleeHeight = melee._meleeHeight || (melee.body && melee.body.height) || 48;
            const meleeRect = new Phaser.Geom.Rectangle(
                melee.x - meleeWidth / 2,
                melee.y - meleeHeight / 2,
                meleeWidth,
                meleeHeight
            );
            const bossRect = new Phaser.Geom.Rectangle(bossBody.x, bossBody.y, bossBody.width, bossBody.height);
            if (!Phaser.Geom.Intersects.RectangleToRectangle(meleeRect, bossRect)) return false;
        }

        melee._hitSet.add(this.boss);
        this.boss.takeDamage(18, melee.x);
        Effects.hitFlash(this, this.boss.x, this.boss.y - 80);
        Effects.shake(this, 120, 0.012);
        Effects.hitStop(this, 60);
        this.player.gainEnergy(6 * this.hud.getEnergyMultiplier());
        this.hud.addCombo(this.time.now);
        return true;
    }

    spawnPlayerUltimate(player) {
        const cam = this.cameras.main;
        Effects.bigText(this, '终 极 爆 裂 !!', PaletteHex.warning);
        Effects.shake(this, 600, 0.025);

        const beamY = player.y - 36;
        const beam = this.add.image(
            player.facing > 0 ? player.x + 40 : player.x - 40,
            beamY,
            'laser_beam'
        ).setOrigin(player.facing > 0 ? 0 : 1, 0.5)
         .setScale(0.1, 0.2)
         .setBlendMode(Phaser.BlendModes.ADD)
         .setDepth(1200);

        this.tweens.add({
            targets: beam,
            scaleX: 2.5,
            scaleY: 1.6,
            duration: 220,
            ease: 'Quad.easeOut'
        });

        // 伤害：扫描所有敌人，X 方向在玩家朝向半边的都吃伤害
        this.time.delayedCall(180, () => {
            this.enemies.forEach(e => {
                if (!e.alive) return;
                const inFront = (player.facing > 0 ? e.x > player.x : e.x < player.x);
                if (inFront && Math.abs(e.y - beamY) < 200) {
                    e.takeDamage(80, player.x);
                }
            });
            if (this.boss && this.boss.alive) {
                const inFront = (player.facing > 0 ? this.boss.x > player.x : this.boss.x < player.x);
                if (inFront) this.boss.takeDamage(120, player.x);
            }
        });

        this.time.delayedCall(900, () => {
            this.tweens.add({
                targets: beam,
                alpha: 0,
                duration: 300,
                onComplete: () => beam.destroy()
            });
        });
    }

    _damagePlayer(amount, fromX) {
        this.player.takeDamage(amount, fromX);
        Effects.shake(this, 140, 0.012);
    }
}
