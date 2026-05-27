/**
 * 通用演出工具：屏幕震动、停顿帧、大字、击中粒子、爆炸。
 */
class Effects {
    /** 怪物/可破坏墙受击（assets/audio/怪物受击.mp3） */
    static playMonsterHitSfx(scene) {
        if (!scene) return;
        const sound = scene.game?.sound || scene.sound;
        const cache = scene.game?.cache?.audio || scene.cache?.audio;
        if (!sound || !cache?.exists('sfx_monster_hit')) return;

        const volume = typeof SaveSystem !== 'undefined' ? SaveSystem.getVolume() : 1;
        if (volume <= 0) return;

        try {
            const ctx = sound.context;
            if (ctx?.state === 'suspended' && typeof ctx.resume === 'function') {
                ctx.resume();
            }
        } catch (e) {}

        try {
            const sfx = sound.add('sfx_monster_hit', { volume, loop: false, destroy: true });
            sfx.play();
        } catch (e) {
            console.warn('[Effects] 播放 sfx_monster_hit 失败', e);
        }
    }

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

    /** 大招：切片固定在屏幕左侧垂直居中，持续至释放结束 */
    static ultimateSliceBanner(scene, player, durationMs = PlayerConfig.ultimateReleaseDuration) {
        if (!scene.textures.exists('ui_ultimate_slice') || !player) return;

        const cam = scene.cameras.main;
        const src = scene.textures.get('ui_ultimate_slice').getSourceImage();
        const targetW = 600;
        const scale = src && src.width ? targetW / src.width : 1;
        const x = targetW / 2 + 24;
        const y = cam.height / 2;

        const banner = scene.add.image(x, y, 'ui_ultimate_slice')
            .setOrigin(0.5)
            .setScale(scale)
            .setScrollFactor(0)
            .setDepth(1250);

        scene.time.delayedCall(durationMs, () => {
            if (banner.active) banner.destroy();
        });
    }

    static createUltimateChargeFx(player) {
        const scene = player.scene;
        const cfg = PlayerConfig;
        const offsetY = cfg.ultimateBeamOffsetY;

        Effects._spawnUltimateChargeRing(player);
        player._ultimateChargeRingTimer = scene.time.addEvent({
            delay: cfg.ultimateChargeRingInterval,
            loop: true,
            callback: () => {
                if (player.fsm?.is('ultimate') && player.ultPhase === 'charge') {
                    Effects._spawnUltimateChargeRing(player);
                }
            }
        });

        const emitter = scene.add.particles(0, 0, 'particle_fire', {
            speed: { min: 48, max: 140 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.75, end: 0 },
            alpha: { start: 0.9, end: 0 },
            lifespan: { min: 220, max: 520 },
            frequency: 18,
            quantity: 3,
            blendMode: 'ADD',
            tint: [Palette.danger, 0xff4400, Palette.warning]
        });
        player.ultimateChargeEmitter = emitter;

        const glow = scene.add.graphics()
            .setDepth(27)
            .setBlendMode(Phaser.BlendModes.ADD);
        player.ultimateChargeGlow = glow;
        Effects.syncUltimateChargeFx(player);
    }

    static _spawnUltimateChargeRing(player) {
        const scene = player.scene;
        const cfg = PlayerConfig;
        const offsetY = cfg.ultimateBeamOffsetY;
        const cx = player.x;
        const cy = player.y - offsetY;
        const elapsed = cfg.ultimateChargeDuration - Math.max(0, player.ultReleaseAt - scene.time.now);
        const ratio = Phaser.Math.Clamp(elapsed / cfg.ultimateChargeDuration, 0, 1);
        const startR = Phaser.Math.Linear(
            cfg.ultimateChargeRingStartRadius,
            cfg.ultimateChargeRingStartRadius + 36,
            ratio
        );
        const endScale = cfg.ultimateChargeRingEndRadius / startR;
        const duration = Phaser.Math.Linear(cfg.ultimateChargeRingDuration, cfg.ultimateChargeRingDuration * 0.72, ratio);

        const ring = scene.add.graphics();
        ring.lineStyle(4, Palette.danger, 0.88);
        ring.strokeCircle(0, 0, startR);
        ring.setPosition(cx, cy);
        ring.setDepth(28);
        ring.setBlendMode(Phaser.BlendModes.ADD);

        const outerRing = scene.add.graphics();
        outerRing.lineStyle(6, Palette.warning, 0.42);
        outerRing.strokeCircle(0, 0, startR * 1.1);
        outerRing.setPosition(cx, cy);
        outerRing.setDepth(27);
        outerRing.setBlendMode(Phaser.BlendModes.ADD);

        scene.tweens.add({
            targets: [ring, outerRing],
            scaleX: endScale,
            scaleY: endScale,
            alpha: 0,
            duration,
            ease: 'Sine.easeIn',
            onComplete: () => {
                ring.destroy();
                outerRing.destroy();
            }
        });
    }

    static syncUltimateChargeFx(player) {
        const cfg = PlayerConfig;
        const offsetY = cfg.ultimateBeamOffsetY;
        const em = player.ultimateChargeEmitter;
        if (em && em.active) {
            em.setPosition(player.x, player.y - offsetY);
        }

        const glow = player.ultimateChargeGlow;
        if (!glow || !glow.active) return;

        glow.setPosition(player.x, player.y - offsetY);
        const ratio = Phaser.Math.Clamp(
            (player.scene.time.now - (player.ultReleaseAt - cfg.ultimateChargeDuration)) / cfg.ultimateChargeDuration,
            0,
            1
        );
        const pulse = 0.5 + 0.5 * Math.sin(player.scene.time.now * 0.014);
        const outerR = Phaser.Math.Linear(cfg.ultimateChargeGlowStartRadius, cfg.ultimateChargeGlowEndRadius, ratio)
            + pulse * 14;
        const innerR = Phaser.Math.Linear(cfg.ultimateChargeGlowStartRadius * 0.62, cfg.ultimateChargeGlowEndRadius * 0.55, ratio)
            + pulse * 8;
        glow.clear();
        glow.lineStyle(7, Palette.danger, 0.18 + ratio * 0.32 + pulse * 0.14);
        glow.strokeCircle(0, 0, outerR);
        glow.lineStyle(3, Palette.warning, 0.38 + ratio * 0.42);
        glow.strokeCircle(0, 0, innerR);
    }

    static destroyUltimateChargeFx(player) {
        if (player._ultimateChargeRingTimer) {
            player._ultimateChargeRingTimer.remove(false);
            player._ultimateChargeRingTimer = null;
        }
        if (player.ultimateChargeGlow) {
            player.ultimateChargeGlow.destroy();
            player.ultimateChargeGlow = null;
        }
        if (player.ultimateChargeEmitter) {
            player.ultimateChargeEmitter.stop();
            player.ultimateChargeEmitter.destroy();
            player.ultimateChargeEmitter = null;
        }
    }

    static hitFlash(scene, x, y, scale = 1) {
        const rot = Phaser.Math.FloatBetween(0, Math.PI);
        const depth = 900;

        const burst = scene.add.image(x, y, 'hit_flash')
            .setDepth(depth + 1)
            .setScale(0.35 * scale)
            .setRotation(rot)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0.95);
        scene.tweens.add({
            targets: burst,
            scale: 1.15 * scale,
            alpha: 0,
            duration: 170,
            ease: 'Cubic.easeOut',
            onComplete: () => burst.destroy()
        });

        const cross = scene.add.image(x, y, 'hit_flash')
            .setDepth(depth)
            .setScale(0.25 * scale)
            .setRotation(rot + Math.PI / 4)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0.75);
        scene.tweens.add({
            targets: cross,
            scale: 0.85 * scale,
            alpha: 0,
            duration: 140,
            ease: 'Quad.easeOut',
            onComplete: () => cross.destroy()
        });

        const ring = scene.add.graphics()
            .setPosition(x, y)
            .setDepth(depth - 1)
            .setBlendMode(Phaser.BlendModes.ADD);
        ring.lineStyle(2.5, Palette.warning, 0.85);
        ring.strokeCircle(0, 0, 6 * scale);
        scene.tweens.add({
            targets: ring,
            scaleX: 2.8,
            scaleY: 2.8,
            alpha: 0,
            duration: 200,
            ease: 'Sine.easeOut',
            onComplete: () => ring.destroy()
        });

        const sparks = scene.add.particles(x, y, 'hit_spark', {
            speed: { min: 120 * scale, max: 280 * scale },
            angle: { min: 0, max: 360 },
            scale: { start: 0.9 * scale, end: 0 },
            alpha: { start: 1, end: 0 },
            lifespan: { min: 80, max: 180 },
            blendMode: 'ADD',
            tint: [Palette.white, Palette.warning, Palette.danger]
        });
        sparks.explode(Phaser.Math.Between(5, 8));
        scene.time.delayedCall(260, () => sparks.destroy());

        const embers = scene.add.particles(x, y, 'particle_fire', {
            speed: { min: 40 * scale, max: 140 * scale },
            angle: { min: 0, max: 360 },
            scale: { start: 0.5 * scale, end: 0 },
            alpha: { start: 0.9, end: 0 },
            lifespan: { min: 120, max: 260 },
            blendMode: 'ADD',
            tint: [Palette.warning, Palette.danger, 0xff6600]
        });
        embers.explode(4);
        scene.time.delayedCall(320, () => embers.destroy());
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
            .setDepth((player.viewSprite?.depth ?? player.sprite.depth) + 1)
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
