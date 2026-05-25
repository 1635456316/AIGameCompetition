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
