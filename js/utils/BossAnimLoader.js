/**
 * Boss 序列帧注册（复用 HeroAnimLoader 的 sheet 解析逻辑）。
 */
class BossAnimLoader {
    static registerAll(scene) {
        HeroAnimLoader.registerSheet(scene, {
            textureKey: 'tex_boss1_idle',
            metaKey: 'boss1_idle_meta',
            animKey: 'boss1_idle',
            framePrefix: 'idle',
            repeat: -1
        });
        HeroAnimLoader.registerSheet(scene, {
            textureKey: 'tex_boss_final_idle',
            metaKey: 'boss_final_idle_meta',
            animKey: 'boss_final_idle',
            framePrefix: 'final_idle',
            repeat: -1
        });
    }
}
