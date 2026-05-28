/**
 * 通用演出工具：屏幕震动、停顿帧、大字、击中粒子、爆炸。
 */
class Effects {
    /** 爆炸（assets/audio/explosion.wav）— 小怪/Boss 死亡、墙体摧毁等 */
    static playExplosionSfx(scene, volumeScale = 1) {
        if (!scene) return;
        const sound = scene.game?.sound || scene?.sound;
        const cache = scene.game?.cache?.audio || scene?.cache?.audio;
        if (!sound || !cache?.exists('sfx_explosion')) {
            console.warn('[Effects] sfx_explosion 未加载，爆炸音效不可用');
            return;
        }

        const baseVolume = typeof SaveSystem !== 'undefined' ? SaveSystem.getVolume() : 1;
        const volume = baseVolume * volumeScale;
        if (volume <= 0) return;

        try {
            const ctx = sound.context;
            if (ctx?.state === 'suspended' && typeof ctx.resume === 'function') {
                ctx.resume();
            }
        } catch (e) {}

        try {
            if (typeof sound.play === 'function') {
                sound.play('sfx_explosion', { volume, loop: false });
                return;
            }
            const sfx = sound.add('sfx_explosion', { volume, loop: false, destroy: true });
            sfx.play();
        } catch (e) {
            console.warn('[Effects] 播放 sfx_explosion 失败', e);
        }
    }

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
        const cam = scene?.cameras?.main;
        if (!cam) return;

        const effect = cam.shakeEffect;
        if (effect?.isRunning) {
            const remaining = effect.duration * (1 - effect.progress);
            const currentIntensity = effect.intensity?.x ?? 0;
            // 已有震动时，Phaser 默认 force=false 会直接忽略新调用；
            // 仅当新震动更短且更弱时才跳过，避免 Boss 技能等打断大招长震。
            if (duration <= remaining && intensity <= currentIntensity) {
                return;
            }
        }

        cam.shake(duration, intensity, true);
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
        const t = scene.add.text(cam.width / 2, cam.height / 2 - 80, text, {
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

    /** 屏幕中上方黄字操作指引（提示区内持续显示，离开后由 scheduleHintBannerDismiss 隐藏） */
    static hintBanner(scene, text) {
        Effects.cancelHintBannerDismiss(scene);
        if (scene._hintBannerTween) {
            scene._hintBannerTween.stop();
            scene._hintBannerTween = null;
        }
        if (scene._hintBannerText?.active) {
            scene._hintBannerText.destroy();
        }

        const cam = scene.cameras.main;
        const t = scene.add.text(cam.width / 2, 68, text, {
            font: 'bold 26px "Microsoft YaHei", Arial, sans-serif',
            color: '#ffdd44',
            stroke: '#000000',
            strokeThickness: 5,
            align: 'center',
            wordWrap: { width: cam.width - 96 }
        }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1400).setAlpha(0);
        scene._hintBannerText = t;

        scene.tweens.add({
            targets: t,
            alpha: 1,
            duration: 180,
            ease: 'Quad.easeOut'
        });
    }

    static cancelHintBannerDismiss(scene) {
        if (scene._hintBannerHideTimer) {
            scene._hintBannerHideTimer.remove(false);
            scene._hintBannerHideTimer = null;
        }
    }

    /** 离开提示区后延迟隐藏 */
    static scheduleHintBannerDismiss(scene, delayMs = 500) {
        Effects.cancelHintBannerDismiss(scene);
        scene._hintBannerHideTimer = scene.time.delayedCall(delayMs, () => {
            scene._hintBannerHideTimer = null;
            Effects.dismissHintBanner(scene, { fadeMs: 250 });
        });
    }

    /** 淡出并清除提示 banner */
    static dismissHintBanner(scene, opts = {}) {
        Effects.cancelHintBannerDismiss(scene);
        if (scene._hintBannerTween) {
            scene._hintBannerTween.stop();
            scene._hintBannerTween = null;
        }

        const t = scene._hintBannerText;
        if (!t?.active) {
            scene._hintBannerText = null;
            return;
        }

        if (opts.immediate) {
            t.destroy();
            scene._hintBannerText = null;
            return;
        }

        const fadeMs = opts.fadeMs ?? 220;
        scene._hintBannerTween = scene.tweens.add({
            targets: t,
            alpha: 0,
            duration: fadeMs,
            ease: 'Quad.easeIn',
            onComplete: () => {
                t.destroy();
                if (scene._hintBannerText === t) scene._hintBannerText = null;
            }
        });
    }

    /** 闪烁后销毁对象（用于系统墙等） */
    static flickerVanish(scene, objects, opts = {}) {
        const targets = (Array.isArray(objects) ? objects : [objects])
            .filter(o => o && (o.active === undefined || o.active));
        if (!targets.length) {
            opts.onComplete?.();
            return;
        }
        const steps = opts.steps ?? 10;
        const interval = opts.interval ?? 65;
        let step = 0;
        const tick = () => {
            if (step >= steps) {
                targets.forEach(t => { if (t?.destroy) t.destroy(); });
                opts.onComplete?.();
                return;
            }
            const alpha = step % 2 === 0 ? 1 : 0.12;
            targets.forEach(t => { if (t.setAlpha) t.setAlpha(alpha); });
            step += 1;
            scene.time.delayedCall(interval, tick);
        };
        tick();
    }

    /** 经过复活点时的轻微反馈 */
    static checkpointFlash(scene) {
        const cam = scene.cameras.main;
        const t = scene.add.text(cam.width / 2, 48, '存档点', {
            font: 'bold 20px "Microsoft YaHei", Arial, sans-serif',
            color: '#66ffaa',
            stroke: '#003322',
            strokeThickness: 4
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1390).setAlpha(0);

        scene.tweens.add({
            targets: t,
            alpha: 1,
            y: 40,
            duration: 200,
            yoyo: true,
            hold: 400,
            onComplete: () => t.destroy()
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

    static explosion(scene, x, y, scale = 1, playSfx = true) {
        if (playSfx !== false) {
            Effects.playExplosionSfx(scene, Math.min(1, 0.5 + scale * 0.35));
        }
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

    static playDashSfx(scene, volumeScale = 0.85) {
        if (!scene) return;
        const sound = scene.game?.sound || scene?.sound;
        const cache = scene.game?.cache?.audio || scene?.cache?.audio;
        if (!sound || !cache?.exists('sfx_dash')) return;

        const baseVolume = typeof SaveSystem !== 'undefined' ? SaveSystem.getVolume() : 1;
        const volume = baseVolume * volumeScale;
        if (volume <= 0) return;

        try {
            if (typeof sound.play === 'function') {
                sound.play('sfx_dash', { volume, loop: false });
                return;
            }
            const sfx = sound.add('sfx_dash', { volume, loop: false, destroy: true });
            sfx.play();
        } catch (e) {
            console.warn('[Effects] 播放 sfx_dash 失败', e);
        }
    }

    /** Boss 冲撞：前摇预警 + 冲刺拖尾 */
    static startBossChargeFx(boss, dir) {
        if (!boss?.scene) return;
        Effects.stopBossChargeFx(boss);

        const scene = boss.scene;
        const fx = {
            dir: dir >= 0 ? 1 : -1,
            phase: 'windup',
            warningGfx: scene.add.graphics().setDepth(13),
            glowGfx: scene.add.graphics().setDepth(14).setBlendMode(Phaser.BlendModes.ADD),
            lastTrailAt: 0
        };
        boss._chargeFx = fx;
    }

    static updateBossChargeFx(boss, time) {
        const fx = boss?._chargeFx;
        if (!fx || !boss.alive) return;

        const scene = boss.scene;
        const dir = fx.dir;
        const feetY = boss.y - 6;
        const pulse = 0.5 + 0.5 * Math.sin(time * 0.014);

        if (fx.phase === 'windup') {
            const startX = boss.x + dir * 36;
            const endX = startX + dir * 300;
            const warnAlpha = 0.28 + pulse * 0.5;

            fx.warningGfx.clear();
            fx.warningGfx.fillStyle(Palette.danger, 0.08 + pulse * 0.1);
            fx.warningGfx.fillRect(
                Math.min(startX, endX),
                feetY - 10,
                Math.abs(endX - startX),
                18
            );
            fx.warningGfx.lineStyle(3, Palette.warning, warnAlpha);
            fx.warningGfx.lineBetween(startX, feetY, endX, feetY);

            for (let i = 1; i <= 4; i++) {
                const cx = startX + dir * i * 62;
                Effects._drawChargeChevron(fx.warningGfx, cx, feetY, dir, 14, Palette.warning, warnAlpha);
            }

            fx.glowGfx.clear();
            fx.glowGfx.lineStyle(7, Palette.danger, 0.14 + pulse * 0.28);
            fx.glowGfx.strokeCircle(0, 0, 48 + pulse * 16);
            fx.glowGfx.lineStyle(3, Palette.warning, 0.22 + pulse * 0.35);
            fx.glowGfx.strokeCircle(0, 0, 28 + pulse * 8);
            fx.glowGfx.setPosition(boss.x, boss.y - 52);

            const tintPulse = pulse > 0.55 ? 0xff6633 : 0xffaa44;
            boss.view.setTint(tintPulse);
            return;
        }

        if (fx.phase === 'dash') {
            if (fx.streak?.active) {
                fx.streak.setPosition(boss.x - dir * 90, boss.y - 78);
                fx.streak.setAlpha(0.55 + pulse * 0.25);
            }
            if (fx.emitter?.active) {
                fx.emitter.setPosition(boss.x - dir * 55, boss.y - 42);
            }

            if (time - fx.lastTrailAt >= 42) {
                fx.lastTrailAt = time;
                Effects._spawnBossChargeTrail(scene, boss.x - dir * 35, feetY, dir);
            }
        }
    }

    static beginBossChargeDash(boss) {
        const fx = boss?._chargeFx;
        if (!fx || !boss.alive) return;

        const scene = boss.scene;
        const dir = fx.dir;
        fx.phase = 'dash';
        fx.warningGfx?.clear();

        Effects.shake(scene, 160, 0.012);
        Effects.playDashSfx(scene, 0.9);
        boss.view.setTint(0xff5522);

        if (scene.textures.exists('fx_punch_wind')) {
            fx.streak = scene.add.image(boss.x - dir * 90, boss.y - 78, 'fx_punch_wind')
                .setOrigin(0.5, 0.5)
                .setFlipX(dir < 0)
                .setScale(2.8, 1.35)
                .setAlpha(0.75)
                .setTint(Palette.warning)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setDepth(12);
        }

        fx.emitter = scene.add.particles(0, 0, 'particle_fire', {
            speed: { min: 80, max: 220 },
            angle: dir > 0
                ? { min: 150, max: 210 }
                : { min: -30, max: 30 },
            scale: { start: 0.9, end: 0 },
            alpha: { start: 0.85, end: 0 },
            lifespan: { min: 120, max: 280 },
            frequency: 28,
            quantity: 2,
            blendMode: 'ADD',
            tint: [Palette.warning, Palette.danger, 0xff6600]
        });
        fx.emitter.setDepth(14);
        Effects.updateBossChargeFx(boss, scene.time.now);
    }

    static bossChargeWallImpact(scene, x, y, dir) {
        if (!scene) return;
        Effects.shake(scene, 320, 0.022);
        Effects.explosion(scene, x + dir * 28, y - 36, 1.15, true);

        if (scene.textures.exists('fx_shockwave')) {
            const sw = scene.add.image(x + dir * 40, y - 28, 'fx_shockwave')
                .setOrigin(0.5, 0.5)
                .setFlipX(dir < 0)
                .setScale(0.55)
                .setAlpha(0.9)
                .setTint(Palette.warning)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setDepth(16);
            scene.tweens.add({
                targets: sw,
                scaleX: 2.1,
                scaleY: 1.6,
                alpha: 0,
                duration: 300,
                ease: 'Cubic.easeOut',
                onComplete: () => sw.destroy()
            });
        }

        const debris = scene.add.particles(x + dir * 20, y - 16, 'hit_spark', {
            speed: { min: 140, max: 420 },
            angle: dir > 0
                ? { min: -70, max: 70 }
                : { min: 110, max: 250 },
            scale: { start: 1, end: 0 },
            alpha: { start: 1, end: 0 },
            lifespan: { min: 100, max: 260 },
            blendMode: 'ADD',
            tint: [Palette.white, Palette.warning, Palette.danger]
        });
        debris.explode(12);
        scene.time.delayedCall(320, () => debris.destroy());
    }

    static stopBossChargeFx(boss, opts = {}) {
        const fx = boss?._chargeFx;
        if (!fx) return;

        if (opts.wallImpact && boss?.alive) {
            Effects.bossChargeWallImpact(boss.scene, boss.x, boss.y, fx.dir);
        }

        fx.warningGfx?.destroy();
        fx.glowGfx?.destroy();
        if (fx.emitter) {
            fx.emitter.stop();
            fx.emitter.destroy();
        }
        fx.streak?.destroy();
        boss._chargeFx = null;
        if (boss.alive) boss._restoreBossTint();
    }

    static _drawChargeChevron(g, x, y, dir, size, color, alpha) {
        const tipX = x + dir * size;
        const backX = x - dir * size * 0.55;
        g.fillStyle(color, alpha);
        g.fillTriangle(tipX, y, backX, y - size * 0.55, backX, y + size * 0.55);
    }

    static _spawnBossChargeTrail(scene, x, y, dir) {
        const dust = scene.add.particles(x, y, 'hit_spark', {
            speed: { min: 40, max: 160 },
            angle: dir > 0
                ? { min: 160, max: 200 }
                : { min: -20, max: 20 },
            scale: { start: 0.7, end: 0 },
            alpha: { start: 0.8, end: 0 },
            lifespan: { min: 80, max: 180 },
            blendMode: 'ADD',
            tint: [0xcccccc, Palette.warning, 0x888888]
        });
        dust.explode(3);
        scene.time.delayedCall(220, () => dust.destroy());

        if (scene.textures.exists('fx_shockwave')) {
            const mark = scene.add.image(x, y, 'fx_shockwave')
                .setOrigin(0.5, 0.5)
                .setFlipX(dir < 0)
                .setScale(0.12)
                .setAlpha(0.35)
                .setTint(Palette.warning)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setDepth(11);
            scene.tweens.add({
                targets: mark,
                scale: 0.28,
                alpha: 0,
                duration: 180,
                onComplete: () => mark.destroy()
            });
        }
    }
}
