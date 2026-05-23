class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        const save = SaveSystem.load();
        const hasProgress = !!save.hasWatchedIntroPV
            || (Array.isArray(save.completedLevels) && save.completedLevels.length > 0)
            || (save.unlockedLevel && save.unlockedLevel > 1);

        // 主菜单待机视频：使用 DOM video 放在 canvas 后面，避免 Phaser 视频黑屏。
        this._createMenuVideoBackground();
        this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

        // 主菜单 BGM
        this._startMenuBGM();

        // 暗化背景，提升 UI 对比度
        this.add.rectangle(width / 2, height / 2, width, height, 0x05060e, 0.34);

        // 扫描线，特摄电视质感
        const scan = this.add.graphics().setDepth(1000);
        scan.fillStyle(0x000000, 0.12);
        for (let y = 0; y < height; y += 4) scan.fillRect(0, y, width, 2);

        // 装饰：左上电池条 / 右上警告框
        this._addDeco('ui_deco_battery', 115, 60, 240);
        this._addDeco('ui_deco_warning', 1070, 90, 430);

        // 标题 Logo（右半画面）
        const logo = this.add.image(800, 320, 'ui_logo');
        const logoTargetWidth = 560;
        if (logo.width > 0) logo.setScale(logoTargetWidth / logo.width);
        logo.setDepth(20);
        this.tweens.add({
            targets: logo,
            scale: { from: logo.scale, to: logo.scale * 1.025 },
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // 4 个按钮（左半画面）
        const menuItems = [
            {
                key: 'ui_btn_start',
                label: '开始游戏',
                enabled: true,
                action: () => this._startGameFlow(save, false)
            },
            {
                key: 'ui_btn_continue',
                label: '继续游戏',
                enabled: hasProgress,
                action: () => this._startGameFlow(save, true)
            },
            {
                key: 'ui_btn_setting',
                label: '游戏设置',
                enabled: true,
                action: () => {
                    this._keepMenuBGM = true;
                    this.scene.start('SettingsScene');
                }
            },
            {
                key: 'ui_btn_exit',
                label: '退出游戏',
                enabled: true,
                action: () => this._exitGame()
            }
        ];

        const btnStartY = 315;
        const btnGap = 105;
        const btnX = 210;
        this.menuButtons = menuItems.map((item, index) => {
            return this._createImageButton(
                btnX,
                btnStartY + index * btnGap,
                item.key,
                item.label,
                item.enabled,
                item.action
            );
        });

        // 右下角装饰：雷达状态 + 爪印徽章
        this._addDeco('ui_deco_radar', 1040, 645, 320);
        this._addDeco('ui_deco_paw',   1230, 640, 90);

        // 底部版权
        this.add.text(width / 2, height - 14, '© 199X DRAGON DEFENSE FORCE', {
            font: 'bold 11px Arial',
            color: '#7f8998'
        }).setOrigin(0.5).setAlpha(0.7).setDepth(20);

        // Enter 快捷键：开始游戏
        this.input.keyboard.once('keydown-ENTER', () => this._startGameFlow(save, false));
    }

    _addDeco(key, x, y, targetWidth) {
        const img = this.add.image(x, y, key).setDepth(15);
        if (img.width > 0 && targetWidth) {
            img.setScale(targetWidth / img.width);
        }
        return img;
    }

    _createImageButton(x, y, textureKey, label, enabled, action) {
        const container = this.add.container(x, y).setDepth(30);

        const bg = this.add.image(0, 0, textureKey);
        const targetWidth = 380;
        if (bg.width > 0) bg.setScale(targetWidth / bg.width);
        bg.setOrigin(0.5, 0.5);

        // 文字：按钮图右半部分（左半已被图标 + START/头盔/齿轮/退出 占用）
        const text = this.add.text(50, -2, label, {
            font: 'bold 28px Microsoft YaHei, Arial',
            color: '#e8faff',
            stroke: '#001428',
            strokeThickness: 5
        }).setOrigin(0.5);

        container.add([bg, text]);

        if (!enabled) {
            container.setAlpha(0.45);
            bg.setTint(0x4d5566);
            text.setColor('#88a0b8');
            return container;
        }

        // 命中区域：用按钮图的真实显示尺寸
        const hitW = bg.displayWidth * 0.92;
        const hitH = bg.displayHeight * 0.72;
        const hitZone = this.add.zone(x, y, hitW, hitH)
            .setInteractive({ useHandCursor: true })
            .setDepth(31);

        const baseScale = container.scale;
        hitZone.on('pointerover', () => {
            bg.setTint(0xb8f4ff);
            text.setColor('#ffd400');
            this.tweens.add({
                targets: container,
                scale: baseScale * 1.05,
                duration: 110,
                ease: 'Sine.easeOut'
            });
        });
        hitZone.on('pointerout', () => {
            bg.clearTint();
            text.setColor('#e8faff');
            this.tweens.add({
                targets: container,
                scale: baseScale,
                duration: 130,
                ease: 'Sine.easeOut'
            });
        });
        hitZone.on('pointerdown', () => {
            this.tweens.add({
                targets: container,
                scale: baseScale * 0.96,
                duration: 70,
                yoyo: true,
                onComplete: action
            });
        });

        return container;
    }

    /**
     * fromContinue=false 表示"开始游戏"——播放开场 PV 后进入选关；
     * fromContinue=true 表示"继续游戏"——直接进入选关。
     */
    _startGameFlow(save, fromContinue) {
        if (fromContinue) {
            this.scene.start('LevelSelectScene');
            return;
        }

        if (save.hasWatchedIntroPV) {
            this.scene.start('LevelSelectScene');
            return;
        }

        this.scene.start('PVScene', {
            videoKey: 'video_intro_pv',
            videoUrl: 'assets/video/PV-开始.mp4',
            nextScene: 'LevelSelectScene',
            markIntroWatched: true,
            pvId: 'intro',
            title: '开场 PV'
        });
    }

    _exitGame() {
        // 浏览器一般会拒绝 window.close() 关闭非脚本打开的窗口，做一个 fallback 黑屏。
        try { window.close(); } catch (e) {}

        const w = this.cameras.main.width;
        const h = this.cameras.main.height;
        const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0)
            .setDepth(5000);
        const tip = this.add.text(w / 2, h / 2, '感 谢 游 玩\n请关闭网页窗口', {
            font: 'bold 36px Microsoft YaHei, Arial',
            color: '#ffffff',
            align: 'center',
            stroke: '#000', strokeThickness: 6
        }).setOrigin(0.5).setDepth(5001).setAlpha(0);

        this.tweens.add({ targets: overlay, alpha: 0.95, duration: 380 });
        this.tweens.add({ targets: tip, alpha: 1, duration: 380, delay: 200 });
        this._destroyMenuVideoBackground();
    }

    _createMenuVideoBackground() {
        this._destroyMenuVideoBackground();

        const canvas = this.game.canvas;
        // 先把原始 inline 样式存下来，离开主菜单时恢复，避免污染其它场景的居中/缩放。
        this._canvasOriginalStyle = {
            position: canvas.style.position,
            zIndex: canvas.style.zIndex,
            background: canvas.style.background
        };
        // 用 relative 不脱离 body 的 flex 居中，只为了让 zIndex 生效。
        canvas.style.position = 'relative';
        canvas.style.zIndex = '2';
        canvas.style.background = 'transparent';

        const video = document.createElement('video');
        video.src = 'assets/video/主界面待机.mp4';
        video.preload = 'auto';
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.volume = 0;
        video.playsInline = true;
        // 跟随 canvas 的实际显示区域，避免 UI 在中间而视频铺满整个窗口的不协调感。
        video.style.position = 'fixed';
        video.style.zIndex = '1';
        video.style.pointerEvents = 'none';
        video.style.background = '#000';
        video.style.objectFit = 'cover';
        this._menuDomVideo = video;
        document.body.appendChild(video);

        this._menuVideoResize = () => {
            const rect = canvas.getBoundingClientRect();
            video.style.left = `${rect.left}px`;
            video.style.top = `${rect.top}px`;
            video.style.width = `${rect.width}px`;
            video.style.height = `${rect.height}px`;
        };
        video.addEventListener('loadedmetadata', this._menuVideoResize);
        window.addEventListener('resize', this._menuVideoResize);
        // Phaser 的 scale 事件比 window.resize 更准（包含 autoCenter 等内部计算）。
        this.scale.on('resize', this._menuVideoResize);
        // 初次延后一帧执行，保证 canvas 已经布局完成。
        this._menuVideoResize();
        requestAnimationFrame(this._menuVideoResize);

        video.play().catch(() => {});

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._destroyMenuVideoBackground());
    }

    _destroyMenuVideoBackground() {
        if (this._menuVideoResize) {
            window.removeEventListener('resize', this._menuVideoResize);
            try { this.scale.off('resize', this._menuVideoResize); } catch (e) {}
            this._menuVideoResize = null;
        }
        if (this._menuDomVideo) {
            try { this._menuDomVideo.pause(); } catch (e) {}
            this._menuDomVideo.remove();
            this._menuDomVideo = null;
        }
        // 恢复 canvas inline 样式，避免影响 LevelSelectScene 等后续场景。
        if (this._canvasOriginalStyle) {
            const canvas = this.game.canvas;
            canvas.style.position = this._canvasOriginalStyle.position || '';
            canvas.style.zIndex = this._canvasOriginalStyle.zIndex || '';
            canvas.style.background = this._canvasOriginalStyle.background || '';
            this._canvasOriginalStyle = null;
            // 让 ScaleManager 重新计算一次，确保 FIT 居中正常。
            try { this.scale.refresh(); } catch (e) {}
        }
    }

    _startMenuBGM() {
        if (!this.cache.audio.exists('bgm_menu')) {
            console.warn('[BGM] bgm_menu 未在音频缓存中，请检查 BootScene 是否成功加载 assets/audio/MainMenu.mp3');
            return;
        }

        let bgm = this.sound.get('bgm_menu');
        if (!bgm) {
            bgm = this.sound.add('bgm_menu', { loop: true, volume: SaveSystem.getVolume() });
        } else {
            bgm.setVolume(SaveSystem.getVolume());
        }
        this._menuBGM = bgm;

        const ctx = this.sound && this.sound.context;
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

        const playedNow = tryPlay();
        console.log('[BGM] 尝试播放主菜单 BGM, sound.locked=', this.sound.locked,
            'ctx.state=', ctx && ctx.state, 'isPlaying=', playedNow);

        // Phaser 自身的解锁事件（仅 WebAudio 在 locked 状态时会触发）
        if (this.sound.locked) {
            this.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
                console.log('[BGM] Phaser sound unlocked');
                tryPlay();
            });
        }

        // 兜底：监听 window 级别的首次用户交互（Phaser 场景级输入在 SHUTDOWN 后会被清除）
        const globalEvents = ['pointerdown', 'mousedown', 'touchstart', 'keydown'];
        const onGlobalInput = () => {
            const ok = tryPlay();
            if (ok) cleanupGlobal();
        };
        const cleanupGlobal = () => {
            globalEvents.forEach((ev) => window.removeEventListener(ev, onGlobalInput, true));
        };
        globalEvents.forEach((ev) => window.addEventListener(ev, onGlobalInput, true));
        this._menuBGMGlobalCleanup = cleanupGlobal;

        // 离开主菜单时淡出并停止
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._stopMenuBGM());
    }

    _stopMenuBGM() {
        if (this._menuBGMGlobalCleanup) {
            this._menuBGMGlobalCleanup();
            this._menuBGMGlobalCleanup = null;
        }
        const bgm = this._menuBGM;
        this._menuBGM = null;
        if (this._keepMenuBGM) {
            this._keepMenuBGM = false;
            return;
        }
        if (!bgm) return;
        if (!bgm.isPlaying) {
            try { bgm.stop(); } catch (e) {}
            return;
        }
        // 场景已 SHUTDOWN，无法用 this.tweens，这里用 rAF 自行淡出。
        const startVol = typeof bgm.volume === 'number' ? bgm.volume : 0.55;
        const duration = 320;
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
