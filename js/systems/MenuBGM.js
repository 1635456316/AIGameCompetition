/**
 * MenuBGM —— 主菜单 / 关卡选择共享的背景音乐管理器。
 *
 * 设计目标：
 * 1. MenuScene 与 LevelSelectScene 共用同一首 BGM，玩家在两者间来回切换时不会出现切歌/停顿。
 * 2. 进入 GameScene / PVScene 等"内容场景"前显式调用 MenuBGM.stop()，避免与场内 BGM 重叠。
 * 3. 自动处理浏览器音频策略：AudioContext 解锁、Phaser sound.UNLOCKED、全局 user gesture 兜底。
 *
 * 使用方式：
 *   MenuBGM.play(this)   - 在场景 create() 末尾调用即可，重复调用安全（已在播则跳过）。
 *   MenuBGM.stop()       - 退出"菜单类场景"前调用。
 *   MenuBGM.syncVolume() - 设置页改音量时调用。
 *
 * 注意：声音实例挂在 game.sound 全局管理器上，跨场景持久存在，
 *      只要不主动 stop 就会一直循环播放。
 */
class MenuBGM {
    static _sound = null;
    static _globalCleanup = null;

    static play(scene) {
        if (!scene || !scene.sound || !scene.cache || !scene.cache.audio) return;
        // 页面失焦/隐藏时不让 Phaser 自动暂停；后续 focus/visibilitychange 会主动重试播放。
        scene.sound.pauseOnBlur = false;
        if (!scene.cache.audio.exists('bgm_menu')) {
            console.warn('[MenuBGM] bgm_menu 未在音频缓存中，请检查 BootScene 是否成功加载 assets/audio/MainMenu.mp3');
            return;
        }

        let bgm = MenuBGM._sound;
        if (!bgm || bgm.destroyed) {
            bgm = scene.sound.get('bgm_menu') || scene.sound.add('bgm_menu', {
                loop: true,
                volume: SaveSystem.getVolume()
            });
            MenuBGM._sound = bgm;
        } else {
            // 已有实例，刷新一下音量以匹配最新设置
            try { bgm.setVolume(SaveSystem.getVolume()); } catch (e) {}
        }

        const ctx = scene.sound && scene.sound.context;
        const tryPlay = () => {
            try {
                if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
                    ctx.resume();
                }
            } catch (e) {}
            if (bgm && !bgm.isPlaying) {
                try { bgm.play(); } catch (e) {}
            }
            return bgm && bgm.isPlaying;
        };

        if (tryPlay()) return;

        // Phaser 的解锁事件（仅 WebAudio 在 locked 状态时触发）
        if (scene.sound.locked) {
            scene.sound.once(Phaser.Sound.Events.UNLOCKED, () => tryPlay());
        }

        // 全局兜底：场景级 input 在 SHUTDOWN 后会被清除。
        // focus / visibilitychange 用于处理"页面启动时没焦点，AudioContext 仍 suspended"的情况。
        if (MenuBGM._globalCleanup) MenuBGM._globalCleanup();
        const windowEvents = ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'focus', 'pageshow'];
        const documentEvents = ['visibilitychange'];
        const onInput = () => {
            if (tryPlay()) cleanup();
        };
        const cleanup = () => {
            windowEvents.forEach((ev) => window.removeEventListener(ev, onInput, true));
            documentEvents.forEach((ev) => document.removeEventListener(ev, onInput, true));
            MenuBGM._globalCleanup = null;
        };
        windowEvents.forEach((ev) => window.addEventListener(ev, onInput, true));
        documentEvents.forEach((ev) => document.addEventListener(ev, onInput, true));
        MenuBGM._globalCleanup = cleanup;
    }

    static isPlaying() {
        return !!(MenuBGM._sound && MenuBGM._sound.isPlaying);
    }

    static syncVolume() {
        if (MenuBGM._sound) {
            try { MenuBGM._sound.setVolume(SaveSystem.getVolume()); } catch (e) {}
        }
    }

    static stop(options) {
        const opts = options || {};
        if (MenuBGM._globalCleanup) {
            MenuBGM._globalCleanup();
            MenuBGM._globalCleanup = null;
        }
        const bgm = MenuBGM._sound;
        MenuBGM._sound = null;
        if (!bgm) return;
        if (!bgm.isPlaying) {
            try { bgm.stop(); } catch (e) {}
            return;
        }
        if (opts.immediate) {
            try { bgm.stop(); } catch (e) {}
            return;
        }
        // 自行用 rAF 淡出，避免依赖任意场景的 tweens（调用方可能正在 SHUTDOWN）
        const startVol = typeof bgm.volume === 'number' ? bgm.volume : SaveSystem.getVolume();
        const duration = opts.fadeDuration || 320;
        const startTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const step = () => {
            const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            const t = Math.min(1, (now - startTime) / duration);
            try { bgm.setVolume(startVol * (1 - t)); } catch (e) {}
            if (t >= 1) {
                try { bgm.stop(); } catch (e) {}
                try { bgm.setVolume(startVol); } catch (e) {}
                return;
            }
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }
}
