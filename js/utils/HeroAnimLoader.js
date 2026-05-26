/**
 * 将「视频生成序列帧」工具导出的 PNG + JSON 注册为 Phaser 纹理帧与动画。
 */
class HeroAnimLoader {
    static registerAll(scene) {
        HeroAnimLoader.registerSheet(scene, {
            textureKey: 'tex_hero_idle',
            metaKey: 'hero_idle_meta',
            animKey: 'hero_idle',
            framePrefix: 'idle'
        });
        HeroAnimLoader.registerSheet(scene, {
            textureKey: 'tex_hero_run',
            metaKey: 'hero_run_meta',
            animKey: 'hero_run',
            framePrefix: 'run'
        });
        HeroAnimLoader.registerSheet(scene, {
            textureKey: 'tex_hero_attack',
            metaKey: 'hero_attack_meta',
            animKey: 'hero_attack',
            framePrefix: 'attack',
            repeat: 0
        });
        HeroAnimLoader.registerSheet(scene, {
            textureKey: 'tex_hero_dash',
            metaKey: 'hero_dash_meta',
            animKey: 'hero_dash',
            framePrefix: 'dash'
        });
    }

    static registerSheet(scene, { textureKey, metaKey, animKey, framePrefix, repeat = -1 }) {
        if (!scene.textures.exists(textureKey)) return;
        const meta = scene.cache.json.get(metaKey);
        if (!meta || !Array.isArray(meta.frames) || meta.frames.length === 0) return;

        const texture = scene.textures.get(textureKey);
        const sorted = meta.frames.slice().sort((a, b) => a.index - b.index);

        sorted.forEach((frame) => {
            texture.add(`${framePrefix}_${frame.index}`, 0, frame.x, frame.y, frame.w, frame.h);
        });

        const animFrames = sorted.map((frame, i) => {
            const next = sorted[i + 1];
            const prev = sorted[i - 1];
            let durationMs;
            if (next) {
                durationMs = (next.time - frame.time) * 1000;
            } else if (prev) {
                durationMs = (frame.time - prev.time) * 1000;
            } else {
                durationMs = 100;
            }
            return {
                key: textureKey,
                frame: `${framePrefix}_${frame.index}`,
                duration: Math.max(16, Math.round(durationMs))
            };
        });

        if (scene.anims.exists(animKey)) {
            scene.anims.remove(animKey);
        }
        scene.anims.create({
            key: animKey,
            frames: animFrames,
            repeat: repeat
        });
    }
}
