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
        this.levelCompleted = false;
        this.lastCheckpoint = null;
        this._shownHints = new Set();
    }

    create() {
        if (typeof PVScene !== 'undefined' && PVScene.cleanupDomArtifacts) {
            PVScene.cleanupDomArtifacts();
        }
        const W = GAME_WIDTH;
        const H = GAME_HEIGHT;
        this.levelWidth = this.levelConfig.width || 3200;
        this.levelHeight = H;

        this.physics.world.setBounds(0, 0, this.levelWidth, this.levelHeight);
        this.physics.world.resume();
        this.cameras.main.setBounds(0, 0, this.levelWidth, this.levelHeight);

        // 视差背景
        this._createParallaxBackground(W, H);

        // 地面/墙壁 vs 浮空单向平台
        this.groundSolids = this.physics.add.staticGroup();
        this.platforms = this.physics.add.staticGroup();
        this._buildLevel();
        this.destructibleWalls = DestructibleWalls.spawn(this, this.levelConfig);

        // 机关（含坍塌平台）须在玩家碰撞器建立前生成，确保平台已加入 staticGroup
        this.hazards = Hazards.spawn(this, this.levelConfig);
        this.finishZone = this._isFinishLevel() ? new FinishZone(this, this.levelConfig.finish) : null;

        // 玩家
        const start = this.levelConfig.playerStart || { x: 160, yOffset: 120 };
        this.player = new Player(this, start.x, H - start.yOffset);
        this.physics.add.collider(this.player.sprite, this.groundSolids);
        this.physics.add.collider(
            this.player.sprite,
            this.platforms,
            (playerSpr, platform) => this._onPlayerPlatformCollide(playerSpr, platform),
            (playerSpr, platform) => this._canCollideWithPlatform(playerSpr, platform)
        );
        this._bindCrumblePlatformOverlaps();

        // 输入
        this.inputCtl = new InputController(this);

        // 敌人组
        this.enemies = [];
        this.enemySprites = this.physics.add.group();
        this._spawnEnemies();
        const isGroundEnemy = (spr) => spr?.owner?.type !== 'flying';
        this.physics.add.collider(this.enemySprites, this.groundSolids, null, isGroundEnemy);
        this.physics.add.collider(this.enemySprites, this.platforms, null, isGroundEnemy);
        // 小怪与玩家不做物理碰撞（避免推挤），接触伤害仅靠下方 overlap 判定

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
                if (bullet._swordQiPierce) {
                    bullet._hitSet = bullet._hitSet || new Set();
                    if (bullet._hitSet.has(enemy)) return;
                    bullet._hitSet.add(enemy);
                }
                enemy.takeDamage(bullet._swordQiDamage ?? 15, bullet.x);
                Effects.hitFlash(this, bullet.x, bullet.y);
                this.player.gainEnergy(4 * this.hud.getEnergyMultiplier());
                this.hud.addCombo(this.time.now);
            }
            if (!bullet._swordQiPierce) bullet.destroy();
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
            const hitX = enemy.x;
            const hitY = enemy.y;
            enemy.takeDamage(PlayerConfig.meleeDamage, melee.x);
            Effects.hitFlash(this, hitX, hitY - 24);
            Effects.shake(this, 90, 0.008);
            Effects.hitStop(this, 50);
            this.player.gainEnergy(6 * this.hud.getEnergyMultiplier());
            this.hud.addCombo(this.time.now);
        });
        this.physics.add.overlap(this.enemySprites, this.player.sprite, (a, b) => {
            const enemy = this._pickEnemyFromOverlap(a, b);
            if (!enemy || !enemy.alive || !enemy.contactDamage) return;
            if (this._playerIsPhasing()) return;
            const interval = enemy.contactDamageInterval || 0;
            const now = this.time.now;
            if (interval > 0 && now - (enemy.lastContactDamageAt || 0) < interval) return;
            if (interval > 0) enemy.lastContactDamageAt = now;
            this._damagePlayer(enemy.contactDamage, enemy.x);
        });
        this.physics.add.collider(this.enemyBullets, this.groundSolids, (bullet) => {
            if (bullet?.active) bullet.destroy();
        });
        this.physics.add.collider(this.enemyBullets, this.platforms, (bullet) => {
            if (bullet?.active) bullet.destroy();
        });

        this._bindDestructibleWallHits();
        this.pickups = Pickups.spawn(this, this.levelConfig);

        // Boss（关卡尾部触发）
        this.boss = null;
        this.bossTriggered = false;
        this.bossGateHintShown = false;
        this.startTime = this.time.now;
        this._playLevelBGM('normal');
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._stopLevelBGM());

        // HUD
        this.hud = new HUD(this, this.player);

        // Debug 碰撞盒渲染
        this.entityDebug = new EntityDebugRenderer(this);
        this.entityDebug.setEnabled(GameDebug.showHitboxes);

        if (this._onPlatformPostUpdate) {
            this.events.off('postupdate', this._onPlatformPostUpdate);
        }
        this._onPlatformPostUpdate = () => {
            this._resolvePlayerPlatformLanding();
            this._notifyCrumblePlatformsUnderPlayer();
            this._storePlayerBodySnapshot();
            this._syncEntityViews();
        };
        this.events.on('postupdate', this._onPlatformPostUpdate);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            if (this._onPlatformPostUpdate) {
                this.events.off('postupdate', this._onPlatformPostUpdate);
            }
        });

        // 镜头跟随表现层，与玩家所见一致（坐标每帧 postUpdate 与逻辑体同步）
        this.cameras.main.startFollow(this.player.viewSprite, true, 0.12, 0.12);
        this.cameras.main.setDeadzone(120, 80);

        // 玩家击杀回调
        this.onEnemyKilled = (enemy) => {
            this.player.gainEnergy(10);
            this.hud.addScore(100);
        };
        this.onBossDefeated = () => {
            this._completeLevel();
        };
        this.onLevelComplete = () => {
            this._completeLevel();
        };
        this.onPlayerDead = () => {
            if (this.gameOver) return;
            GameDebug.respawnLog('scene.onPlayerDead', {
                hasCheckpoint: !!this.lastCheckpoint,
                lastCheckpoint: this.lastCheckpoint,
                playerBefore: GameDebug.logPlayerPose(this.player, 'scene.onPlayerDead.player')
            });
            if (this.lastCheckpoint) {
                // 延迟到下一帧：避免在 update/DeadState.enter 中途改坐标导致 body 与 sprite 脱节
                this.time.delayedCall(0, () => this._respawnAtCheckpoint());
                return;
            }
            this.gameOver = true;
            Effects.shake(this, 400, 0.02);
            this.time.delayedCall(900, () => this._showGameOver());
        };

        // 暂停菜单
        this.pauseMenu = new PauseMenu(this);

        // 系统快捷键（restart 前先解绑，避免重复注册）
        if (this._onEscKey) this.input.keyboard.off('keydown-ESC', this._onEscKey);
        if (this._onRKey) this.input.keyboard.off('keydown-R', this._onRKey);
        if (this._onDebugKey) this.input.keyboard.off(`keydown-${GameDebug.toggleKey}`, this._onDebugKey);
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
        this._onDebugKey = () => {
            if (!this.entityDebug) return;
            const on = this.entityDebug.toggle();
            Effects.bigText(this, on ? 'Debug: 碰撞盒 ON' : 'Debug: 碰撞盒 OFF', on ? PaletteHex.warning : '#888888');
        };
        this.input.keyboard.on(`keydown-${GameDebug.toggleKey}`, this._onDebugKey);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            if (this._onEscKey) this.input.keyboard.off('keydown-ESC', this._onEscKey);
            if (this._onRKey) this.input.keyboard.off('keydown-R', this._onRKey);
            if (this._onDebugKey) this.input.keyboard.off(`keydown-${GameDebug.toggleKey}`, this._onDebugKey);
        });

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
     * - 配置了 bgUrl 的关卡：按高度等比缩放，水平 tileSprite 平铺；较慢 scrollFactor 制造视差。
     * - 未配置或资源缺失：回退三层程序生成视差背景。
     */
    _createParallaxBackground(W, H) {
        const bgKey = `level_bg_${this.levelId}`;
        const useCustomBg = this.levelConfig.bgUrl && this.textures.exists(bgKey);
        if (useCustomBg) {
            const src = this.textures.get(bgKey).getSourceImage();
            const tileScale = src && src.height ? (H / src.height) : 1;
            this.bgFar = this.add.tileSprite(0, 0, this.levelWidth, H, bgKey)
                .setOrigin(0)
                .setScrollFactor(0.2);
            if (this.bgFar.setTileScale) this.bgFar.setTileScale(tileScale, tileScale);
            this.bgFar.setDepth(-10);
            return;
        }

        this.bgFar  = this.add.tileSprite(0, 0, this.levelWidth, H, 'bg_far').setOrigin(0).setScrollFactor(0.1).setDepth(-10);
        this.bgMid  = this.add.tileSprite(0, 0, this.levelWidth, H, 'bg_mid').setOrigin(0).setScrollFactor(0.35).setDepth(-8);
        this.bgNear = this.add.tileSprite(0, 0, this.levelWidth, H, 'bg_near').setOrigin(0).setScrollFactor(0.6).setDepth(-6);
    }

    _buildLevel() {
        const tile = 64;
        const groundY = this.levelHeight - tile;

        // 地面（用静态矩形 + 贴图覆盖）
        const groundCount = Math.ceil(this.levelWidth / tile);
        for (let i = 0; i < groundCount; i++) {
            const x = i * tile + tile / 2;
            const block = this.groundSolids.create(x, groundY + tile / 2, 'tile_ground');
            block.setOrigin(0.5, 0.5);
            block.refreshBody();
        }

        // 浮空平台（单向：可自下穿越，按住下+跳跃可落下）
        (this.levelConfig.platforms || []).forEach(([x, y, n]) => {
            for (let i = 0; i < n; i++) {
                const px = x + i * 96;
                const p = this.platforms.create(px, y, 'tile_platform');
                p.setOrigin(0.5, 0.5);
                p.refreshBody();
            }
        });

        // 竖墙 / 挡板（全向碰撞，L 键冲刺不可穿过）
        (this.levelConfig.walls || []).forEach(w => {
            const wallW = w.w || 32;
            const wallH = w.h || 200;
            const wall = this.groundSolids.create(w.x, w.y, 'tile_wall');
            wall.setOrigin(0.5, 0.5);
            wall.setDisplaySize(wallW, wallH);
            wall.refreshBody();
            wall.setData('isWall', true);
        });

        // 边界墙
        const leftWall = this.groundSolids.create(-16, this.levelHeight / 2, 'tile_wall');
        leftWall.displayWidth = 32; leftWall.displayHeight = this.levelHeight;
        leftWall.refreshBody();
        const rightWall = this.groundSolids.create(this.levelWidth + 16, this.levelHeight / 2, 'tile_wall');
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

        // 小怪清理完毕，并且走到配置位置后，才触发 Boss（终点关卡无 Boss）
        if (!this._isFinishLevel()) {
            if (!this.bossTriggered && this._shouldSpawnBoss()) {
                this.bossTriggered = true;
                this._spawnBoss();
            } else if (!this.bossTriggered && this._playerReachedBossTrigger() && !this._allMinionsCleared()) {
                this._showBossGateHint();
            }
        }

        // 玩家
        const input = this.inputCtl.sample();
        this.player.feedInput(input);
        this.player.update(time, delta);
        this._resolvePlayerWallCollisions();

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
        if (this.finishZone) {
            this.finishZone.update(time, delta, this.player);
        }

        // 清理越界 / 超距剑气
        this.playerBullets.children.iterate(b => {
            if (!b) return;
            if (b._swordQiMaxRange != null && b._spawnX != null) {
                if (Math.abs(b.x - b._spawnX) >= b._swordQiMaxRange) {
                    b.destroy();
                    return;
                }
            }
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

    /** 竖墙碰撞：修正 StaticBody 尺寸误差，并防止高速冲刺穿隧 */
    _resolvePlayerWallCollisions() {
        const player = this.player;
        if (!player || !player.body) return;

        const staticWalls = this.levelConfig.walls || [];
        const breakableRects = (this.destructibleWalls || [])
            .map(w => w.getCollisionRect())
            .filter(Boolean);
        const wallRects = [
            ...staticWalls.map(w => ({ x: w.x, y: w.y, w: w.w || 32, h: w.h || 200 })),
            ...breakableRects
        ];
        if (!wallRects.length) return;

        const body = player.body;
        const isDash = player.fsm.is('dash');
        const isAttackDash = player.fsm.is('attackDash');
        if (!isDash && !isAttackDash && Math.abs(body.velocity.x) < 50) return;

        for (const w of wallRects) {
            const wallW = w.w || 32;
            const wallH = w.h || 200;
            const left = w.x - wallW / 2;
            const right = w.x + wallW / 2;
            const top = w.y - wallH / 2;
            const bottom = w.y + wallH / 2;

            if (body.right <= left || body.left >= right || body.bottom <= top || body.top >= bottom) {
                continue;
            }

            const overlapLeft = body.right - left;
            const overlapRight = right - body.left;
            const margin = 2;

            if (overlapLeft <= overlapRight) {
                player.sprite.x -= overlapLeft + margin;
            } else {
                player.sprite.x += overlapRight + margin;
            }

            if (isDash) {
                player.setVelocityX(0);
                player.body.allowGravity = true;
                player.fsm.change(player.onGround() ? 'idle' : 'fall');
            } else if (isAttackDash) {
                player.setVelocityX(0);
                player.attackDashBlockedByWall = true;
            } else {
                player.setVelocityX(0);
            }
            break;
        }
    }

    _isFinishLevel() {
        const f = this.levelConfig?.finish;
        return f != null && typeof f.x === 'number' && !Number.isNaN(f.x);
    }

    _completeLevel() {
        if (this.levelCompleted || this.gameOver) return;
        this.levelCompleted = true;

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

        Effects.bigText(this, '通 关 !!', PaletteHex.warning);
        Effects.shake(this, 300, 0.015);

        const endVideoUrl = this.levelConfig.endVideoUrl;
        const endPVKey = `level${this.levelId}-end`;
        const shouldPlayEndPV = !!endVideoUrl;
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
        const bossInfo = this.levelConfig.boss || { type: 'mechanicalDino', xOffset: 220 };
        const x = this.levelWidth - (bossInfo.xOffset || 220);
        const groundY = this.levelHeight - 64;
        // 默认生成在地面上（与 player / 小怪一致）；关卡 JSON 可显式指定 boss.y
        const y = typeof bossInfo.y === 'number' ? bossInfo.y : groundY;
        const bossConfig = BossConfigs[bossInfo.type] || BossConfigs.mechanicalDino;
        this._playLevelBGM('boss');
        this.boss = new Boss(this, x, y, bossConfig);
        this.boss.snapFeetToGroundY(groundY);
        this.physics.add.collider(this.boss.sprite, this.groundSolids);
        this.physics.add.collider(this.boss.sprite, this.platforms);
        // 首帧物理刷新后再贴地一次，避免构造时 body 未就绪导致下沉
        this.time.delayedCall(0, () => {
            if (this.boss?.alive) this.boss.snapFeetToGroundY(groundY);
        });
        this.physics.add.overlap(this.playerBullets, this.boss.sprite, (a, b) => {
            const bullet = this._pickPlayerBullet(a, b);
            if (!bullet || !bullet.active) return;
            if (this.boss && this.boss.alive) {
                if (bullet._swordQiPierce) {
                    bullet._hitSet = bullet._hitSet || new Set();
                    if (bullet._hitSet.has(this.boss)) return;
                    bullet._hitSet.add(this.boss);
                }
                this.boss.takeDamage(bullet._swordQiDamage ?? 10, bullet.x);
                Effects.hitFlash(this, bullet.x, bullet.y);
                this.player.gainEnergy(3 * this.hud.getEnergyMultiplier());
                this.hud.addCombo(this.time.now);
            }
            if (!bullet._swordQiPierce) bullet.destroy();
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

    /** 将 Arcade 碰撞盒居中到 Sprite 锚点（对象池复用后必须 reset + 居中） */
    _centerArcadeBody(sprite, width, height) {
        if (!sprite?.body) return;
        sprite.body.setSize(width, height);
        sprite.body.setOffset((sprite.width - width) / 2, (sprite.height - height) / 2);
        sprite.body.updateFromGameObject();
    }

    spawnPlayerBullet(x, y, vx) {
        const b = this.playerBullets.create(x, y, 'bullet_hero');
        b.body.allowGravity = false;
        b.setVelocityX(vx);
        b.setTint(Palette.heroAccent);
    }

    spawnPlayerSwordQi(x, y, facing, opts = {}) {
        if (!this.textures.exists('fx_sword_qi')) return;
        const cfg = PlayerConfig;
        const scale = opts.scale ?? cfg.swordQiMinScale;
        const speed = opts.speed ?? cfg.swordQiMinSpeed;
        const damage = opts.damage ?? cfg.swordQiMinDamage;
        const maxRange = opts.maxRange ?? cfg.swordQiMinRange;
        const pierce = !!opts.pierce;
        const displayW = cfg.swordQiDisplayWidth * scale;
        const hitW = displayW * (cfg.swordQiHitWidthMult ?? 0.92);
        const hitH = displayW * (cfg.swordQiHitHeightMult ?? 0.62);

        const b = this.playerBullets.create(x, y, 'fx_sword_qi');
        b.setOrigin(0.5, 0.5);
        b.setPosition(x, y);
        b.setFlipX(facing < 0);
        b.setDisplaySize(displayW, displayW);
        b.body.allowGravity = false;
        b.body.reset(x, y);
        this._centerArcadeBody(b, hitW, hitH);
        b.setVelocityX(facing * speed);
        b.setDepth(24);
        b.setBlendMode(Phaser.BlendModes.ADD);
        b._swordQiDamage = damage;
        b._spawnX = x;
        b._swordQiMaxRange = maxRange;
        b._swordQiPierce = pierce;
        b._hitSet = pierce ? new Set() : null;
        if (pierce) {
            b.setTint(Palette.warning);
            b.setAlpha(0.98);
        }
    }

    spawnEnemyBullet(x, y, vx, vy = 0) {
        const b = this.enemyBullets.create(x, y, 'bullet_enemy');
        b.body.allowGravity = false;
        b.setVelocity(vx, vy);
    }

    spawnPlayerMelee(cx, cy, w, h, facing) {
        // 静态 Zone：不受重力、不会被挤动，避免碰撞框逐帧下沉
        const m = this.add.zone(cx, cy, w, h);
        this.physics.add.existing(m);
        m._hitSet = new Set();
        m._hitBoss = false;
        m._meleeWidth = w;
        m._meleeHeight = h;
        m.body.setAllowGravity(false);
        m.body.moves = false;
        m.body.setImmovable(true);
        m.body.setVelocity(0, 0);
        m.body.updateFromGameObject();
        this.playerMelees.add(m);
        m.body.setAllowGravity(false);
        m.body.moves = false;
        m.body.setImmovable(true);
        m.body.setVelocity(0, 0);

        // 主动检测 Boss：不完全依赖 Arcade overlap 的时序。
        this._damageBossFromMelee(m, true);
        this.time.delayedCall(45, () => this._damageBossFromMelee(m, true));
        this.time.delayedCall(90, () => this._damageBossFromMelee(m, true));

        const p = this.player;
        const fx = PlayerConfig;
        if (p) {
            Effects.spawnPunchWind(
                this,
                p.x + facing * fx.punchWindOffsetX,
                p.y - fx.punchWindOffsetY,
                facing
            );
        }

        this.time.delayedCall(140, () => m && m.destroy());
    }

    _damageBossFromMelee(melee, checkBounds) {
        if (!melee || !melee.active || !this.boss || !this.boss.alive) return false;
        melee._hitSet = melee._hitSet || new Set();
        if (melee._hitSet.has(this.boss)) return false;

        if (checkBounds) {
            const bossBody = this.boss.sprite.body;
            if (!bossBody || !melee.body) return false;
            const bb = melee.body;
            const meleeRect = new Phaser.Geom.Rectangle(bb.x, bb.y, bb.width, bb.height);
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
        const cfg = PlayerConfig;
        const releaseMs = cfg.ultimateReleaseDuration;

        Effects.bigText(this, '终 极 爆 裂 !!', PaletteHex.danger);
        Effects.ultimateSliceBanner(this, player, releaseMs);
        Effects.shake(this, releaseMs, 0.025);

        const beamY = player.y - cfg.ultimateBeamOffsetY;
        const hitHalfH = cfg.ultimateHitHalfHeight;
        const beam = this.add.image(
            player.facing > 0 ? player.x + 40 : player.x - 40,
            beamY,
            'laser_beam_red'
        ).setOrigin(player.facing > 0 ? 0 : 1, 0.5)
         .setScale(cfg.ultimateBeamStartScaleX, cfg.ultimateBeamStartScaleY)
         .setBlendMode(Phaser.BlendModes.ADD)
         .setTint(0xff2222)
         .setDepth(1200);

        this.tweens.add({
            targets: beam,
            scaleX: cfg.ultimateBeamEndScaleX,
            scaleY: cfg.ultimateBeamEndScaleY,
            duration: releaseMs,
            ease: 'Quad.easeOut'
        });

        const inUltimateBeam = (targetX, targetY) => {
            const inFront = player.facing > 0 ? targetX > player.x : targetX < player.x;
            return inFront && Math.abs(targetY - beamY) < hitHalfH;
        };

        this.time.delayedCall(Math.round(releaseMs * 0.45), () => {
            this.enemies.forEach(e => {
                if (!e.alive) return;
                if (inUltimateBeam(e.x, e.y)) {
                    e.takeDamage(80, player.x);
                }
            });
            if (this.boss && this.boss.alive && inUltimateBeam(this.boss.x, this.boss.y)) {
                this.boss.takeDamage(120, player.x);
            }
        });

        this.time.delayedCall(releaseMs, () => {
            this.tweens.add({
                targets: beam,
                alpha: 0,
                duration: 120,
                onComplete: () => beam.destroy()
            });
        });
    }

    _damagePlayer(amount, fromX) {
        if (this._playerIsPhasing()) return;
        this.player.takeDamage(amount, fromX);
        Effects.shake(this, 140, 0.012);
    }

    _canAttackDashTick(player, target, now) {
        const times = player._attackDashHitTimes;
        if (!times) return true;
        const last = times.get(target) || 0;
        return now - last >= PlayerConfig.attackDashHitInterval;
    }

    _markAttackDashTick(player, target, now) {
        if (!player._attackDashHitTimes) player._attackDashHitTimes = new Map();
        player._attackDashHitTimes.set(target, now);
    }

    /** 普攻第三段：冲刺途中多段判定；同一目标按间隔重复伤害 */
    tickAttackDashHits(player) {
        if (!player || !player.fsm.is('attackDash')) return;
        const now = this.time.now;
        const cfg = PlayerConfig;
        const facing = player.facing;
        const cx = player.x + facing * cfg.attackDashHitOffsetX;
        const cy = player.y - cfg.attackDashHitOffsetY;
        const hitRect = new Phaser.Geom.Rectangle(
            cx - cfg.attackDashHitWidth / 2,
            cy - cfg.attackDashHitHeight / 2,
            cfg.attackDashHitWidth,
            cfg.attackDashHitHeight
        );

        this.enemies.forEach((enemy) => {
            if (!enemy.alive) return;
            const eb = enemy.body;
            if (!eb) return;
            const enemyRect = new Phaser.Geom.Rectangle(eb.x, eb.y, eb.width, eb.height);
            if (!Phaser.Geom.Intersects.RectangleToRectangle(hitRect, enemyRect)) return;
            if (!this._canAttackDashTick(player, enemy, now)) return;

            this._markAttackDashTick(player, enemy, now);
            const hitX = enemy.x;
            const hitY = enemy.y;
            enemy.takeDamage(cfg.attackDashDamagePerTick, player.x);
            Effects.hitFlash(this, hitX, hitY - 24);
            Effects.shake(this, 70, 0.006);
            Effects.hitStop(this, 35);
            this.player.gainEnergy(3 * this.hud.getEnergyMultiplier());
            this.hud.addCombo(this.time.now);
        });

        (this.destructibleWalls || []).forEach((wall) => {
            if (!wall || wall.broken) return;
            if (!this._canAttackDashTick(player, wall, now)) return;
            if (!wall.hitByRect(hitRect, 1)) return;
            this._markAttackDashTick(player, wall, now);
            Effects.shake(this, 50, 0.004);
        });

        if (!this.boss || !this.boss.alive) return;

        const bb = this.boss.sprite.body;
        const pb = player.body;
        if (!bb || !pb) return;

        const playerRect = new Phaser.Geom.Rectangle(pb.x, pb.y, pb.width, pb.height);
        const bossRect = new Phaser.Geom.Rectangle(bb.x, bb.y, bb.width, bb.height);
        if (!Phaser.Geom.Intersects.RectangleToRectangle(playerRect, bossRect)) return;

        if (!player.attackDashBlockedByBoss) {
            player.attackDashBlockedByBoss = true;
            player.setVelocityX(0);
            const margin = 8;
            if (player.facing > 0 && pb.right > bb.left) {
                player.sprite.x -= (pb.right - bb.left + margin);
            } else if (player.facing < 0 && pb.left < bb.right) {
                player.sprite.x += (bb.right - pb.left + margin);
            }
        }

        if (!this._canAttackDashTick(player, this.boss, now)) return;

        this._markAttackDashTick(player, this.boss, now);
        this.boss.takeDamage(cfg.attackDashBossDamagePerTick, player.x);
        Effects.hitFlash(this, this.boss.x, this.boss.y - 80);
        Effects.shake(this, 120, 0.01);
        Effects.hitStop(this, 50);
        this.player.gainEnergy(4 * this.hud.getEnergyMultiplier());
        this.hud.addCombo(this.time.now);
    }

    _playerIsPhasing() {
        if (!this.player || !this.player.fsm) return false;
        // attackDash：第三段前冲可命中 Boss，但不应吃接触伤害
        return this.player.fsm.is('dash')
            || this.player.fsm.is('attackDash')
            || this.player.isSuperArmored?.()
            || this.player.fsm.is('dead');
    }

    _bindDestructibleWallHits() {
        if (!this.destructibleWalls?.length) return;
        this.destructibleWalls.forEach(wall => {
            if (!wall.sprite) return;
            this.physics.add.overlap(this.playerBullets, wall.sprite, (a, b) => {
                const bullet = this._pickPlayerBullet(a, b);
                if (!bullet?.active || wall.broken) return;
                wall.takeHit(1);
                if (!bullet._swordQiPierce) bullet.destroy();
            });
            this.physics.add.overlap(this.playerMelees, wall.sprite, (a, b) => {
                const melee = this._pickPlayerMelee(a, b);
                if (!melee?.active || wall.broken) return;
                if (melee._hitDestructible) return;
                melee._hitDestructible = true;
                wall.takeHit(1);
            });
        });
    }

    _bindCrumblePlatformOverlaps() {
        if (!this.hazards || !this.player) return;
        this.hazards.forEach(h => {
            if (!h.platform || typeof h.onPlayerStand !== 'function') return;
            this.physics.add.overlap(
                this.player.sprite,
                h.platform,
                () => h.onPlayerStand(this.player),
                () => this._isPlayerSupportedByPlatform(this.player, h.platform)
            );
        });
    }

    /** 平台是否仍参与碰撞/贴地（坍塌后应排除） */
    _platformColliderActive(platform) {
        if (!platform?.body) return false;
        if (platform.getData('crumbleDisabled')) return false;
        if (!platform.body.enable) return false;
        if (platform.active === false) return false;
        return true;
    }

    _isPlayerSupportedByPlatform(player, platform) {
        const pb = player?.body;
        const platBody = platform?.body;
        if (!pb || !platBody || !this._platformColliderActive(platform)) return false;
        if (this.time.now < player.platformDropUntil) return false;
        if (pb.velocity.y < -40) return false;
        if (pb.right < platBody.left + 2 || pb.left > platBody.right - 2) return false;
        return pb.bottom >= platBody.top - 8 && pb.bottom <= platBody.top + 24;
    }

    /** 是否站在任意单向/坍塌平台上（用于恢复跳跃次数，不移动角色） */
    isPlayerOnPlatform(player) {
        if (!player?.body || this.time.now < player.platformDropUntil) return false;
        let supported = false;
        this.platforms.children.iterate((plat) => {
            if (supported || !plat) return;
            if (this._isPlayerSupportedByPlatform(player, plat)) supported = true;
        });
        return supported;
    }

    _onPlayerPlatformCollide(playerSpr, platform) {
        if (!platform?.getData?.('isCrumble')) return;
        const owner = platform.getData('crumbleOwner');
        if (owner && this.player) owner.onPlayerStand(this.player);
    }

    _notifyCrumblePlatformsUnderPlayer() {
        const player = this.player;
        if (!player?.body || this.time.now < player.platformDropUntil) return;

        this.platforms.children.iterate((plat) => {
            if (!plat?.getData?.('isCrumble')) return;
            if (!this._isPlayerSupportedByPlatform(player, plat)) return;
            plat.getData('crumbleOwner')?.onPlayerStand(player);
        });
    }

    /** 是否站在浮空单向平台上（不含地面） */
    isStandingOnPlatform(player) {
        if (!player.onGround()) return false;
        const pb = player.body;
        if (!pb) return false;
        let onPlatform = false;
        this.platforms.children.iterate((plat) => {
            if (!plat || !plat.body || onPlatform) return;
            if (!this._platformColliderActive(plat)) return;
            if (pb.right < plat.body.left + 2 || pb.left > plat.body.right - 2) return;
            if (Math.abs(pb.bottom - plat.body.top) <= 16) onPlatform = true;
        });
        return onPlatform;
    }

    /** 单向平台：上升穿透；下+跳期间穿透；仅能从上方落下 */
    _canCollideWithPlatform(playerSpr, platform) {
        const pb = playerSpr.body;
        const plat = platform.body;
        if (!pb || !plat || !this._platformColliderActive(platform)) return false;
        if (this.time.now < this.player.platformDropUntil) return false;
        if (pb.velocity.y < 0) return false;
        if (pb.right < plat.left + 2 || pb.left > plat.right - 2) return false;

        const platTop = plat.top;
        const dt = this.game.loop.delta / 1000;
        const slop = Math.max(18, Math.abs(pb.velocity.y) * dt * 1.25 + 14);
        if (pb.bottom <= platTop + slop) return true;

        const prevBottom = this.player._prevBodyBottom;
        if (prevBottom != null && prevBottom <= platTop + 6 && pb.bottom >= platTop - 4) {
            return true;
        }
        return false;
    }

    _storePlayerBodySnapshot() {
        const pb = this.player?.body;
        if (!pb) return;
        this.player._prevBodyBottom = pb.bottom;
    }

    /** 物理步结束后，将表现层与逻辑体坐标对齐 */
    _syncEntityViews() {
        if (this.player) this.player.syncView();
        if (this.enemies) {
            this.enemies.forEach(e => e.alive && e.syncView());
        }
        if (this.boss?.alive) this.boss.syncView();

        if (this.entityDebug?.enabled) {
            this.entityDebug.beginFrame();
            this.entityDebug.drawEntity(this.player, 0x00ff88, { label: 'Player' });
            this.entityDebug.drawEntities(this.enemies, 0xff6666, { label: 'Enemy' });
            if (this.boss?.alive) this.entityDebug.drawEntity(this.boss, 0xffaa00, { label: 'Boss' });
            this.entityDebug.drawCombat(this);
            this.entityDebug.endFrame();
        }
    }

    /** 物理步后兜底：本帧从上穿过平台顶面时，吸附到台面 */
    _resolvePlayerPlatformLanding() {
        const player = this.player;
        if (!player?.body || this.time.now < player.platformDropUntil) return;
        const pb = player.body;
        if (pb.velocity.y < 0) return;

        const prevBottom = player._prevBodyBottom;
        if (prevBottom == null) return;

        this.platforms.children.iterate((plat) => {
            if (!plat?.body || !this._platformColliderActive(plat)) return;
            const platBody = plat.body;
            if (pb.right < platBody.left + 2 || pb.left > platBody.right - 2) return;

            const platTop = platBody.top;
            if (prevBottom > platTop + 10) return;
            if (pb.bottom < platTop - 6) return;
            if (pb.bottom > platTop + 36) return;

            const snap = platTop - pb.bottom;
            if (Math.abs(snap) >= 1) {
                player.sprite.y += snap;
                player.setVelocityY(0);
                pb.updateFromGameObject();
            }
            if (plat.getData('isCrumble')) {
                plat.getData('crumbleOwner')?.onPlayerStand(player);
            }
        });
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
            if (obj._swordQiDamage != null) return obj;
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

    _respawnAtCheckpoint() {
        const cp = this.lastCheckpoint;
        if (!cp || !this.player) return;

        GameDebug.respawnLog('scene.respawn.begin', {
            checkpoint: cp,
            lift: PlayerConfig.checkpointRespawnLift,
            expectedSpawn: { x: cp.x, y: cp.y - PlayerConfig.checkpointRespawnLift },
            nearbySurfaces: GameDebug.nearbySurfaces(this, cp.x),
            playerBefore: {
                logicX: Math.round(this.player.x),
                logicY: Math.round(this.player.y),
                fsm: this.player.fsm?.currentName
            }
        });

        Effects.shake(this, 280, 0.015);
        this.player.respawnAt(cp.x, cp.y);

        GameDebug.logPlayerPose(this.player, 'scene.respawn.afterRespawnAt');

        // 目标瞬移后必须立刻重置镜头；否则 startFollow 的 lerp 会从死亡位置慢慢追，
        // 离复活点越远，画面与角色世界坐标看起来偏差越大。
        const cam = this.cameras.main;
        const target = this.player.viewSprite;
        cam.stopFollow();
        cam.centerOn(target.x, target.y);
        cam.startFollow(target, true, 0.12, 0.12);

        GameDebug.respawnLog('scene.respawn.camera', {
            camScroll: { x: Math.round(cam.scrollX), y: Math.round(cam.scrollY) },
            targetView: { x: Math.round(target.x), y: Math.round(target.y) }
        });

        this.time.delayedCall(100, () => {
            GameDebug.logPlayerPose(this.player, 'scene.respawn.t+100ms');
        });
        this.time.delayedCall(500, () => {
            GameDebug.logPlayerPose(this.player, 'scene.respawn.t+500ms');
            GameDebug.respawnLog('scene.respawn.t+500ms.surfaces', {
                nearbySurfaces: GameDebug.nearbySurfaces(this, this.player.x)
            });
        });

        Effects.bigText(this, '复 活', PaletteHex.warning);
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
