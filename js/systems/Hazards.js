function hazardNumber(value, fallback) {
    return typeof value === 'number' && !Number.isNaN(value) ? value : fallback;
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
        return hazards.map((cfg, index) => {
            switch (cfg.type) {
                case 'electric': return new ElectricZone(scene, cfg);
                case 'missile':  return new MissileStrike(scene, cfg);
                case 'wind':     return new WindZone(scene, cfg);
                case 'crumble':  return new CrumblePlatform(scene, cfg);
                case 'checkpoint': return new CheckpointZone(scene, cfg, index);
                case 'death':    return new DeathZone(scene, cfg);
                case 'hint':     return new HintZone(scene, cfg, index);
                default: return null;
            }
        }).filter(Boolean);
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
        return { x: this.feetX, y: this.feetY, id: this.id };
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
        this.inside = false;
    }

    update(time, delta, player) {
        if (player.fsm.is('dead')) return;

        const overlapping = playerOverlapsRect(player, this.x, this.y, this.w, this.h);
        if (overlapping && !this.inside) {
            this.inside = true;
            const key = `hint-${this.index}`;
            if (this.once && this.scene._shownHints?.has(key)) return;
            this.scene._shownHints = this.scene._shownHints || new Set();
            this.scene._shownHints.add(key);
            Effects.hintBanner(this.scene, this.text);
        } else if (!overlapping) {
            this.inside = false;
        }
    }
}

class MissileStrike {
    constructor(scene, cfg) {
        this.scene = scene;
        this.xMin = cfg.xMin;
        this.xMax = cfg.xMax;
        this.y = cfg.y || (scene.levelHeight - 64);
        this.interval = cfg.interval || 3000;
        this.damage = cfg.damage || 12;
        this.lastStrike = 0;
    }

    update(time, delta, player) {
        if (time - this.lastStrike < this.interval) return;
        this.lastStrike = time;

        const targetX = Phaser.Math.Between(this.xMin, this.xMax);
        const scene = this.scene;

        const warning = scene.add.text(targetX, this.y - 40, '⚠', {
            font: 'bold 28px Arial', color: PaletteHex.danger
        }).setOrigin(0.5).setDepth(900);
        const line = scene.add.rectangle(targetX, this.y - 200, 4, 400, Palette.danger, 0.4).setDepth(899);

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
            Effects.explosion(scene, targetX, this.y - 20, 1.0, false);
            Effects.shake(scene, 100, 0.008);

            const dist = Math.abs(player.x - targetX);
            const vertDist = Math.abs(player.y - this.y);
            if (dist < 60 && vertDist < 60) {
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
        this.dir = cfg.dir || 1;

        this.visual = scene.add.rectangle(this.x, this.y, this.w, this.h, 0xffffff, 0.06)
            .setStrokeStyle(1, 0xffffff, 0.25).setDepth(50);

        this._particles = scene.add.particles(this.x - this.w / 2, this.y, 'particle_white', {
            speedX: { min: this.force * 0.5 * this.dir, max: this.force * this.dir },
            speedY: { min: -20, max: 20 },
            scale: { start: 0.3, end: 0 },
            alpha: { start: 0.4, end: 0 },
            lifespan: 800,
            quantity: 1,
            frequency: 120,
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
            player.sprite.x += this.dir * pushAmount;
            player.syncView?.();
        }
    }
}

class CrumblePlatform {
    constructor(scene, cfg) {
        this.scene = scene;
        this.x = cfg.x;
        this.y = cfg.y;
        this.delay = cfg.delay || 800;
        this.respawn = cfg.respawn || 4000;
        this.triggered = false;
        this.destroyed = false;

        this.platform = scene.platforms.create(this.x, this.y, 'tile_platform');
        this.platform.setOrigin(0.5, 0.5);
        this.platform.refreshBody();
        this.platform.setTint(0xff8800);
        this.platform.setData('isCrumble', true);
        this.platform.setData('crumbleOwner', this);
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
            this.platform.refreshBody();
            this.platform.setAlpha(1);
            this.platform.setTint(0xff8800);
            this.triggered = false;
            this.destroyed = false;
        });
    }
}
