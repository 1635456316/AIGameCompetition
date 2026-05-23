class MenuScene extends Phaser.Scene {
    // 跨场景实例记忆当前主菜单待机视频索引（用于"重新进入主菜单时也轮换下一个"）。
    // -1 表示尚未播放过，首次进入会从索引 0 开始。
    static _lastMenuVideoIndex = -1;

    constructor() {
        super('MenuScene');
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        const save = SaveSystem.load();

        // 主菜单待机视频：使用 DOM video 放在 canvas 后面，避免 Phaser 视频黑屏。
        this._createMenuVideoBackground();
        this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

        // 主菜单 / 关卡选择共享 BGM，跨场景持续播放。
        MenuBGM.play(this);

        // 暗化背景，提升 UI 对比度
        this.add.rectangle(width / 2, height / 2, width, height, 0x05060e, 0.34);

        // 扫描线，特摄电视质感
        const scan = this.add.graphics().setDepth(1000);
        scan.fillStyle(0x000000, 0.12);
        for (let y = 0; y < height; y += 4) scan.fillRect(0, y, width, 2);

        // 装饰：左上电池条 / 右上警告框
        this._addDeco('ui_deco_battery', 125, 50, 240);
        this._addDeco('ui_deco_warning', 1070, 90, 430);

        // 标题 Logo（画面顶部居中偏左，让出右半边给暴龙战士角色作为视觉主体）
        // 设计稿位置：x≈480, y≈115；尺寸缩小到约 400px 宽，避免挡住角色。
        const logo = this.add.image(480, 115, 'ui_logo');
        const logoTargetWidth = 400;
        if (logo.width > 0) logo.setScale(logoTargetWidth / logo.width);
        logo.setDepth(20);
        this.tweens.add({
            targets: logo,
            scale: { from: logo.scale, to: logo.scale * 1.03 },
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // 4 个按钮（左半画面）
        // 按钮 1：首次开始游戏 → 强制播放总开场 PV，再进入关卡选择界面。
        //         此后开始游戏直接跳转关卡选择；具体关卡 PV 仍由"进入关卡"触发。
        // 按钮 4：全屏切换 - 进入/退出浏览器全屏，文字会跟随当前全屏状态。
        const menuItems = [
            {
                key: 'ui_btn_start',
                label: '开始游戏',
                enabled: true,
                action: () => this._startGame()
            },
            {
                key: 'ui_btn_continue',
                label: '操作说明',
                enabled: true,
                action: () => this._showHelpPanel()
            },
            {
                key: 'ui_btn_setting',
                label: '游戏设置',
                enabled: true,
                action: () => this._showSettingsPanel()
            },
            {
                key: 'ui_btn_exit',
                label: this._isFullscreen() ? '退出全屏' : '进入全屏',
                enabled: true,
                action: () => this._toggleFullscreen()
            }
        ];

        // 按钮组居中偏上，让画面整体留白更平衡：4 个按钮范围 y=270~585
        const btnStartY = 270;
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

        // 全屏按钮是第 4 个，引用住它的 text 节点，全屏状态变化时实时刷新文字。
        const fsButton = this.menuButtons[3];
        this._fsButtonText = fsButton && fsButton.list && fsButton.list[1];
        this._fsChangeHandler = () => {
            if (this._fsButtonText && this._fsButtonText.setText) {
                this._fsButtonText.setText(this._isFullscreen() ? '退出全屏' : '进入全屏');
            }
        };
        document.addEventListener('fullscreenchange', this._fsChangeHandler);
        document.addEventListener('webkitfullscreenchange', this._fsChangeHandler);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            document.removeEventListener('fullscreenchange', this._fsChangeHandler);
            document.removeEventListener('webkitfullscreenchange', this._fsChangeHandler);
        });

        // 右下角装饰：雷达状态 + 爪印徽章
        this._addDeco('ui_deco_radar', 1040, 645, 320);
        this._addDeco('ui_deco_paw',   1230, 640, 90);

        // 底部版权
        this.add.text(width / 2, height - 14, '© 199X DRAGON DEFENSE FORCE', {
            font: 'bold 11px Arial',
            color: '#7f8998'
        }).setOrigin(0.5).setAlpha(0.7).setDepth(20);

        // Enter 快捷键：等同点击"开始游戏"按钮
        this.input.keyboard.once('keydown-ENTER', () => this._startGame());
    }

    _startGame() {
        if (!SaveSystem.hasIntroWatched()) {
            MenuBGM.stop();
            this.scene.start('PVScene', {
                videoUrl: 'assets/video/PV-开始.mp4',
                nextScene: 'LevelSelectScene',
                title: '开 场 PV',
                markIntroWatched: true
            });
            return;
        }

        this.scene.start('LevelSelectScene');
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

    _isFullscreen() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    _toggleFullscreen() {
        try {
            if (this._isFullscreen()) {
                const exit = document.exitFullscreen || document.webkitExitFullscreen;
                if (exit) exit.call(document);
            } else {
                const root = document.documentElement;
                const enter = root.requestFullscreen || root.webkitRequestFullscreen;
                if (enter) enter.call(root);
            }
        } catch (e) {
            console.warn('[Fullscreen] 切换失败：', e);
        }
    }

    _showHelpPanel() {
        if (this._helpVisible) return;
        this._helpVisible = true;

        const w = this.cameras.main.width;
        const h = this.cameras.main.height;
        const depthBase = 4000;

        // 拦截下层点击（注意：rectangle 必须先 setInteractive 再放到 container 里）
        const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0)
            .setInteractive();
        const panelW = 720;
        const panelH = 480;
        const panel = this.add.rectangle(w / 2, h / 2, panelW, panelH, 0x0a1020, 0.96)
            .setStrokeStyle(3, Palette.warning, 0.9);
        const title = this.add.text(w / 2, h / 2 - panelH / 2 + 44, '操 作 说 明', {
            font: 'bold 36px Microsoft YaHei, Arial',
            color: PaletteHex.warning,
            stroke: '#000', strokeThickness: 6
        }).setOrigin(0.5);

        const rows = [
            ['移  动', 'A / D    或    ← / →'],
            ['跳  跃', 'W / 空格 / ↑（支持二段跳）'],
            ['冲  刺', 'Shift（冲刺期间无敌，可穿过子弹）'],
            ['近  战', 'J    (主要攻击手段)'],
            ['远程射击', 'K    (消耗能量)'],
            ['终 极 技', 'L    (能量满时释放)'],
            ['暂  停', 'ESC    或    点击右上角"暂停"按钮']
        ];
        const colLabelX = w / 2 - panelW / 2 + 70;
        const colValueX = w / 2 - 40;
        const startY = h / 2 - panelH / 2 + 110;
        const rowGap = 42;

        const rowTexts = [];
        rows.forEach((row, i) => {
            const y = startY + i * rowGap;
            rowTexts.push(this.add.text(colLabelX, y, row[0], {
                font: 'bold 20px Microsoft YaHei, Arial',
                color: PaletteHex.hero,
                stroke: '#000', strokeThickness: 4
            }).setOrigin(0, 0.5));
            rowTexts.push(this.add.text(colValueX, y, row[1], {
                font: 'bold 18px Microsoft YaHei, Arial',
                color: '#e8faff',
                stroke: '#000', strokeThickness: 3
            }).setOrigin(0, 0.5));
        });

        const closeBtnY = h / 2 + panelH / 2 - 50;
        const closeBg = this.add.rectangle(w / 2, closeBtnY, 200, 50, 0x070b12, 0.95)
            .setStrokeStyle(2, Palette.warning, 0.85)
            .setInteractive({ useHandCursor: true });
        const closeText = this.add.text(w / 2, closeBtnY, '关  闭', {
            font: 'bold 22px Microsoft YaHei, Arial',
            color: '#ffffff',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5);

        closeBg.on('pointerover', () => {
            closeBg.setFillStyle(0x12243a, 1);
            closeText.setColor(PaletteHex.warning);
        });
        closeBg.on('pointerout', () => {
            closeBg.setFillStyle(0x070b12, 0.95);
            closeText.setColor('#ffffff');
        });

        // 用 container 持有所有节点，关闭时一键销毁。
        // 注意：interactive 已挂在 overlay/closeBg 本体上，加入 container 不会失效。
        const helpContainer = this.add.container(0, 0,
            [overlay, panel, title, ...rowTexts, closeBg, closeText]
        ).setDepth(depthBase);

        // 淡入
        overlay.setAlpha(0);
        panel.setAlpha(0);
        title.setAlpha(0);
        rowTexts.forEach(t => t.setAlpha(0));
        closeBg.setAlpha(0);
        closeText.setAlpha(0);
        this.tweens.add({ targets: overlay, alpha: 0.7, duration: 220 });
        this.tweens.add({ targets: [panel, title, closeBg, closeText], alpha: 1, duration: 240, delay: 80 });
        rowTexts.forEach((t, i) => {
            this.tweens.add({ targets: t, alpha: 1, duration: 220, delay: 160 + Math.floor(i / 2) * 40 });
        });

        const close = () => {
            if (!this._helpVisible) return;
            this._helpVisible = false;
            this.input.keyboard.off('keydown-ESC', close);
            helpContainer.destroy(true);
        };
        closeBg.on('pointerdown', close);
        this.input.keyboard.on('keydown-ESC', close);
    }

    /**
     * 游戏设置弹窗：与"操作说明"采用相同的弹窗风格。
     * 主要包含：音量滑块（鼠标拖拽 + 点击）、-10% / +10% / 静音 / 默认 四个步进按钮。
     * 键盘快捷键：← / → 调节音量、M 静音切换、ESC 关闭。
     */
    _showSettingsPanel() {
        if (this._settingsVisible) return;
        this._settingsVisible = true;

        const w = this.cameras.main.width;
        const h = this.cameras.main.height;
        const depthBase = 4000;

        const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0)
            .setInteractive();
        const panelW = 720;
        const panelH = 480;
        const panel = this.add.rectangle(w / 2, h / 2, panelW, panelH, 0x0a1020, 0.96)
            .setStrokeStyle(3, Palette.warning, 0.9);
        const title = this.add.text(w / 2, h / 2 - panelH / 2 + 44, '系 统 设 置', {
            font: 'bold 36px Microsoft YaHei, Arial',
            color: PaletteHex.warning,
            stroke: '#000', strokeThickness: 6
        }).setOrigin(0.5);

        // 当前音量状态，关闭后由 SaveSystem 持久化
        const settings = { volume: SaveSystem.getVolume() };

        // 区段：主音量 label + 数值
        const sectionY = h / 2 - 80;
        const volumeLabel = this.add.text(w / 2 - panelW / 2 + 60, sectionY, '主音量', {
            font: 'bold 26px Microsoft YaHei, Arial',
            color: '#ffffff',
            stroke: '#000', strokeThickness: 5
        }).setOrigin(0, 0.5);
        const volumeText = this.add.text(w / 2 + panelW / 2 - 60, sectionY, '', {
            font: 'bold 26px Microsoft YaHei, Arial',
            color: PaletteHex.warning,
            stroke: '#000', strokeThickness: 5
        }).setOrigin(1, 0.5);

        // 滑块：背景轨 + 填充 + 滑块头
        const sliderX = w / 2 - panelW / 2 + 60;
        const sliderY = sectionY + 60;
        const sliderWidth = panelW - 120;
        const sliderTrack = this.add.rectangle(sliderX + sliderWidth / 2, sliderY, sliderWidth, 16, 0x121827, 1)
            .setStrokeStyle(2, Palette.hero, 0.72);
        const sliderFill = this.add.rectangle(sliderX, sliderY, 1, 16, Palette.warning, 0.95)
            .setOrigin(0, 0.5);
        const sliderKnob = this.add.rectangle(sliderX, sliderY, 22, 46, Palette.hero, 0.96)
            .setStrokeStyle(2, Palette.warning, 0.9);
        const blocksText = this.add.text(sliderX, sliderY + 38, '', {
            font: 'bold 16px Microsoft YaHei, Arial',
            color: PaletteHex.hero,
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0, 0.5);

        // 滑块拖拽热区（要求高度大一些，方便点击）
        const sliderHit = this.add.zone(sliderX + sliderWidth / 2, sliderY, sliderWidth + 40, 64)
            .setInteractive({ useHandCursor: true, draggable: true });
        const setFromPointer = (pointer) => {
            const localX = Phaser.Math.Clamp(pointer.x - sliderX, 0, sliderWidth);
            setVolume(localX / sliderWidth);
        };
        sliderHit.on('pointerdown', setFromPointer);
        sliderHit.on('drag', (pointer) => setFromPointer(pointer));

        // 四个步进按钮：-10% / +10% / 静音 / 默认
        const btnY = h / 2 + 80;
        const btnW = 130;
        const btnGap = 24;
        const totalBtnsW = btnW * 4 + btnGap * 3;
        const firstBtnX = w / 2 - totalBtnsW / 2 + btnW / 2;
        const stepButtons = [];
        const buildStepButton = (i, label, onClick) => {
            const x = firstBtnX + i * (btnW + btnGap);
            const bg = this.add.rectangle(x, btnY, btnW, 46, 0x070b12, 0.9)
                .setStrokeStyle(2, Palette.warning, 0.75)
                .setInteractive({ useHandCursor: true });
            const text = this.add.text(x, btnY, label, {
                font: 'bold 20px Microsoft YaHei, Arial',
                color: '#ffffff',
                stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5);
            bg.on('pointerover', () => {
                bg.setFillStyle(0x12243a, 1);
                text.setColor(PaletteHex.warning);
            });
            bg.on('pointerout', () => {
                bg.setFillStyle(0x070b12, 0.9);
                text.setColor('#ffffff');
            });
            bg.on('pointerdown', onClick);
            stepButtons.push(bg, text);
        };
        buildStepButton(0, '-10%', () => setVolume(settings.volume - 0.1));
        buildStepButton(1, '+10%', () => setVolume(settings.volume + 0.1));
        buildStepButton(2, '静  音', () => setVolume(0));
        buildStepButton(3, '默  认', () => setVolume(0.8));

        // 快捷键提示
        const hintText = this.add.text(w / 2, h / 2 + panelH / 2 - 92,
            '← / →：微调音量    M：静音 / 恢复    ESC：关闭', {
            font: 'bold 14px Microsoft YaHei, Arial',
            color: '#cbd7e6',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5);

        // 关闭按钮
        const closeBtnY = h / 2 + panelH / 2 - 50;
        const closeBg = this.add.rectangle(w / 2, closeBtnY, 200, 50, 0x070b12, 0.95)
            .setStrokeStyle(2, Palette.warning, 0.85)
            .setInteractive({ useHandCursor: true });
        const closeText = this.add.text(w / 2, closeBtnY, '关  闭', {
            font: 'bold 22px Microsoft YaHei, Arial',
            color: '#ffffff',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5);
        closeBg.on('pointerover', () => {
            closeBg.setFillStyle(0x12243a, 1);
            closeText.setColor(PaletteHex.warning);
        });
        closeBg.on('pointerout', () => {
            closeBg.setFillStyle(0x070b12, 0.95);
            closeText.setColor('#ffffff');
        });

        // 实时刷新视觉 & 持久化 + 同步 BGM 音量
        const refreshVisual = () => {
            const v = settings.volume;
            volumeText.setText(`${Math.round(v * 100)}%`);
            const fillWidth = sliderWidth * v;
            sliderFill.width = Math.max(1, fillWidth);
            sliderKnob.x = sliderX + fillWidth;
            const blocks = Math.round(v * 10);
            blocksText.setText('■'.repeat(blocks) + '□'.repeat(10 - blocks));
        };
        const setVolume = (value) => {
            settings.volume = Phaser.Math.Clamp(value, 0, 1);
            SaveSystem.setVolume(settings.volume);
            MenuBGM.syncVolume();
            refreshVisual();
        };
        refreshVisual();

        // 集中收纳到 container，关闭时一键销毁
        const settingsContainer = this.add.container(0, 0, [
            overlay, panel, title,
            volumeLabel, volumeText,
            sliderTrack, sliderFill, sliderKnob, blocksText, sliderHit,
            ...stepButtons,
            hintText, closeBg, closeText
        ]).setDepth(depthBase);

        // 淡入动画
        const fadeTargets = [overlay, panel, title, volumeLabel, volumeText,
            sliderTrack, sliderFill, sliderKnob, blocksText,
            ...stepButtons, hintText, closeBg, closeText];
        fadeTargets.forEach(t => t.setAlpha ? t.setAlpha(0) : null);
        this.tweens.add({ targets: overlay, alpha: 0.7, duration: 220 });
        this.tweens.add({
            targets: fadeTargets.filter(t => t !== overlay),
            alpha: 1, duration: 240, delay: 80
        });

        // 键盘快捷键
        const onLeft  = () => setVolume(settings.volume - 0.05);
        const onRight = () => setVolume(settings.volume + 0.05);
        const onMute  = () => setVolume(settings.volume > 0 ? 0 : 0.8);
        this.input.keyboard.on('keydown-LEFT',  onLeft);
        this.input.keyboard.on('keydown-RIGHT', onRight);
        this.input.keyboard.on('keydown-M',     onMute);

        const close = () => {
            if (!this._settingsVisible) return;
            this._settingsVisible = false;
            this.input.keyboard.off('keydown-LEFT',  onLeft);
            this.input.keyboard.off('keydown-RIGHT', onRight);
            this.input.keyboard.off('keydown-M',     onMute);
            this.input.keyboard.off('keydown-ESC',   close);
            settingsContainer.destroy(true);
        };
        closeBg.on('pointerdown', close);
        this.input.keyboard.on('keydown-ESC', close);
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

        // 主菜单待机视频播放列表：按顺序循环（待机1 → 待机2 → 待机1 → ...）
        this._menuVideoPlaylist = [
            'assets/video/主界面待机1.mp4',
            'assets/video/主界面待机2.mp4'
        ];
        // 跨场景实例记忆：每次"重新进入主菜单"也轮换到下一个视频，而不是固定从第 0 个开始。
        // 静态字段初值是 -1，第一次进主菜单时 +1 → 从索引 0 开始；后续每次进入都接力上一次的下一个。
        const startIndex = (MenuScene._lastMenuVideoIndex + 1) % this._menuVideoPlaylist.length;
        this._menuVideoIndex = startIndex;

        const video = document.createElement('video');
        // loop 关掉，让 ended 事件能正常触发以便切下一个视频
        video.preload = 'auto';
        video.autoplay = true;
        video.loop = false;
        video.muted = true;
        video.volume = 0;
        video.playsInline = true;
        // 跟随 canvas 的实际显示区域，避免 UI 在中间而视频铺满整个窗口的不协调感。
        video.style.position = 'fixed';
        video.style.zIndex = '1';
        video.style.pointerEvents = 'none';
        video.style.background = '#000';
        video.style.objectFit = 'cover';
        // 视频切换瞬间用一点点 opacity 过渡，避免黑屏跳变太突兀
        video.style.transition = 'opacity 220ms ease-out';
        video.style.opacity = '1';
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

        // 一段视频播完 → 切换到下一段，循环播放列表
        this._menuVideoOnEnded = () => this._playNextMenuVideo();
        video.addEventListener('ended', this._menuVideoOnEnded);

        // 从计算好的起始索引开始播（首次进入是 0，重进会接力上次的下一个）
        this._loadAndPlayMenuVideo(startIndex);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._destroyMenuVideoBackground());
    }

    _playNextMenuVideo() {
        if (!this._menuVideoPlaylist || !this._menuVideoPlaylist.length) return;
        const next = (this._menuVideoIndex + 1) % this._menuVideoPlaylist.length;
        this._loadAndPlayMenuVideo(next);
    }

    _loadAndPlayMenuVideo(index) {
        const video = this._menuDomVideo;
        if (!video || !this._menuVideoPlaylist) return;
        this._menuVideoIndex = index;
        // 同步到静态字段，离开主菜单后再进入时能接力到"下一个"
        MenuScene._lastMenuVideoIndex = index;
        const src = this._menuVideoPlaylist[index];

        // 同一资源切回时，浏览器有时不会重新触发 play；先 pause 再换 src 以保险
        try { video.pause(); } catch (e) {}
        video.src = src;
        try { video.load(); } catch (e) {}
        const playPromise = video.play();
        if (playPromise && playPromise.catch) {
            // 自动播放被阻止时静默重试一次（浏览器策略问题，主菜单声音已 mute 通常 OK）
            playPromise.catch(() => {
                video.muted = true;
                video.play().catch(() => {});
            });
        }
    }

    _destroyMenuVideoBackground() {
        if (this._menuVideoResize) {
            window.removeEventListener('resize', this._menuVideoResize);
            try { this.scale.off('resize', this._menuVideoResize); } catch (e) {}
            this._menuVideoResize = null;
        }
        if (this._menuDomVideo) {
            if (this._menuVideoOnEnded) {
                try { this._menuDomVideo.removeEventListener('ended', this._menuVideoOnEnded); } catch (e) {}
                this._menuVideoOnEnded = null;
            }
            try { this._menuDomVideo.pause(); } catch (e) {}
            this._menuDomVideo.remove();
            this._menuDomVideo = null;
        }
        this._menuVideoPlaylist = null;
        this._menuVideoIndex = 0;
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

}
