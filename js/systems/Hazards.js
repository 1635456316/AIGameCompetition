function hazardNumber(value, fallback) {
    return typeof value === 'number' && !Number.isNaN(value) ? value : fallback;
}

function resolveElementBindId(cfg) {
    const v = cfg?.bindId ?? cfg?.bindEnemyId;
    return v != null && v !== '' ? String(v) : '';
}

function playerOverlapsRect(player, x, y, w, h) {
    const body = player.body;
    if (!body) return false;
    const pRect = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
    const zRect = new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h);
    return Phaser.Geom.Rectangle.Overlaps(pRect, zRect);
}

/** 矩形区域（中心坐标）的底边中心 = 玩家脚底落点 */
function zoneFeetPoint(x, y, w, h) {
    return { x, y: y + h / 2 };
}

/** 复活点：x,y 为脚底；触发区向上延伸 h */
function checkpointTriggerFromFeet(feetX, feetY, w, h) {
    return { cx: feetX, cy: feetY - h / 2, w, h };
}

function playerOverlapsFeetZone(player, feetX, feetY, w, h) {
    const t = checkpointTriggerFromFeet(feetX, feetY, w, h);
    return playerOverlapsRect(player, t.cx, t.cy, t.w, t.h);
}

/** period <= 0 表示常开；否则按周期与激活时长切换 */
function electricIsActive(time, period, activeDuration) {
    if (period <= 0) return true;
    const duration = Math.min(activeDuration, period);
    return (time % period) < duration;
}

class Hazards {
    static spawn(scene, levelConfig) {
        const hazards = levelConfig.hazards || [];
        const spawned = hazards.map((cfg, index) => {
            switch (cfg.type) {
                case 'electric': return new ElectricZone(scene, cfg);
                case 'missile':  return new MissileStrike(scene, cfg);
                case 'wind':     return new WindZone(scene, cfg);
                case 'energy_drain': return new EnergyDrainZone(scene, cfg);
                case 'crumble':  return new CrumblePlatform(scene, cfg);
                case 'checkpoint': return new CheckpointZone(scene, cfg, index);
                case 'death':    return new DeathZone(scene, cfg);
                case 'hint':     return new HintZone(scene, cfg, index);
                case 'trigger':  return new TriggerZone(scene, cfg, index);
                case 'moving_platform': return new MovingPlatform(scene, cfg);
                case 'triggered_platform': return new TriggeredPlatform(scene, cfg);
                default: return null;
            }
        }).filter(Boolean);

        const triggerMap = {};
        spawned.forEach(h => {
            if (h instanceof TriggerZone && h.triggerId) {
                triggerMap[h.triggerId] = h;
            }
        });
        spawned.forEach(h => {
            if (h instanceof TriggeredPlatform && h.triggerId) {
                h.bindTrigger(triggerMap[h.triggerId] || null);
            }
        });

        return spawned;
    }
}

class ElectricZone {
    constructor(scene, cfg) {
        this.scene = scene;
        this.x = cfg.x;
        this.y = cfg.y;
        this.w = cfg.w || 120;
        this.h = cfg.h || 80;
        this.period = hazardNumber(cfg.period, 2400);
        this.activeDuration = hazardNumber(cfg.activeDuration, 1000);
        this.damage = hazardNumber(cfg.damage, 6);
        this.active = false;
        this.lastToggle = 0;
        this.lastDamageAt = -9999;

        this.visual = scene.add.rectangle(this.x, this.y, this.w, this.h, 0x00e5ff, 0.08)
            .setStrokeStyle(2, 0x00e5ff, 0.4).setDepth(50);
        this.zone = scene.add.zone(this.x, this.y, this.w, this.h);
        scene.physics.add.existing(this.zone, true);
    }

    update(time, delta, player) {
        const shouldActive = electricIsActive(time, this.period, this.activeDuration);

        if (shouldActive !== this.active) {
            this.active = shouldActive;
            if (this.active) {
                this.visual.setFillStyle(0x00e5ff, 0.35);
                this.visual.setStrokeStyle(3, 0x66ffff, 0.9);
            } else {
                this.visual.setFillStyle(0x00e5ff, 0.08);
                this.visual.setStrokeStyle(2, 0x00e5ff, 0.4);
            }
        }

        if (this.active && time - this.lastDamageAt > 500) {
            if (playerOverlapsRect(player, this.x, this.y, this.w, this.h)) {
                this.lastDamageAt = time;
                player.takeDamage(this.damage, this.x);
                Effects.shake(this.scene, 60, 0.005);
            }
        }
    }
}

class CheckpointZone {
    constructor(scene, cfg, index) {
        this.scene = scene;
        this.index = index;
        if (cfg.feetAnchor) {
            this.feetX = cfg.x;
            this.feetY = cfg.y;
        } else {
            // 旧 JSON：y 为区域中心 → 转为脚底
            this.feetX = cfg.x;
            this.feetY = cfg.y + (cfg.h || 120) / 2;
        }
        this.w = cfg.w || 80;
        this.h = cfg.h || 60;
        this.id = cfg.id != null ? cfg.id : index;
        this.respawnHpPercent = hazardNumber(cfg.respawnHpPercent, 100);
        this.respawnEnergyPercent = hazardNumber(cfg.respawnEnergyPercent, 100);
        this.activated = false;

        this.marker = scene.add.text(this.feetX, this.feetY, '⛳', {
            font: '24px Arial'
        }).setOrigin(0.5, 1).setDepth(46);

        GameDebug.respawnLog('checkpoint.init', {
            index,
            id: this.id,
            cfg: { x: cfg.x, y: cfg.y, w: cfg.w, h: cfg.h, feetAnchor: cfg.feetAnchor },
            resolvedFeet: { x: this.feetX, y: this.feetY },
            marker: { x: this.feetX, y: this.feetY },
            trigger: checkpointTriggerFromFeet(this.feetX, this.feetY, this.w, this.h),
            nearbySurfaces: GameDebug.nearbySurfaces(scene, this.feetX)
        });
    }

    _spawnPoint() {
        return {
            x: this.feetX,
            y: this.feetY,
            id: this.id,
            respawnHpPercent: this.respawnHpPercent,
            respawnEnergyPercent: this.respawnEnergyPercent
        };
    }

    update(time, delta, player) {
        if (player.fsm.is('dead')) return;
        if (!playerOverlapsFeetZone(player, this.feetX, this.feetY, this.w, this.h)) return;

        const cp = this._spawnPoint();
        const prev = this.scene.lastCheckpoint;
        if (prev && prev.id === cp.id) return;

        this.scene.lastCheckpoint = cp;
        GameDebug.respawnLog('checkpoint.save', {
            cp,
            prev,
            playerFeet: { x: Math.round(player.x), y: Math.round(player.y) },
            playerBody: player.body ? {
                top: Math.round(player.body.top),
                bottom: Math.round(player.body.bottom),
                left: Math.round(player.body.left),
                right: Math.round(player.body.right)
            } : null,
            checkpointFeet: { x: this.feetX, y: this.feetY },
            deltaFeetY: Math.round(player.y - this.feetY),
            nearbySurfaces: GameDebug.nearbySurfaces(this.scene, this.feetX)
        });
        if (!this.activated) {
            this.activated = true;
            this.marker.setScale(1.25);
            Effects.checkpointFlash(this.scene);
        }
    }
}

class FinishZone {
    constructor(scene, cfg) {
        this.scene = scene;
        this.x = cfg.x;
        this.y = cfg.y;
        this.w = cfg.w || 80;
        this.h = cfg.h || 80;
        this.triggered = false;

        this.glow = scene.add.rectangle(this.x, this.y, this.w, this.h, 0xffcc44, 0.1)
            .setStrokeStyle(2, 0xffdd66, 0.65).setDepth(45);
        this.marker = scene.add.text(this.x, this.y, '🏁', {
            font: '28px Arial'
        }).setOrigin(0.5).setDepth(46);
    }

    update(time, delta, player) {
        if (this.triggered || player.fsm.is('dead')) return;
        if (!playerOverlapsRect(player, this.x, this.y, this.w, this.h)) return;

        this.triggered = true;
        this.glow.setFillStyle(0xffcc44, 0.35);
        this.scene.onLevelComplete && this.scene.onLevelComplete();
    }
}

class DeathZone {
    constructor(scene, cfg) {
        this.scene = scene;
        this.x = cfg.x;
        this.y = cfg.y;
        this.w = cfg.w || 96;
        this.h = cfg.h || 24;

        this.visual = scene.add.rectangle(this.x, this.y, this.w, this.h, 0xff2244, 0.32)
            .setStrokeStyle(2, 0xff6688, 0.85).setDepth(45);
        this.stripes = scene.add.graphics().setDepth(46);
        this._drawStripes();
    }

    _drawStripes() {
        const g = this.stripes;
        g.clear();
        g.lineStyle(2, 0xff8899, 0.45);
        const left = this.x - this.w / 2;
        const top = this.y - this.h / 2;
        const bottom = this.y + this.h / 2;
        for (let sx = left; sx < left + this.w; sx += 14) {
            g.lineBetween(sx, top, sx + 7, bottom);
        }
    }

    update(time, delta, player) {
        if (player.fsm.is('dead')) return;
        if (time < player.invulnerableUntil) return;
        if (!playerOverlapsRect(player, this.x, this.y, this.w, this.h)) return;

        player.hp = 0;
        player.fsm.change('dead');
    }
}

class HintZone {
    constructor(scene, cfg, index) {
        this.scene = scene;
        this.index = index;
        this.x = cfg.x;
        this.y = cfg.y;
        this.w = cfg.w || 160;
        this.h = cfg.h || 120;
        this.text = cfg.text || '操作提示';
        this.once = cfg.once !== false;
        this.bindId = resolveElementBindId(cfg);
        this.inside = false;
        this._bannerShown = false;
        this.removed = false;
    }

    remove() {
        if (this.removed) return;
        this.removed = true;
        if (this.scene._hintBannerOwner === this) {
            Effects.dismissHintBanner(this.scene, { immediate: true });
            this.scene._hintBannerOwner = null;
        }
        this.inside = false;
        this._bannerShown = false;
    }

    update(time, delta, player) {
        if (this.removed) return;
        if (player.fsm.is('dead')) return;

        const overlapping = playerOverlapsRect(player, this.x, this.y, this.w, this.h);
        if (overlapping && !this.inside) {
            this.inside = true;
            const key = `hint-${this.index}`;
            if (this.once && this.scene._shownHints?.has(key)) return;
            this.scene._shownHints = this.scene._shownHints || new Set();
            this.scene._shownHints.add(key);
            this._bannerShown = true;
            this.scene._hintBannerOwner = this;
            Effects.cancelHintBannerDismiss(this.scene);
            Effects.hintBanner(this.scene, this.text);
        } else if (!overlapping) {
            if (this.inside && this._bannerShown) {
                if (this.scene._hintBannerOwner === this) {
                    this.scene._hintBannerOwner = null;
                }
                Effects.scheduleHintBannerDismiss(this.scene, 500);
                this._bannerShown = false;
            }
            this.inside = false;
        } else if (overlapping && this.inside && this._bannerShown) {
            Effects.cancelHintBannerDismiss(this.scene);
        }
    }
}

function resolveMissileConfig(cfg, scene) {
    const groundY = scene.levelHeight - 64;
    if (typeof cfg.x === 'number' && typeof cfg.w === 'number') {
        return {
            x: cfg.x,
            y: cfg.y ?? groundY,
            w: Math.max(16, cfg.w),
            h: Math.max(16, cfg.h ?? 60),
            interval: hazardNumber(cfg.interval, 3000),
            startDelay: hazardNumber(cfg.startDelay, 0),
            damage: hazardNumber(cfg.damage, 12)
        };
    }
    const xMin = hazardNumber(cfg.xMin, 0);
    const xMax = hazardNumber(cfg.xMax, xMin + 160);
    const y = cfg.y ?? groundY;
    return {
        x: (xMin + xMax) / 2,
        y,
        w: Math.max(16, xMax - xMin),
        h: Math.max(16, cfg.h ?? 60),
        interval: hazardNumber(cfg.interval, 3000),
        startDelay: hazardNumber(cfg.startDelay, 0),
        damage: hazardNumber(cfg.damage, 12)
    };
}

class MissileStrike {
    constructor(scene, cfg) {
        this.scene = scene;
        const m = resolveMissileConfig(cfg, scene);
        this.x = m.x;
        this.y = m.y;
        this.w = m.w;
        this.h = m.h;
        this.interval = m.interval;
        this.startDelay = m.startDelay;
        this.damage = m.damage;
        this.lastPeriod = -1;
    }

    update(time, delta, player) {
        if (this.interval <= 0) return;
        if (time < this.startDelay) return;
        const period = Math.floor((time - this.startDelay) / this.interval);
        if (period <= this.lastPeriod) return;
        this.lastPeriod = period;

        const halfW = this.w / 2;
        const halfH = this.h / 2;
        const targetX = Phaser.Math.Between(this.x - halfW, this.x + halfW);
        const targetY = Phaser.Math.Between(this.y - halfH, this.y + halfH);
        const scene = this.scene;

        const warning = scene.add.text(targetX, targetY - 40, '⚠', {
            font: 'bold 28px Arial', color: PaletteHex.danger
        }).setOrigin(0.5).setDepth(900);
        const line = scene.add.rectangle(targetX, targetY - 200, 4, 400, Palette.danger, 0.4).setDepth(899);

        scene.tweens.add({
            targets: [warning, line],
            alpha: { from: 1, to: 0.3 },
            duration: 200,
            yoyo: true,
            repeat: 3
        });

        scene.time.delayedCall(1200, () => {
            warning.destroy();
            line.destroy();
            Effects.explosion(scene, targetX, targetY, 1.0, false);

            if (Phaser.Math.Distance.Between(player.x, player.y, targetX, targetY) < 60) {
                player.takeDamage(this.damage, targetX);
            }
        });
    }
}

class WindZone {
    constructor(scene, cfg) {
        this.scene = scene;
        this.x = cfg.x;
        this.y = cfg.y;
        this.w = cfg.w || 200;
        this.h = cfg.h || 300;
        this.force = cfg.force || 180;

        const dirMap = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
        if (typeof cfg.dir === 'string' && dirMap[cfg.dir]) {
            this.dirX = dirMap[cfg.dir].x;
            this.dirY = dirMap[cfg.dir].y;
        } else {
            this.dirX = (cfg.dir === -1) ? -1 : 1;
            this.dirY = 0;
        }

        this.visual = scene.add.rectangle(this.x, this.y, this.w, this.h, 0xffffff, 0.06)
            .setStrokeStyle(1, 0xffffff, 0.25).setDepth(50);

        const pSpeedX = this.dirX !== 0
            ? { min: this.force * 0.5 * this.dirX, max: this.force * this.dirX }
            : { min: -20, max: 20 };
        const pSpeedY = this.dirY !== 0
            ? { min: this.force * 0.5 * this.dirY, max: this.force * this.dirY }
            : { min: -20, max: 20 };

        this._particles = scene.add.particles(this.x - this.w / 2, this.y, 'particle_white', {
            speedX: pSpeedX,
            speedY: pSpeedY,
            scale: { start: 0.3, end: 0 },
            alpha: { start: 0.45, end: 0 },
            lifespan: 900,
            quantity: 2,
            frequency: 55,
            emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(0, -this.h / 2, this.w, this.h) }
        }).setDepth(51);
    }

    update(time, delta, player) {
        const body = player.sprite.body;
        if (!body) return;
        const zBounds = new Phaser.Geom.Rectangle(
            this.x - this.w / 2, this.y - this.h / 2, this.w, this.h
        );
        const pRect = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
        if (Phaser.Geom.Rectangle.Overlaps(pRect, zBounds)) {
            const pushAmount = this.force * (delta / 1000);
            if (this.dirX !== 0) player.sprite.x += this.dirX * pushAmount;
            if (this.dirY !== 0) player.sprite.y += this.dirY * pushAmount;
            player.syncView?.();
        }
    }
}

class EnergyDrainZone {
    constructor(scene, cfg) {
        this.scene = scene;
        this.x = cfg.x;
        this.y = cfg.y;
        this.w = cfg.w || 140;
        this.h = cfg.h || 80;
        this.drainRate = Math.max(0, hazardNumber(cfg.drainRate, 15));

        this.visual = scene.add.rectangle(this.x, this.y, this.w, this.h, 0xaa44cc, 0.1)
            .setStrokeStyle(2, 0xcc66ee, 0.45).setDepth(50);

        if (scene.textures.exists('particle_energy')) {
            this._particles = scene.add.particles(this.x - this.w / 2, this.y, 'particle_energy', {
                speedY: { min: -70, max: -25 },
                speedX: { min: -18, max: 18 },
                scale: { start: 0.32, end: 0 },
                alpha: { start: 0.55, end: 0 },
                lifespan: 750,
                quantity: 1,
                frequency: 70,
                tint: 0xcc88ff,
                blendMode: Phaser.BlendModes.ADD,
                emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(0, -this.h / 2, this.w, this.h) }
            }).setDepth(51);
        }
    }

    update(time, delta, player) {
        if (player.fsm.is('dead')) return;
        if (this.drainRate <= 0) return;
        if (!playerOverlapsRect(player, this.x, this.y, this.w, this.h)) return;
        player.drainEnergy(this.drainRate * (delta / 1000));
    }
}

class CrumblePlatform {
    constructor(scene, cfg) {
        this.scene = scene;
        this.x = cfg.x;
        this.y = cfg.y;
        this.w = Math.max(16, cfg.w || 96);
        this.h = Math.max(16, cfg.h || 20);
        this.delay = cfg.delay || 800;
        this.respawn = cfg.respawn || 4000;
        this.triggered = false;
        this.destroyed = false;

        this.platform = scene.platforms.create(this.x, this.y, 'tile_platform');
        this.platform.setOrigin(0.5, 0.5);
        this._syncPlatformBody();
        this.platform.setTint(0xff8800);
        this.platform.setData('isCrumble', true);
        this.platform.setData('crumbleOwner', this);
    }

    _syncPlatformBody() {
        const w = this.w;
        const h = this.h;
        this.platform.setDisplaySize(w, h);
        this.platform.setData('platHeight', h);
        if (h > 20) {
            this.platform.setData('isWall', true);
        } else {
            this.platform.setData('isWall', false);
        }
        if (this.platform.body) {
            this.platform.body.setSize(w, h);
            this.platform.refreshBody();
        }
    }

    /** 由 GameScene 在碰撞/贴地/overlap 后回调，避免仅靠 update 轮询漏判 */
    onPlayerStand(player) {
        if (this.destroyed || this.triggered || !player?.body) return;
        if (this.platform.getData('crumbleDisabled')) return;
        if (!this.platform?.body?.enable) return;
        if (!this.scene._isPlayerSupportedByPlatform?.(player, this.platform)) return;

        this.triggered = true;
        this.scene.tweens.add({
            targets: this.platform,
            alpha: { from: 1, to: 0.3 },
            duration: 100,
            yoyo: true,
            repeat: 3
        });
        this.scene.time.delayedCall(this.delay, () => {
            if (!this.platform) return;
            this._collapse();
        });
    }

    _collapse() {
        this.destroyed = true;
        Effects.explosion(this.scene, this.x, this.y, 0.5);

        const player = this.scene.player;
        const wasStanding = player
            && this.scene._isPlayerSupportedByPlatform?.(player, this.platform);

        this.platform.setData('crumbleDisabled', true);
        this.platform.disableBody(true, true);
        if (this.platform.body) {
            this.platform.body.checkCollision.none = true;
        }

        if (wasStanding && player.body) {
            player.body.allowGravity = true;
            player.setVelocityY(Math.max(player.body.velocity.y, 80));
        }

        this.scene.time.delayedCall(this.respawn, () => {
            if (!this.platform) return;
            this.platform.setData('crumbleDisabled', false);
            if (this.platform.body) {
                this.platform.body.checkCollision.all = true;
            }
            this.platform.enableBody(true, this.x, this.y, true, true);
            this._syncPlatformBody();
            this.platform.setAlpha(1);
            this.platform.setTint(0xff8800);
            this.triggered = false;
            this.destroyed = false;
        });
    }
}

class TriggerZone {
    constructor(scene, cfg, index) {
        this.scene = scene;
        this.index = index;
        this.x = cfg.x;
        this.y = cfg.y;
        this.w = cfg.w || 80;
        this.h = cfg.h || 80;
        this.triggerId = cfg.triggerId || '';
        this.triggerMode = cfg.triggerMode || 'touch';
        this.maxTriggers = hazardNumber(cfg.maxTriggers, 1);
        this.triggerCount = 0;
        this.triggered = false;
        this.removed = false;

        this._callbacks = [];

        this.visual = scene.add.rectangle(this.x, this.y, this.w, this.h, 0xff99cc, 0.12)
            .setStrokeStyle(2, 0xff99cc, 0.5).setDepth(45);

        if (this.triggerMode === 'attack') {
            this.hitZone = scene.add.zone(this.x, this.y, this.w, this.h);
            scene.physics.add.existing(this.hitZone, true);
            this.hitZone.setData('isTriggerZone', true);
            this.hitZone.setData('triggerOwner', this);
        }
    }

    onTriggered(cb) {
        this._callbacks.push(cb);
    }

    _fire() {
        if (this.removed) return;
        if (this.maxTriggers > 0 && this.triggerCount >= this.maxTriggers) return;
        this.triggerCount++;
        this.triggered = true;

        this.visual.setFillStyle(0xff99cc, 0.4);
        this.scene.tweens.add({
            targets: this.visual,
            alpha: { from: 1, to: 0.5 },
            duration: 200,
            yoyo: true
        });

        if (this.triggerId && this.scene._reactToBindId) {
            this.scene._reactToBindId(this.triggerId, 'trigger');
        }

        this._callbacks.forEach(cb => cb());

        if (this.maxTriggers > 0 && this.triggerCount >= this.maxTriggers) {
            this.removed = true;
            this.visual.setAlpha(0.15);
        }
    }

    /** 被玩家攻击命中时调用 */
    onAttackHit() {
        if (this.triggerMode !== 'attack') return;
        this._fire();
    }

    update(time, delta, player) {
        if (this.removed) return;
        if (this.triggerMode !== 'touch') return;
        if (player.fsm.is('dead')) return;
        if (!playerOverlapsRect(player, this.x, this.y, this.w, this.h)) return;
        this._fire();
    }
}

class MovingPlatform {
    constructor(scene, cfg) {
        this.scene = scene;
        this.originX = cfg.x;
        this.originY = cfg.y;
        this.w = Math.max(16, cfg.w || 96);
        this.h = Math.max(16, cfg.h || 20);
        this.moveAxis = cfg.moveAxis || 'x';
        this.moveRange = cfg.moveRange || 200;
        this.moveSpeed = cfg.moveSpeed || 80;
        this._progress = 0;
        this._direction = 1;

        this.platform = scene.platforms.create(this.originX, this.originY, 'tile_platform');
        this.platform.setOrigin(0.5, 0.5);
        this.platform.setDisplaySize(this.w, this.h);
        this.platform.setData('platHeight', this.h);
        this.platform.setData('isWall', this.h > 20);
        this.platform.setData('isMovingPlatform', true);
        this.platform.setTint(0x55cc88);
        this.platform.refreshBody();
    }

    update(time, delta) {
        const step = this.moveSpeed * (delta / 1000);
        this._progress += step * this._direction;
        if (this._progress >= this.moveRange) {
            this._progress = this.moveRange;
            this._direction = -1;
        } else if (this._progress <= 0) {
            this._progress = 0;
            this._direction = 1;
        }

        let nx = this.originX;
        let ny = this.originY;
        if (this.moveAxis === 'x') nx = this.originX + this._progress;
        else ny = this.originY + this._progress;

        const dx = nx - this.platform.x;
        const dy = ny - this.platform.y;
        this.platform.x = nx;
        this.platform.y = ny;
        if (this.platform.body) {
            this.platform.body.x = nx - this.w / 2;
            this.platform.body.y = ny - this.h / 2;
        }

        const player = this.scene.player;
        if (player && this.scene._isPlayerSupportedByPlatform?.(player, this.platform)) {
            player.sprite.x += dx;
            player.sprite.y += dy;
            player.syncView?.();
        }
    }
}

class TriggeredPlatform {
    constructor(scene, cfg) {
        this.scene = scene;
        this.originX = cfg.x;
        this.originY = cfg.y;
        this.w = Math.max(16, cfg.w || 96);
        this.h = Math.max(16, cfg.h || 20);
        this.triggerId = cfg.triggerId || '';
        this.moveAxis = cfg.moveAxis || 'x';
        this.moveRange = cfg.moveRange || 200;
        this.moveSpeed = cfg.moveSpeed || 80;
        this.autoReturn = cfg.autoReturn !== false;
        this.returnMode = cfg.returnMode || 'reverse';
        this.returnDelay = hazardNumber(cfg.returnDelay, 2000);

        this._state = 'idle';
        this._progress = 0;
        this._returnTimer = 0;
        this._trigger = null;

        this.platform = scene.platforms.create(this.originX, this.originY, 'tile_platform');
        this.platform.setOrigin(0.5, 0.5);
        this.platform.setDisplaySize(this.w, this.h);
        this.platform.setData('platHeight', this.h);
        this.platform.setData('isWall', this.h > 20);
        this.platform.setData('isTriggeredPlatform', true);
        this.platform.setTint(0x55aacc);
        this.platform.refreshBody();
    }

    bindTrigger(trigger) {
        if (!trigger) return;
        this._trigger = trigger;
        trigger.onTriggered(() => this._onTriggered());
    }

    _onTriggered() {
        if (this._state === 'moving') return;
        this._state = 'moving';
    }

    update(time, delta) {
        if (this._state === 'idle') return;

        if (this._state === 'moving') {
            const step = this.moveSpeed * (delta / 1000);
            this._progress = Math.min(this._progress + step, this.moveRange);
            this._applyPosition(delta);
            if (this._progress >= this.moveRange) {
                if (this.autoReturn) {
                    this._state = 'waiting';
                    this._returnTimer = this.returnDelay;
                } else {
                    this._state = 'done';
                }
            }
        } else if (this._state === 'waiting') {
            this._returnTimer -= delta;
            if (this._returnTimer <= 0) {
                if (this.returnMode === 'instant') {
                    this._progress = 0;
                    this._applyPosition(delta);
                    this._state = 'idle';
                } else {
                    this._state = 'returning';
                }
            }
        } else if (this._state === 'returning') {
            const step = this.moveSpeed * (delta / 1000);
            this._progress = Math.max(this._progress - step, 0);
            this._applyPosition(delta);
            if (this._progress <= 0) {
                this._state = 'idle';
            }
        }
    }

    _applyPosition(delta) {
        let nx = this.originX;
        let ny = this.originY;
        if (this.moveAxis === 'x') nx = this.originX + this._progress;
        else ny = this.originY + this._progress;

        const dx = nx - this.platform.x;
        const dy = ny - this.platform.y;
        this.platform.x = nx;
        this.platform.y = ny;
        if (this.platform.body) {
            this.platform.body.x = nx - this.w / 2;
            this.platform.body.y = ny - this.h / 2;
        }

        const player = this.scene.player;
        if (player && this.scene._isPlayerSupportedByPlatform?.(player, this.platform)) {
            player.sprite.x += dx;
            player.sprite.y += dy;
            player.syncView?.();
        }
    }
}
