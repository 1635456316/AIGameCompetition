class Hazards {
    static spawn(scene, levelConfig) {
        const hazards = levelConfig.hazards || [];
        return hazards.map(cfg => {
            switch (cfg.type) {
                case 'electric': return new ElectricZone(scene, cfg);
                case 'missile':  return new MissileStrike(scene, cfg);
                case 'wind':     return new WindZone(scene, cfg);
                case 'crumble':  return new CrumblePlatform(scene, cfg);
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
        this.period = cfg.period || 2400;
        this.activeDuration = cfg.activeDuration || 1000;
        this.damage = cfg.damage || 6;
        this.active = false;
        this.lastToggle = 0;
        this.lastDamageAt = -9999;

        this.visual = scene.add.rectangle(this.x, this.y, this.w, this.h, 0x00e5ff, 0.08)
            .setStrokeStyle(2, 0x00e5ff, 0.4).setDepth(50);
        this.zone = scene.add.zone(this.x, this.y, this.w, this.h);
        scene.physics.add.existing(this.zone, true);
    }

    update(time, delta, player) {
        const phase = time % this.period;
        const shouldActive = phase < this.activeDuration;

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
            const body = player.body;
            if (!body) return;
            const pRect = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
            const zBounds = new Phaser.Geom.Rectangle(
                this.x - this.w / 2, this.y - this.h / 2, this.w, this.h
            );
            if (Phaser.Geom.Rectangle.Overlaps(pRect, zBounds)) {
                this.lastDamageAt = time;
                player.takeDamage(this.damage, this.x);
                Effects.shake(this.scene, 60, 0.005);
            }
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
            Effects.explosion(scene, targetX, this.y - 20, 1.0);
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
    }

    update(time, delta, player) {
        if (this.destroyed) return;
        if (this.triggered) return;

        const body = player.body;
        if (!body) return;
        const pFeet = body.bottom;
        const pCenterX = body.centerX;
        const onTop = Math.abs(pFeet - (this.y - 10)) < 12
            && Math.abs(pCenterX - this.x) < 48
            && player.onGround();

        if (onTop) {
            this.triggered = true;
            this.scene.tweens.add({
                targets: this.platform,
                alpha: { from: 1, to: 0.3 },
                duration: 100,
                yoyo: true,
                repeat: 3
            });
            this.scene.time.delayedCall(this.delay, () => {
                this.destroyed = true;
                Effects.explosion(this.scene, this.x, this.y, 0.5);
                this.platform.disableBody(true, true);

                this.scene.time.delayedCall(this.respawn, () => {
                    this.platform.enableBody(true, this.x, this.y, true, true);
                    this.platform.setAlpha(1);
                    this.platform.setTint(0xff8800);
                    this.triggered = false;
                    this.destroyed = false;
                });
            });
        }
    }
}
