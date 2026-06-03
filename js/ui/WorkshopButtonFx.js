/**
 * 创意工坊入口按钮角标与间隔旋转抖动（选关 / 主菜单共用）
 */
const WorkshopButtonFx = {
    attachPrompt(scene, container, btnW, startDelay) {
        const badge = scene.add.container(btnW / 2 - 6, -26);
        const badgeRing = scene.add.circle(0, 0, 11, 0xff5fb9, 0.15)
            .setStrokeStyle(1.5, 0xff5fb9, 0.85);
        const badgeCore = scene.add.circle(0, 0, 7, 0xff5fb9, 0.92);
        const badgeIcon = scene.add.text(0, -1, '✦', {
            font: 'bold 11px Arial',
            color: '#ffffff',
            stroke: '#000',
            strokeThickness: 2
        }).setOrigin(0.5);
        badge.add([badgeRing, badgeCore, badgeIcon]);
        container.add(badge);

        const promptTweens = [];
        const startPrompt = () => {
            promptTweens.push(scene.tweens.add({
                targets: badge,
                y: -28,
                duration: 680,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            }));
            promptTweens.push(scene.tweens.add({
                targets: badgeIcon,
                angle: { from: -10, to: 10 },
                duration: 820,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            }));
            promptTweens.push(scene.tweens.add({
                targets: badgeRing,
                scale: { from: 1, to: 1.35 },
                alpha: { from: 0.35, to: 0.05 },
                duration: 1200,
                repeat: -1,
                ease: 'Sine.easeOut'
            }));
        };

        scene.time.delayedCall(startDelay, startPrompt);

        const pausePrompt = () => promptTweens.forEach(t => t.pause());
        const resumePrompt = () => promptTweens.forEach(t => t.resume());

        if (container.hitZone) {
            container.hitZone.on('pointerover', pausePrompt);
            container.hitZone.on('pointerout', resumePrompt);
        }

        scene.events.once('shutdown', () => promptTweens.forEach(t => t.stop()));
    },

    attachShake(scene, container, startDelay) {
        const pauseMs = 2600;
        const shakeDeg = 3.2;
        let shakeTween = null;
        let nextShakeTimer = null;
        let paused = false;

        const clearNext = () => {
            if (nextShakeTimer) {
                nextShakeTimer.remove(false);
                nextShakeTimer = null;
            }
        };

        const scheduleNext = (delay = pauseMs) => {
            clearNext();
            if (paused) return;
            nextShakeTimer = scene.time.delayedCall(delay, runBurst);
        };

        const runBurst = () => {
            if (paused) return;
            clearNext();
            if (shakeTween) shakeTween.stop();
            shakeTween = scene.tweens.add({
                targets: container,
                angle: { from: -shakeDeg, to: shakeDeg },
                duration: 88,
                yoyo: true,
                repeat: 2,
                ease: 'Sine.easeInOut',
                onComplete: () => {
                    container.setAngle(0);
                    shakeTween = null;
                    scheduleNext(pauseMs);
                }
            });
        };

        const pauseShake = () => {
            paused = true;
            if (shakeTween) shakeTween.stop();
            shakeTween = null;
            container.setAngle(0);
            clearNext();
        };

        const resumeShake = () => {
            paused = false;
            scheduleNext(420);
        };

        scene.time.delayedCall(startDelay, runBurst);

        if (container.hitZone) {
            container.hitZone.on('pointerover', pauseShake);
            container.hitZone.on('pointerout', resumeShake);
        }

        scene.events.once('shutdown', pauseShake);
    }
};
