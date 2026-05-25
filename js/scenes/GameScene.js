class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    init(data) {
        this.levelId = data?.levelId || 1;
        this.levelConfig = LevelConfigs.find(level => level.id === this.levelId) || LevelConfigs[0];
        // restart 复用同一 Scene 实例，必须清掉上一局的死亡/结算状态
        this.gameOver = false;
        this._gameOverShown = false;
        this.paused = false;
    }

    create() {
        const W = GAME_WIDTH;
        const H = GAME_HEIGHT;
        this.levelWidth = this.levelConfig.width || 3200;
        this.levelHeight = H;

        this.physics.world.setBounds(0, 0, this.levelWidth, this.levelHeight);
        this.physics.world.resume();
        this.cameras.main.setBounds(0, 0, this.levelWidth, this.levelHeight);

        // 视差背景
        this._createParallaxBackground(W, H);

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
        this.physics.add.collider(this.player.sprite, this.enemySprites);

        // 子弹组
        this.playerBullets = this.physics.add.group();
        this.enemyBullets = this.physics.add.group();
        this.playerMelees = this.physics.add.group(); // 一次性 hitbox

        // 碰撞 / 重叠规则（overlap 回调参数顺序不固定，用对象特征识别而非 group.contains）
        this.physics.add.overlap(this.playerBullets, this.enemySprites, (a, b) => {
            const bullet = this._pickPlayerBullet(a, b);
            const enemy = this._pickEnemyFromOverlap(a, b);
            if (!bullet || !bullet.active) return;
            if (enemy && enemy.alive) {
                enemy.takeDamage(15, bullet.x);
                Effects.hitFlash(this, bullet.x, bullet.y);
                this.player.gainEnergy(4 * this.hud.getEnergyMultiplier());
                this.hud.addCombo(this.time.now);
            }
            bullet.destroy();
        });
        this.physics.add.overlap(this.enemyBullets, this.player.sprite, (a, b) => {
            const bullet = this._pickEnemyBullet(a, b);
            if (!bullet || !bullet.active) return;
            // 冲刺无敌时完全穿过子弹，不触发受击特效，也不销毁子弹。
            if (this._playerIsPhasing()) return;
            this._damagePlayer(8, bullet.x);
            Effects.hitFlash(this, bullet.x, bullet.y);
            bullet.destroy();
        });
        this.physics.add.overlap(this.playerMelees, this.enemySprites, (a, b) => {
            const melee = this._pickPlayerMelee(a, b);
            const enemy = this._pickEnemyFromOverlap(a, b);
            if (!melee || !melee.active || !enemy || !enemy.alive) return;
            if (melee._hitSet && melee._hitSet.has(enemy)) return;
            (melee._hitSet = melee._hitSet || new Set()).add(enemy);
            enemy.takeDamage(25, melee.x);
            Effects.hitFlash(this, enemy.x, enemy.y - 24);
            Effects.shake(this, 90, 0.008);
            Effects.hitStop(this, 50);
            this.player.gainEnergy(6 * this.hud.getEnergyMultiplier());
            this.hud.addCombo(this.time.now);
        });
        this.physics.add.overlap(this.enemySprites, this.player.sprite, (a, b) => {
            const enemy = this._pickEnemyFromOverlap(a, b);
            if (!enemy || !enemy.alive) return;
            if (this._playerIsPhasing()) return;
            this._damagePlayer(enemy.contactDamage, enemy.x);
        });

        // Boss（关卡尾部触发）
        this.boss = null;
        this.bossTriggered = false;
        this.bossGateHintShown = false;
        this.startTime = this.time.now;
        this._playLevelBGM('normal');
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._stopLevelBGM());

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
            const resultData = {
                levelId: this.levelId,
                score: this.hud.score,
                maxCombo: this.hud.maxCombo,
                timeSec: timeSec,
                damageTaken: this.player.damageTakenCount,
                isFinal: isFinal
            };
            // 击败 Boss 后 1 秒：若配置了终结 PV 且尚未观看，先播放 PV 再进结算；
            // 否则保留原 2.2 秒缓冲后直接结算。
            const endVideoUrl = this.levelConfig.endVideoUrl;
            const endPVKey = `level${this.levelId}-end`;
            const shouldPlayEndPV = endVideoUrl && !SaveSystem.hasPVWatched(endPVKey);
            const delayMs = shouldPlayEndPV ? 1000 : 2200;
            this.time.delayedCall(delayMs, () => {
                if (shouldPlayEndPV) {
                    this.scene.start('PVScene', {
                        videoUrl: endVideoUrl,
                        nextScene: 'ResultScene',
                        nextSceneData: resultData,
                        pvId: endPVKey,
                        title: `第 ${this.levelId} 关 · 终结`
                    });
                } else {
                    this.scene.start('ResultScene', resultData);
                }
            });
        };
        this.onPlayerDead = () => {
            if (this.gameOver) return;
            this.gameOver = true;
            Effects.shake(this, 400, 0.02);
            this.time.delayedCall(900, () => this._showGameOver());
        };

        // 暂停菜单
        this.pauseMenu = new PauseMenu(this);

        // 系统快捷键（restart 前先解绑，避免重复注册）
        if (this._onEscKey) this.input.keyboard.off('keydown-ESC', this._onEscKey);
        if (this._onRKey) this.input.keyboard.off('keydown-R', this._onRKey);
        this._onEscKey = () => {
            if (this.gameOver) {
                this.scene.start('MenuScene');
                return;
            }
            if (this.paused) {
                this.pauseMenu.hide();
            } else {
                this.pauseMenu.show();
            }
        };
        this._onRKey = () => {
            if (this.gameOver) {
                this.scene.restart();
                return;
            }
            if (!this.paused) this.scene.restart();
        };
        this.input.keyboard.on('keydown-ESC', this._onEscKey);
        this.input.keyboard.on('keydown-R', this._onRKey);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            if (this._onEscKey) this.input.keyboard.off('keydown-ESC', this._onEscKey);
            if (this._onRKey) this.input.keyboard.off('keydown-R', this._onRKey);
        });

        // 关卡机关
        this.hazards = Hazards.spawn(this, this.levelConfig);

        Effects.bigText(this, this.levelConfig.title, PaletteHex.warning);
    }

    _levelBGMKey(kind) {
        return `bgm_level_${this.levelId}_${kind}`;
    }

    _playLevelBGM(kind) {
        if (!this.sound || !this.cache || !this.cache.audio) return;
        // 页面失焦/隐藏时不自动暂停，回到页面后通过全局事件主动恢复播放。
        this.sound.pauseOnBlur = false;
        const urlField = kind === 'boss' ? 'bossBgmUrl' : 'normalBgmUrl';
        if (!this.levelConfig || !this.levelConfig[urlField]) return;

        const key = this._levelBGMKey(kind);
        if (!this.cache.audio.exists(key)) {
            console.warn('[GameScene] 关卡 BGM 未加载:', key, this.levelConfig[urlField]);
            return;
        }
        if (this._levelBGMKind === kind && this._levelBGM && this._levelBGM.isPlaying) return;

        this._stopLevelBGM();
        const bgm = this.sound.add(key, {
            loop: true,
            volume: SaveSystem.getVolume()
        });
        this._levelBGM = bgm;
        this._levelBGMKind = kind;

        const tryPlay = () => {
            try {
                const ctx = this.sound && this.sound.context;
                if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
                    ctx.resume();
                }
            } catch (e) {}
            if (bgm && !bgm.isPlaying) {
                try { bgm.play(); } catch (e) {}
            }
            return bgm && bgm.isPlaying;
        };

        if (tryPlay()) return;
        if (this.sound.locked) {
            this.sound.once(Phaser.Sound.Events.UNLOCKED, () => tryPlay());
        }

        if (this._levelBgmCleanup) this._levelBgmCleanup();
        const windowEvents = ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'focus', 'pageshow'];
        const documentEvents = ['visibilitychange'];
        const onInput = () => {
            if (tryPlay()) cleanup();
        };
        const cleanup = () => {
            windowEvents.forEach((ev) => window.removeEventListener(ev, onInput, true));
            documentEvents.forEach((ev) => document.removeEventListener(ev, onInput, true));
            this._levelBgmCleanup = null;
        };
        windowEvents.forEach((ev) => window.addEventListener(ev, onInput, true));
        documentEvents.forEach((ev) => document.addEventListener(ev, onInput, true));
        this._levelBgmCleanup = cleanup;
    }

    _stopLevelBGM() {
        if (this._levelBgmCleanup) {
            this._levelBgmCleanup();
            this._levelBgmCleanup = null;
        }
        if (this._levelBGM) {
            try { this._levelBGM.stop(); } catch (e) {}
            try { this._levelBGM.destroy(); } catch (e) {}
            this._levelBGM = null;
        }
        this._levelBGMKind = null;
    }

    /**
     * 关卡视差背景：
     * - 第 1 关："磁暴军工厂"使用 assets/UI/第一关背景图.png 作为完整设计稿背景。
     *   按高度等比缩放，水平方向用 tileSprite 平铺以覆盖整个关卡宽度；
     *   配合较慢的 scrollFactor 制造视差感。
     * - 其他关：保持原三层程序生成的视差背景。
     * - 若图片资源缺失，回退到原三层视差。
     */
    _createParallaxBackground(W, H) {
        const useCustomBg = this.levelId === 1 && this.textures.exists('bg_level1');
        if (useCustomBg) {
            const src = this.textures.get('bg_level1').getSourceImage();
            const tileScale = src && src.height ? (H / src.height) : 1;
            this.bgFar = this.add.tileSprite(0, 0, this.levelWidth, H, 'bg_level1')
                .setOrigin(0)
                .setScrollFactor(0.2);
            if (this.bgFar.setTileScale) this.bgFar.setTileScale(tileScale, tileScale);
            this.bgFar.setDepth(-10);
            return;
        }

        this.bgFar  = this.add.tileSprite(0, 0, this.levelWidth, H, 'bg_far').setOrigin(0).setScrollFactor(0.1);
        this.bgMid  = this.add.tileSprite(0, 0, this.levelWidth, H, 'bg_mid').setOrigin(0).setScrollFactor(0.35);
        this.bgNear = this.add.tileSprite(0, 0, this.levelWidth, H, 'bg_near').setOrigin(0).setScrollFactor(0.6);
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
        if (this.paused || this.gameOver) return;

        // 小怪清理完毕，并且走到配置位置后，才触发 Boss。
        if (!this.bossTriggered && this._shouldSpawnBoss()) {
            this.bossTriggered = true;
            this._spawnBoss();
        } else if (!this.bossTriggered && this._playerReachedBossTrigger() && !this._allMinionsCleared()) {
            this._showBossGateHint();
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

    _playerReachedBossTrigger() {
        const triggerOffset = this.levelConfig.bossTriggerOffset || 600;
        return this.player && this.player.x > this.levelWidth - triggerOffset;
    }

    _allMinionsCleared() {
        return !this.enemies || this.enemies.every(enemy => !enemy.alive);
    }

    _shouldSpawnBoss() {
        return this._playerReachedBossTrigger() && this._allMinionsCleared();
    }

    _showBossGateHint() {
        if (this.bossGateHintShown) return;
        this.bossGateHintShown = true;
        Effects.bigText(this, '先 清 理 残 敌', PaletteHex.warning);
    }

    _spawnBoss() {
        const bossInfo = this.levelConfig.boss || { type: 'mechanicalDino', xOffset: 220, yOffset: 80 };
        const x = this.levelWidth - (bossInfo.xOffset || 220);
        const y = this.levelHeight - (bossInfo.yOffset || 80);
        const bossConfig = BossConfigs[bossInfo.type] || BossConfigs.mechanicalDino;
        this._playLevelBGM('boss');
        this.boss = new Boss(this, x, y, bossConfig);
        this.physics.add.collider(this.boss.sprite, this.solids);
        this.physics.add.overlap(this.playerBullets, this.boss.sprite, (a, b) => {
            const bullet = this._pickPlayerBullet(a, b);
            if (!bullet || !bullet.active) return;
            if (this.boss && this.boss.alive) {
                this.boss.takeDamage(10, bullet.x);
                Effects.hitFlash(this, bullet.x, bullet.y);
                this.player.gainEnergy(3 * this.hud.getEnergyMultiplier());
                this.hud.addCombo(this.time.now);
            }
            bullet.destroy();
        });
        this.physics.add.overlap(this.playerMelees, this.boss.sprite, (a, b) => {
            const melee = this._pickPlayerMelee(a, b);
            if (!melee || !melee.active) return;
            this._damageBossFromMelee(melee, false);
        });
        this.physics.add.overlap(this.boss.sprite, this.player.sprite, () => {
            if (this._playerIsPhasing()) return;
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
        if (this._playerIsPhasing()) return;
        this.player.takeDamage(amount, fromX);
        Effects.shake(this, 140, 0.012);
    }

    _playerIsPhasing() {
        if (!this.player || !this.player.fsm) return false;
        return this.player.fsm.is('dash') || this.player.fsm.is('dead');
    }

    _otherFromPair(a, b, target) {
        if (a === target) return b;
        if (b === target) return a;
        return null;
    }

    _pickEnemyFromOverlap(a, b) {
        for (const obj of [a, b]) {
            if (!obj || obj === this.player.sprite) continue;
            const owner = obj.owner;
            if (owner && typeof owner.alive === 'boolean' && typeof owner.contactDamage === 'number') {
                return owner;
            }
        }
        return null;
    }

    _pickPlayerBullet(a, b) {
        for (const obj of [a, b]) {
            if (!obj || !obj.active || obj === this.player.sprite || obj === this.boss?.sprite) continue;
            if (obj.texture && obj.texture.key === 'bullet_hero') return obj;
        }
        return null;
    }

    _pickEnemyBullet(a, b) {
        for (const obj of [a, b]) {
            if (!obj || !obj.active || obj === this.player.sprite) continue;
            if (obj.texture && obj.texture.key === 'bullet_enemy') return obj;
        }
        return null;
    }

    _pickPlayerMelee(a, b) {
        for (const obj of [a, b]) {
            if (!obj || !obj.active || obj === this.player.sprite || obj === this.boss?.sprite) continue;
            if (obj._meleeWidth != null) return obj;
        }
        return null;
    }

    _showGameOver() {
        if (this._gameOverShown) return;
        this._gameOverShown = true;

        const w = GAME_WIDTH;
        const h = GAME_HEIGHT;

        // 暂停物理世界，让玩家"画面冻结"。视觉 tween 保留，方便覆盖层淡入。
        this.physics.world.pause();

        const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0)
            .setScrollFactor(0).setDepth(2500);
        this.tweens.add({ targets: overlay, alpha: 0.78, duration: 320, ease: 'Sine.easeOut' });

        const panel = this.add.rectangle(w / 2, h / 2, 540, 320, 0x0a1020, 0.95)
            .setStrokeStyle(3, Palette.danger, 0.95)
            .setScrollFactor(0).setDepth(2501).setAlpha(0);
        this.tweens.add({ targets: panel, alpha: 1, duration: 280, delay: 120 });

        const title = this.add.text(w / 2, h / 2 - 90, '挑 战 失 败', {
            font: 'bold 56px Arial', color: PaletteHex.danger,
            stroke: '#000', strokeThickness: 8
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2502).setAlpha(0);
        this.tweens.add({ targets: title, alpha: 1, duration: 300, delay: 160 });

        const subtitle = this.add.text(w / 2, h / 2 - 30, this.levelConfig.title || '', {
            font: 'bold 18px Arial', color: '#cbd7e6'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2502).setAlpha(0);
        this.tweens.add({ targets: subtitle, alpha: 1, duration: 260, delay: 240 });

        this._createGameOverButton(w / 2 - 110, h / 2 + 60, '重新挑战', Palette.warning, () => {
            this.scene.restart();
        });
        this._createGameOverButton(w / 2 + 110, h / 2 + 60, '返回主菜单', Palette.hero, () => {
            this.scene.start('MenuScene');
        });

        this.add.text(w / 2, h / 2 + 130, 'R：重新挑战    ESC：返回主菜单', {
            font: '14px Arial', color: '#7f8998'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2502);
    }

    _createGameOverButton(x, y, label, accent, action) {
        const bg = this.add.rectangle(x, y, 190, 52, 0x070b12, 0.95)
            .setStrokeStyle(2, accent, 0.85)
            .setScrollFactor(0).setDepth(2503)
            .setInteractive({ useHandCursor: true });
        const text = this.add.text(x, y, label, {
            font: 'bold 22px Arial', color: '#ffffff',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2504);

        bg.on('pointerover', () => {
            bg.setFillStyle(0x12243a, 1);
            bg.setStrokeStyle(3, accent, 1);
            text.setColor(PaletteHex.warning);
        });
        bg.on('pointerout', () => {
            bg.setFillStyle(0x070b12, 0.95);
            bg.setStrokeStyle(2, accent, 0.85);
            text.setColor('#ffffff');
        });
        bg.on('pointerdown', action);
    }
}
