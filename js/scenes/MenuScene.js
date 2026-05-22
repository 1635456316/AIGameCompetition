class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        const save = SaveSystem.load();
        const unlockedLevel = save.unlockedLevel || 1;
        const completedCount = Array.isArray(save.completedLevels) ? save.completedLevels.length : 0;

        // 主菜单待机视频：使用 DOM video 放在 canvas 后面，避免 Phaser 视频黑屏。
        this._createMenuVideoBackground();
        this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

        // 主菜单 BGM
        this._startMenuBGM();

        this._createVideoGrade(width, height);
        this._createWarningFrame(width, height);

        const scan = this.add.graphics();
        scan.fillStyle(0x000000, 0.14);
        for (let y = 0; y < height; y += 4) {
            scan.fillRect(0, y, width, 2);
        }
        scan.setDepth(1000);

        const titleShadow = this.add.text(82, 116, '无敌\n暴龙战士', {
            font: 'bold 86px Arial',
            color: '#050509',
            stroke: '#050509',
            strokeThickness: 16,
            lineSpacing: -14
        }).setOrigin(0, 0);

        const title = this.add.text(72, 108, '无敌\n暴龙战士', {
            font: 'bold 86px Arial',
            color: PaletteHex.danger,
            stroke: '#050509',
            strokeThickness: 12,
            lineSpacing: -14
        }).setOrigin(0, 0);

        title.setShadow(0, 0, '#ff2b2b', 18, true, true);
        this.tweens.add({
            targets: [title, titleShadow],
            x: '+=8',
            duration: 70,
            yoyo: true,
            repeat: -1,
            repeatDelay: 1300,
            ease: 'Stepped'
        });

        this.add.text(78, 292, 'INVINCIBLE DRAGON FIGHTER', {
            font: 'bold 22px Arial',
            color: PaletteHex.warning,
            stroke: '#000000',
            strokeThickness: 5
        }).setOrigin(0, 0.5);

        this.add.text(78, 334, 'TOKUSATSU EMERGENCY BROADCAST', {
            font: 'bold 13px Arial',
            color: '#9eefff'
        }).setOrigin(0, 0.5).setAlpha(0.9);

        const progressLabel = `LEVEL ${unlockedLevel} READY  /  ${completedCount} CLEARED`;
        this._createStatusPill(78, 374, progressLabel);

        const menuItems = [
            {
                label: save.hasWatchedIntroPV ? '继续作战' : '开始游戏',
                accent: Palette.hero,
                action: () => this._startGameFlow(save)
            },
            {
                label: '关卡选择',
                accent: Palette.warning,
                action: () => this.scene.start('LevelSelectScene')
            },
            {
                label: '设置',
                accent: Palette.energy,
                action: () => {
                    this._keepMenuBGM = true;
                    this.scene.start('SettingsScene');
                }
            },
            {
                label: '重置存档',
                accent: Palette.danger,
                action: () => {
                    this._keepMenuBGM = true;
                    SaveSystem.reset();
                    this.scene.restart();
                }
            }
        ];

        const menuStartY = 408;
        const pulse = this.add.rectangle(256, menuStartY + 16, 354, 42, Palette.hero, 0.14)
            .setStrokeStyle(1, Palette.hero, 0.5);
        this.tweens.add({
            targets: pulse,
            alpha: { from: 0.14, to: 0.34 },
            duration: 760,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.menuButtons = menuItems.map((item, index) => {
            return this._createMenuButton(78, menuStartY + index * 58, 360, item.label, item.accent, item.action);
        });

        this.add.text(78, height - 42, '© 199X DRAGON DEFENSE FORCE', {
            font: 'bold 12px Arial',
            color: '#7f8998'
        }).setOrigin(0, 0.5).setAlpha(0.85);

        this.input.keyboard.once('keydown-ENTER', () => this._startGameFlow(save));
    }

    _createVideoGrade(width, height) {
        this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.26);
        this.add.rectangle(260, height / 2, 560, height, 0x03040a, 0.72);
        this.add.rectangle(590, height / 2, 140, height, 0x03040a, 0.34).setAngle(-8);

        const vignette = this.add.graphics();
        vignette.fillStyle(0x000000, 0.36);
        vignette.fillRect(0, 0, width, 46);
        vignette.fillRect(0, height - 56, width, 56);
        vignette.fillRect(0, 0, 42, height);
        vignette.fillRect(width - 42, 0, 42, height);
    }

    _createWarningFrame(width, height) {
        const frame = this.add.graphics();
        frame.lineStyle(3, Palette.danger, 0.82);
        frame.strokeRect(28, 24, width - 56, height - 48);
        frame.lineStyle(1, Palette.warning, 0.55);
        frame.strokeRect(42, 38, width - 84, height - 76);

        for (let index = 0; index < 9; index++) {
            const x = 50 + index * 44;
            frame.fillStyle(index % 2 === 0 ? Palette.danger : Palette.warning, 0.78);
            frame.fillRect(x, 48, 26, 5);
        }

        this.add.text(width - 54, 50, 'SIGNAL: LIVE', {
            font: 'bold 13px Arial',
            color: PaletteHex.warning,
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(1, 0.5);
    }

    _createStatusPill(x, y, label) {
        const width = 318;
        this.add.rectangle(x + width / 2, y, width, 30, 0x08121c, 0.86)
            .setStrokeStyle(2, Palette.hero, 0.76);
        this.add.text(x + 16, y, label, {
            font: 'bold 13px Arial',
            color: '#dffbff'
        }).setOrigin(0, 0.5);
    }

    _createMenuButton(x, y, width, label, accent, action) {
        const button = this.add.container(x, y);
        const background = this.add.rectangle(width / 2, 0, width, 50, 0x070b12, 0.88)
            .setStrokeStyle(2, accent, 0.72);
        const marker = this.add.rectangle(16, 0, 8, 34, accent, 0.95);
        const text = this.add.text(42, 0, label, {
            font: 'bold 25px Arial',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 5
        }).setOrigin(0, 0.5);
        const chevron = this.add.text(width - 30, 0, '>', {
            font: 'bold 26px Arial',
            color: PaletteHex.warning,
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        button.add([background, marker, text, chevron]);
        const hitZone = this.add.zone(x + width / 2, y, width, 50).setInteractive({ useHandCursor: true });

        hitZone.on('pointerover', () => {
            background.setFillStyle(0x101c2d, 0.96);
            background.setStrokeStyle(3, Palette.warning, 0.95);
            marker.setScale(1.25, 1);
            text.setColor(PaletteHex.warning);
            this.tweens.add({ targets: button, x: x + 10, duration: 90, ease: 'Sine.easeOut' });
        });
        hitZone.on('pointerout', () => {
            background.setFillStyle(0x070b12, 0.88);
            background.setStrokeStyle(2, accent, 0.72);
            marker.setScale(1, 1);
            text.setColor('#ffffff');
            this.tweens.add({ targets: button, x, duration: 120, ease: 'Sine.easeOut' });
        });
        hitZone.on('pointerdown', action);
        return button;
    }

    _startGameFlow(save) {
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

    _createMenuVideoBackground() {
        this._destroyMenuVideoBackground();

        this.game.canvas.style.position = 'relative';
        this.game.canvas.style.zIndex = '1';
        this.game.canvas.style.background = 'transparent';

        const video = document.createElement('video');
        video.src = 'assets/video/主界面待机.mp4';
        video.preload = 'auto';
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.volume = 0;
        video.playsInline = true;
        video.style.position = 'fixed';
        video.style.left = '50%';
        video.style.top = '50%';
        video.style.transform = 'translate(-50%, -50%)';
        video.style.zIndex = '0';
        video.style.pointerEvents = 'none';
        video.style.background = '#000';
        this._menuDomVideo = video;
        document.body.appendChild(video);

        this._menuVideoResize = () => {
            const vw = video.videoWidth || 1280;
            const vh = video.videoHeight || 720;
            const scale = Math.max(window.innerWidth / vw, window.innerHeight / vh);
            video.style.width = `${vw * scale}px`;
            video.style.height = `${vh * scale}px`;
        };
        video.addEventListener('loadedmetadata', this._menuVideoResize);
        window.addEventListener('resize', this._menuVideoResize);
        this._menuVideoResize();

        video.play().catch(() => {});

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._destroyMenuVideoBackground());
    }

    _destroyMenuVideoBackground() {
        if (this._menuVideoResize) {
            window.removeEventListener('resize', this._menuVideoResize);
            this._menuVideoResize = null;
        }
        if (this._menuDomVideo) {
            try { this._menuDomVideo.pause(); } catch (e) {}
            this._menuDomVideo.remove();
            this._menuDomVideo = null;
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
