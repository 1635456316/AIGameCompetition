class LevelSelectScene extends Phaser.Scene {
    constructor() {
        super('LevelSelectScene');
    }

    create() {
        const w = GAME_WIDTH;
        const h = GAME_HEIGHT;
        const save = SaveSystem.load();
        const unlocked = save.unlockedLevel || 1;

        // 关卡选择和主菜单共享同一首 BGM。从主菜单进来时通常已经在播；
        // 从游戏 / PV 场景返回时则需要重新启动。play() 重复调用是安全的。
        MenuBGM.play(this);

        const bg = this.add.image(w / 2, h / 2, 'ui_level_select_bg');
        // 等比缩放铺满（cover），避免变形；居中显示。
        const tex = this.textures.get('ui_level_select_bg').getSourceImage();
        if (tex && tex.width && tex.height) {
            const scale = Math.max(w / tex.width, h / tex.height);
            bg.setScale(scale);
        } else {
            bg.setDisplaySize(w, h);
        }
        this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.35);

        const scan = this.add.graphics().setDepth(1000);
        scan.fillStyle(0x000000, 0.16);
        for (let y = 0; y < h; y += 4) scan.fillRect(0, y, w, 2);

        this.add.text(w / 2, 70, '城市地图 · 关卡选择', {
            font: 'bold 48px Arial',
            color: PaletteHex.warning,
            stroke: '#000',
            strokeThickness: 8
        }).setOrigin(0.5);

        this.add.text(w / 2, 118, `本版本共 ${LevelConfigs.length} 关：击败 Boss 即可解锁下一关。`, {
            font: '16px Arial', color: '#dddddd'
        }).setOrigin(0.5);

        // 卡片水平居中：根据当前 LevelConfigs 的数量动态计算起始 x，避免关卡少的时候偏左。
        const cardW = 190;
        const gap = 225;
        const totalCardsWidth = (LevelConfigs.length - 1) * gap + cardW;
        const startX = (w - totalCardsWidth) / 2 + cardW / 2;
        // 关卡 <= 3 时整齐排在同一水平线，避免上下错落显得空旷。
        const useStagger = LevelConfigs.length > 3;
        LevelConfigs.forEach((level, i) => {
            const x = startX + i * gap;
            const y = useStagger ? 330 + (i % 2) * 70 : 360;
            const isUnlocked = level.id <= unlocked;
            const completed = save.completedLevels.includes(level.id);

            const color = isUnlocked ? 0x121827 : 0x101010;
            const stroke = completed ? Palette.energy : (isUnlocked ? Palette.warning : 0x555555);
            const card = this.add.rectangle(x, y, 190, 150, color, 0.92)
                .setStrokeStyle(3, stroke)
                .setInteractive({ useHandCursor: isUnlocked });

            this.add.text(x, y - 48, `第 ${level.id} 关`, {
                font: 'bold 24px Arial',
                color: isUnlocked ? PaletteHex.warning : '#777777'
            }).setOrigin(0.5);

            this.add.text(x, y - 12, level.title.replace(/^第 \d 关 · /, ''), {
                font: 'bold 20px Arial',
                color: isUnlocked ? '#ffffff' : '#666666',
                align: 'center'
            }).setOrigin(0.5);

            const bossName = BossConfigs[level.boss.type]?.name || '未知 Boss';
            this.add.text(x, y + 28, bossName, {
                font: '14px Arial',
                color: isUnlocked ? PaletteHex.hero : '#555555',
                align: 'center'
            }).setOrigin(0.5);

            this.add.text(x, y + 56, completed ? 'CLEARED' : (isUnlocked ? 'READY' : 'LOCKED'), {
                font: 'bold 14px Arial',
                color: completed ? PaletteHex.hero : (isUnlocked ? PaletteHex.warning : '#666666')
            }).setOrigin(0.5);

            if (isUnlocked) {
                card.on('pointerover', () => card.setScale(1.06));
                card.on('pointerout', () => card.setScale(1));
                card.on('pointerdown', () => this._enterLevel(level.id));
            }

            // 已通关：卡片下方显示"开始PV / 结束PV"两个回看按钮（仅在对应视频配置存在时显示）
            if (completed) {
                const pvBtnY = y + 110;
                const pvBtnW = 84;
                const pvBtnH = 28;
                const pvBtnGap = 10;
                const pvBtns = [];
                if (level.startVideoUrl) {
                    pvBtns.push({
                        label: '开始 PV',
                        action: () => this._playLevelPV(level, 'start')
                    });
                }
                if (level.endVideoUrl) {
                    pvBtns.push({
                        label: '结束 PV',
                        action: () => this._playLevelPV(level, 'end')
                    });
                }
                const totalPvW = pvBtns.length * pvBtnW + (pvBtns.length - 1) * pvBtnGap;
                const firstPvX = x - totalPvW / 2 + pvBtnW / 2;
                pvBtns.forEach((btn, idx) => {
                    const bx = firstPvX + idx * (pvBtnW + pvBtnGap);
                    this._createPVButton(bx, pvBtnY, pvBtnW, pvBtnH, btn.label, btn.action);
                });
            }
        });

        this._createTextButton(w / 2 - 130, h - 70, 200, 44, '返回主菜单', Palette.hero, () => {
            this.scene.start('MenuScene');
        });
        this._createTextButton(w / 2 + 130, h - 70, 200, 44, '重置存档', Palette.danger, () => {
            SaveSystem.reset();
            this.scene.restart();
        });

        this.add.text(w / 2, h - 30, '快捷键：ESC 返回主菜单    R 重置存档', {
            font: '12px Arial', color: '#7f8998'
        }).setOrigin(0.5);

        this.input.keyboard.on('keydown-ESC', () => this.scene.start('MenuScene'));
        this.input.keyboard.on('keydown-R', () => {
            SaveSystem.reset();
            this.scene.restart();
        });
    }

    /**
     * 统一的"进入某关"入口（通用 PV 检查）：
     * - 关卡配置了 startVideoUrl 且尚未观看过 → 先跳 PVScene 播放开始 PV，结束后由 PV 跳到 GameScene。
     * - 否则 → 直接进入 GameScene。
     * 任意一种情况下都先停掉菜单 BGM，让 PV / 游戏自己接管音频。
     */
    _enterLevel(levelId) {
        const level = LevelConfigs.find(l => l.id === levelId);
        if (!level) return;
        MenuBGM.stop();

        const startKey = LevelSelectScene.startPVKey(levelId);
        if (level.startVideoUrl && !SaveSystem.hasPVWatched(startKey)) {
            this.scene.start('PVScene', {
                videoUrl: level.startVideoUrl,
                nextScene: 'GameScene',
                nextSceneData: { levelId: levelId },
                pvId: startKey,
                title: `第 ${levelId} 关 · 开场`,
                holdOnEnd: true,
                continueButtonText: '开始战斗！'
            });
            return;
        }

        this.scene.start('GameScene', { levelId: levelId });
    }

    /**
     * 在选关界面回看某关的开始/结束 PV。
     * 回看时不写 pvId（避免影响首次播放的标记机制），看完直接回到关卡选择界面。
     */
    _playLevelPV(level, kind) {
        MenuBGM.stop();
        const videoUrl = kind === 'start' ? level.startVideoUrl : level.endVideoUrl;
        if (!videoUrl) return;
        this.scene.start('PVScene', {
            videoUrl: videoUrl,
            nextScene: 'LevelSelectScene',
            title: `第 ${level.id} 关 · ${kind === 'start' ? '开场' : '终结'}`
        });
    }

    /**
     * 关卡 PV 已观看标记 key。GameScene 也用同一组 key，集中在静态方法里避免散落。
     */
    static startPVKey(levelId) { return `level${levelId}-start`; }
    static endPVKey(levelId)   { return `level${levelId}-end`; }

    _createPVButton(x, y, width, height, label, action) {
        const bg = this.add.rectangle(x, y, width, height, 0x070b12, 0.92)
            .setStrokeStyle(1, Palette.hero, 0.7)
            .setInteractive({ useHandCursor: true });
        const text = this.add.text(x, y, label, {
            font: 'bold 13px Microsoft YaHei, Arial',
            color: '#cfeaff',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5);
        bg.on('pointerover', () => {
            bg.setFillStyle(0x12243a, 1);
            bg.setStrokeStyle(2, Palette.warning, 1);
            text.setColor(PaletteHex.warning);
        });
        bg.on('pointerout', () => {
            bg.setFillStyle(0x070b12, 0.92);
            bg.setStrokeStyle(1, Palette.hero, 0.7);
            text.setColor('#cfeaff');
        });
        bg.on('pointerdown', action);
    }

    _createTextButton(x, y, width, height, label, accent, action) {
        const bg = this.add.rectangle(x, y, width, height, 0x0a1020, 0.92)
            .setStrokeStyle(2, accent, 0.85)
            .setInteractive({ useHandCursor: true });
        const text = this.add.text(x, y, label, {
            font: 'bold 18px Arial', color: '#ffffff',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5);
        bg.on('pointerover', () => {
            bg.setFillStyle(0x12243a, 1);
            bg.setStrokeStyle(3, accent, 1);
            text.setColor(PaletteHex.warning);
        });
        bg.on('pointerout', () => {
            bg.setFillStyle(0x0a1020, 0.92);
            bg.setStrokeStyle(2, accent, 0.85);
            text.setColor('#ffffff');
        });
        bg.on('pointerdown', action);
    }
}
