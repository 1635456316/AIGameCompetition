/**
 * 通用演出工具：屏幕震动、停顿帧、大字、击中粒子、爆炸。
 */
class Effects {
    static shake(scene, duration = 120, intensity = 0.01) {
        scene.cameras.main.shake(duration, intensity);
    }

    static hitStop(scene, ms = 60) {
        if (scene.paused || scene.gameOver) return;
        const world = scene.physics.world;
        if (world.isPaused) return;
        world.pause();
        scene.time.delayedCall(ms, () => {
            if (!scene.paused && !scene.gameOver && world.isPaused) {
                world.resume();
            }
        });
    }

    static bigText(scene, text, color = PaletteHex.warning) {
        const cam = scene.cameras.main;
        const t = scene.add.text(cam.scrollX + cam.width / 2, cam.scrollY + cam.height / 2 - 80, text, {
            font: 'bold 64px Arial',
            color: color,
            stroke: '#000000',
            strokeThickness: 8
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1500).setScale(3).setAlpha(0);

        scene.tweens.add({
            targets: t,
            scale: 1,
            alpha: 1,
            duration: 160,
            ease: 'Back.easeOut'
        });
        scene.time.delayedCall(700, () => {
            scene.tweens.add({
                targets: t,
                alpha: 0,
                scale: 0.7,
                duration: 260,
                onComplete: () => t.destroy()
            });
        });
    }

    static hitFlash(scene, x, y) {
        const f = scene.add.image(x, y, 'hit_flash').setDepth(900).setScale(0.6);
        scene.tweens.add({
            targets: f,
            scale: 1.4,
            alpha: 0,
            duration: 220,
            onComplete: () => f.destroy()
        });
    }

    /** 出拳拳风：贴图默认向右，facing 左时会翻转；停留 2 帧后直接消失 */
    static spawnPunchWind(scene, x, y, facing = 1) {
        if (!scene.textures.exists('fx_punch_wind')) return;
        const cfg = PlayerConfig;
        const wind = scene.add.image(x, y, 'fx_punch_wind');
        const targetW = cfg.punchWindDisplayWidth || 65;
        const baseScale = targetW / wind.width;
        const originX = facing > 0 ? cfg.punchWindOriginX : cfg.punchWindOriginXLeft;
        wind.setOrigin(originX, cfg.punchWindOriginY)
            .setScale(baseScale)
            .setFlipX(facing < 0)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(850)
            .setAlpha(0.92);

        const fps = scene.game.loop.targetFps || 60;
        // scene.time.delayedCall((1000 / fps) * 5, () => wind.destroy());
        scene.time.delayedCall(200, () => wind.destroy());
    }

    /** 第三段冲刺：创建挂在拳头上的冲击波（需在冲刺过程中每帧 sync） */
    static createAttachedShockwave(player) {
        const scene = player.scene;
        const key = 'fx_shockwave';
        if (!scene.textures.exists(key)) {
            console.warn('[Effects] fx_shockwave 未加载，请刷新页面从主菜单重新进入');
            return null;
        }

        const frame = scene.textures.getFrame(key);
        const fw = frame.width || 1;
        const fh = frame.height || 1;
        const cfg = PlayerConfig;
        const facing = player.facing;
        const wave = scene.add.image(0, 0, key);
        const originX = facing > 0 ? cfg.shockwaveOriginX : cfg.shockwaveOriginXLeft;

        wave.setOrigin(originX, cfg.shockwaveOriginY)
            .setDisplaySize(cfg.shockwaveWidth || 200, (cfg.shockwaveWidth || 200) * (fh / fw))
            .setFlipX(facing < 0)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(player.sprite.depth + 1)
            .setAlpha(0.95);

        player.attackDashShockwave = wave;
        Effects.syncShockwaveToPlayer(player);
        return wave;
    }

    /** 每帧把冲击波对齐到拳头挂点 */
    static syncShockwaveToPlayer(player) {
        const wave = player.attackDashShockwave;
        if (!wave || !wave.active) return;
        const cfg = PlayerConfig;
        const facing = player.facing;
        wave.setPosition(
            player.x + facing * cfg.shockwaveOffsetX,
            player.y - cfg.shockwaveOffsetY
        );
        wave.setFlipX(facing < 0);
        const originX = facing > 0 ? cfg.shockwaveOriginX : cfg.shockwaveOriginXLeft;
        wave.setOrigin(originX, cfg.shockwaveOriginY);
    }

    static destroyAttachedShockwave(player) {
        if (player.attackDashShockwave) {
            player.attackDashShockwave.destroy();
            player.attackDashShockwave = null;
        }
    }

    static createSwordChargeFx(player) {
        const scene = player.scene;
        Effects.spawnSwordChargeRingPulse(player);
        player._swordChargeRingTimer = scene.time.addEvent({
            delay: PlayerConfig.swordChargeRingInterval,
            loop: true,
            callback: () => {
                if (player.fsm?.is('swordCharge')) {
                    Effects.spawnSwordChargeRingPulse(player);
                }
            }
        });

        const emitter = scene.add.particles(0, 0, 'particle_energy', {
            speed: { min: 18, max: 72 },
            angle: { min: 235, max: 305 },
            scale: { start: 0.55, end: 0 },
            alpha: { start: 0.85, end: 0 },
            lifespan: { min: 180, max: 420 },
            frequency: 38,
            quantity: 2,
            blendMode: 'ADD',
            tint: [Palette.hero, Palette.heroAccent, Palette.white]
        });
        player.swordChargeEmitter = emitter;

        const glow = scene.add.graphics()
            .setDepth(27)
            .setBlendMode(Phaser.BlendModes.ADD);
        player.swordChargeBlueRing = glow;
        Effects._drawSwordChargeBlueRing(player, 0);

        Effects.syncSwordChargeFx(player);
        return emitter;
    }

    static _drawSwordChargeBlueRing(player, ratio) {
        const glow = player.swordChargeBlueRing;
        if (!glow || !glow.active) return;
        const cfg = PlayerConfig;
        const r = Phaser.Math.Linear(cfg.swordChargeBlueRingRadius, cfg.swordChargeBlueRingRadius + 16, ratio);
        glow.clear();
        glow.lineStyle(7, Palette.energy, 0.16);
        glow.strokeCircle(0, 0, r + 10);
        glow.lineStyle(3, Palette.energy, 0.45);
        glow.strokeCircle(0, 0, r);
    }

    static spawnSwordChargeRingPulse(player) {
        const scene = player.scene;
        if (!player.fsm?.is('swordCharge')) return;
        const cfg = PlayerConfig;
        const ratio = player.getSwordChargeProgress ? player.getSwordChargeProgress() : 0;
        const cx = player.x;
        const cy = player.y - cfg.swordChargeRingOffsetY;
        const startR = Phaser.Math.Linear(cfg.swordChargeRingStartRadius, cfg.swordChargeRingEndRadius + 18, ratio);
        const endScale = cfg.swordChargeRingEndRadius / startR;
        const duration = Phaser.Math.Linear(cfg.swordChargeRingDuration, cfg.swordChargeRingDuration * 0.72, ratio);
        const ringColor = ratio >= cfg.swordQiPierceChargeMs / cfg.swordChargeMaxMs
            ? Palette.warning
            : Palette.heroAccent;

        const ring = scene.add.graphics();
        ring.lineStyle(2.5, ringColor, 0.82);
        ring.strokeCircle(0, 0, startR);
        ring.setPosition(cx, cy);
        ring.setDepth(28);
        ring.setBlendMode(Phaser.BlendModes.ADD);

        const blueRing = scene.add.graphics();
        blueRing.lineStyle(4, Palette.energy, 0.5);
        blueRing.strokeCircle(0, 0, startR * 1.08);
        blueRing.setPosition(cx, cy);
        blueRing.setDepth(27);
        blueRing.setBlendMode(Phaser.BlendModes.ADD);

        scene.tweens.add({
            targets: [ring, blueRing],
            scaleX: endScale,
            scaleY: endScale,
            alpha: 0,
            duration,
            ease: 'Sine.easeIn',
            onComplete: () => {
                ring.destroy();
                blueRing.destroy();
            }
        });
    }

    static syncSwordChargeFx(player) {
        const em = player.swordChargeEmitter;
        const offsetY = PlayerConfig.swordChargeRingOffsetY;
        const ratio = player.getSwordChargeProgress ? player.getSwordChargeProgress() : 0;
        if (em && em.active) {
            em.setPosition(player.x, player.y - offsetY);
            em.setFrequency(Phaser.Math.Linear(38, 18, ratio));
        }
        if (player.swordChargeBlueRing && player.swordChargeBlueRing.active) {
            player.swordChargeBlueRing.setPosition(player.x, player.y - offsetY);
            Effects._drawSwordChargeBlueRing(player, ratio);
        }
    }

    static destroySwordChargeFx(player) {
        if (player._swordChargeRingTimer) {
            player._swordChargeRingTimer.remove(false);
            player._swordChargeRingTimer = null;
        }
        if (player.swordChargeBlueRing) {
            player.swordChargeBlueRing.destroy();
            player.swordChargeBlueRing = null;
        }
        if (player.swordChargeEmitter) {
            player.swordChargeEmitter.stop();
            player.swordChargeEmitter.destroy();
            player.swordChargeEmitter = null;
        }
    }

    static createSwordChargeBar(player) {
        const scene = player.scene;
        const w = PlayerConfig.swordChargeBarWidth;
        const h = PlayerConfig.swordChargeBarHeight;
        const bg = scene.add.rectangle(0, 0, w, h, 0x000000, 0.6)
            .setOrigin(0.5, 0.5)
            .setDepth(32)
            .setStrokeStyle(1, Palette.heroDark, 0.8);
        const fill = scene.add.rectangle(0, 0, 2, h - 2, Palette.heroAccent, 0.95)
            .setOrigin(0, 0.5)
            .setDepth(33);
        player.swordChargeBarBg = bg;
        player.swordChargeBarFill = fill;
        Effects.updateSwordChargeBar(player);
    }

    static updateSwordChargeBar(player) {
        const bg = player.swordChargeBarBg;
        const fill = player.swordChargeBarFill;
        if (!bg || !fill || !bg.active) return;
        const w = PlayerConfig.swordChargeBarWidth;
        const h = PlayerConfig.swordChargeBarHeight;
        const ratio = player.getSwordChargeProgress ? player.getSwordChargeProgress() : 0;
        const pierceRatio = PlayerConfig.swordQiPierceChargeMs / PlayerConfig.swordChargeMaxMs;
        const barY = player.y - PlayerConfig.swordChargeRingOffsetY - 46;

        bg.setPosition(player.x, barY);
        fill.setPosition(player.x - w / 2 + 1, barY);
        fill.setSize(Math.max(2, (w - 2) * ratio), h - 2);
        fill.setFillStyle(ratio >= pierceRatio ? Palette.warning : Palette.heroAccent, 0.95);
    }

    static destroySwordChargeBar(player) {
        if (player.swordChargeBarBg) {
            player.swordChargeBarBg.destroy();
            player.swordChargeBarBg = null;
        }
        if (player.swordChargeBarFill) {
            player.swordChargeBarFill.destroy();
            player.swordChargeBarFill = null;
        }
    }

    static explosion(scene, x, y, scale = 1) {
        const emitter = scene.add.particles(x, y, 'particle_fire', {
            speed: { min: 120 * scale, max: 360 * scale },
            angle: { min: 0, max: 360 },
            scale: { start: 1.2 * scale, end: 0 },
            lifespan: 420,
            quantity: 22,
            blendMode: 'ADD'
        });
        scene.time.delayedCall(80, () => emitter.stop());
        scene.time.delayedCall(600, () => emitter.destroy());

        const ring = scene.add.image(x, y, 'hit_flash').setScale(0.4 * scale).setAlpha(0.9);
        scene.tweens.add({
            targets: ring,
            scale: 2.2 * scale,
            alpha: 0,
            duration: 320,
            onComplete: () => ring.destroy()
        });
    }
}
