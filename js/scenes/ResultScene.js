class ResultScene extends Phaser.Scene {
    constructor() {
        super('ResultScene');
    }

    init(data) {
        this.levelId = data.levelId || 1;
        this.mode = data.mode || 'campaign';
        this.returnScene = data.returnScene || 'LevelSelectScene';
        this.levelConfig = data.levelConfig || null;
        this.workshopLevelId = data.workshopLevelId || null;
        this.editorDraftId = data.editorDraftId || null;
        this.score = data.score || 0;
        this.maxCombo = data.maxCombo || 0;
        this.timeSec = data.timeSec || 0;
        this.damageTaken = data.damageTaken || 0;
        this.isFinal = data.isFinal || false;
    }

    create() {
        if (this.mode === 'workshop' || this.mode === 'editorTest') {
            this._createWorkshopResultUI();
            return;
        }

        this._createCampaignResultUI();
    }

    _createWorkshopResultUI() {
        const W = GAME_WIDTH;
        const H = GAME_HEIGHT;

        this.add.image(W / 2, H / 2, 'bg_far').setDisplaySize(W, H);
        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6);

        const title = this.mode === 'editorTest' ? '试 玩 通 关' : '关 卡 完 成';
        this.add.text(W / 2, 80, title, {
            font: 'bold 44px Arial', color: PaletteHex.warning,
            stroke: '#000', strokeThickness: 8
        }).setOrigin(0.5);

        const statsY = 220;
        const stats = [
            { label: '分  数', value: this.score.toString() },
            { label: '最高连击', value: this.maxCombo + ' HIT' },
            { label: '用  时', value: this._formatTime(this.timeSec) },
            { label: '受伤次数', value: this.damageTaken + ' 次' }
        ];

        stats.forEach((s, i) => {
            const y = statsY + i * 50;
            this.add.text(W / 2 - 140, y, s.label, {
                font: 'bold 22px Arial', color: '#cccccc'
            }).setOrigin(0, 0.5);
            this.add.text(W / 2 + 140, y, s.value, {
                font: 'bold 24px Arial', color: PaletteHex.warning
            }).setOrigin(1, 0.5);
        });

        const buttons = [];
        if (this.mode === 'editorTest') {
            buttons.push({
                label: '返回编辑器',
                action: () => { window.location.href = '/ExtraTools/关卡编辑器/?mode=player'; }
            });
        } else {
            buttons.push({
                label: '返回创意工坊',
                action: () => this.scene.start('WorkshopScene')
            });
        }

        if (this.mode === 'workshop' && this.levelConfig) {
            buttons.push({
                label: '重新挑战',
                action: () => this.scene.start('GameScene', {
                    mode: 'workshop',
                    levelConfig: this.levelConfig,
                    workshopLevelId: this.workshopLevelId,
                    returnScene: 'WorkshopScene'
                })
            });
        }

        if (this.mode === 'editorTest' && this.levelConfig) {
            buttons.push({
                label: '再试一次',
                action: () => this.scene.start('GameScene', {
                    mode: 'editorTest',
                    levelConfig: this.levelConfig,
                    editorDraftId: this.editorDraftId,
                    returnScene: 'editor'
                })
            });
        }

        const btnY = 520;
        const totalWidth = buttons.length * 220;
        const startX = W / 2 - totalWidth / 2 + 110;
        buttons.forEach((btn, i) => {
            this._createButton(startX + i * 220, btnY, btn.label, btn.action);
        });
    }

    _createCampaignResultUI() {
        const W = GAME_WIDTH;
        const H = GAME_HEIGHT;

        // 优先使用关卡配置中的结算背景（key 形如 result_bg_1）；
        // 资源不存在则回退到程序生成的 bg_far 远景，保持原黑色风格。
        const bgKey = `result_bg_${this.levelId}`;
        if (this.textures.exists(bgKey)) {
            const bg = this.add.image(W / 2, H / 2, bgKey);
            const tex = this.textures.get(bgKey).getSourceImage();
            if (tex && tex.width && tex.height) {
                // 等比 cover：高度/宽度取 max，确保填满整个画布无空白
                const scale = Math.max(W / tex.width, H / tex.height);
                bg.setScale(scale);
            } else {
                bg.setDisplaySize(W, H);
            }
        } else {
            this.add.image(W / 2, H / 2, 'bg_far').setDisplaySize(W, H);
        }
        // 暗化叠层，提升文字对比度（结算页有大量评级 / 统计数据要看清）
        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6);

        const scan = this.add.graphics().setDepth(1000);
        scan.fillStyle(0x000000, 0.12);
        for (let y = 0; y < H; y += 4) scan.fillRect(0, y, W, 2);

        const rank = this._calcRank();
        const rankColors = { S: '#ff2b2b', A: '#ffd400', B: '#00e5ff' };
        const rankColor = rankColors[rank] || '#ffffff';

        this.add.text(W / 2, 60, '关 卡 完 成', {
            font: 'bold 48px Arial', color: PaletteHex.warning,
            stroke: '#000', strokeThickness: 8
        }).setOrigin(0.5);

        const rankText = this.add.text(W / 2, 170, rank, {
            font: 'bold 120px Arial', color: rankColor,
            stroke: '#000', strokeThickness: 10
        }).setOrigin(0.5).setScale(0);

        this.tweens.add({
            targets: rankText,
            scale: 1,
            duration: 400,
            ease: 'Back.easeOut',
            delay: 300
        });

        const statsY = 280;
        const stats = [
            { label: '分  数', value: this.score.toString() },
            { label: '最高连击', value: this.maxCombo + ' HIT' },
            { label: '用  时', value: this._formatTime(this.timeSec) },
            { label: '受伤次数', value: this.damageTaken + ' 次' }
        ];

        stats.forEach((s, i) => {
            const y = statsY + i * 50;
            this.add.text(W / 2 - 140, y, s.label, {
                font: 'bold 22px Arial', color: '#cccccc'
            }).setOrigin(0, 0.5);
            this.add.text(W / 2 + 140, y, s.value, {
                font: 'bold 24px Arial', color: PaletteHex.warning
            }).setOrigin(1, 0.5);
        });

        const btnY = 540;
        const buttons = [];

        // 通关 → 显示"下一关"；通关最后一关 → 显示"返回主菜单"。
        // 旧的"观看结尾 / 倒计时自动播放"逻辑已迁移到 GameScene（Boss 击败后 1 秒自动播放）。
        if (this.isFinal) {
            buttons.push({ label: '返回主菜单', action: () => this.scene.start('MenuScene') });
        } else {
            buttons.push({ label: '下一关', action: () => this._enterNextLevel() });
        }
        buttons.push({ label: '重新挑战', action: () => this.scene.start('GameScene', { levelId: this.levelId }) });
        buttons.push({ label: '返回选关', action: () => this.scene.start('LevelSelectScene') });

        const totalWidth = buttons.length * 200;
        const startX = W / 2 - totalWidth / 2 + 100;

        buttons.forEach((btn, i) => {
            const x = startX + i * 200;
            this._createButton(x, btnY, btn.label, btn.action);
        });

        this.add.text(W / 2, H - 40, 'ENTER: ' + buttons[0].label + '    ESC: 返回选关', {
            font: '14px Arial', color: '#999999'
        }).setOrigin(0.5);

        this.input.keyboard.once('keydown-ENTER', buttons[0].action);
        this.input.keyboard.once('keydown-ESC', () => this.scene.start('LevelSelectScene'));
    }

    _enterNextLevel() {
        const nextLevelId = this.levelId + 1;
        const nextLevel = LevelConfigs.find(level => level.id === nextLevelId);
        if (!nextLevel) {
            this.scene.start('LevelSelectScene');
            return;
        }

        this._enterLevel(nextLevelId);
    }

    _enterLevel(levelId) {
        const level = LevelConfigs.find(item => item.id === levelId);
        if (!level) {
            this.scene.start('LevelSelectScene');
            return;
        }

        const startKey = LevelSelectScene.startPVKey(levelId);
        if (level.startVideoUrl) {
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

    _calcRank() {
        if (this.maxCombo >= 20 && this.damageTaken <= 2 && this.timeSec < 120) return 'S';
        if (this.maxCombo >= 10 && this.damageTaken <= 5) return 'A';
        return 'B';
    }

    _formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    _createButton(x, y, label, action) {
        const bg = this.add.rectangle(x, y, 180, 50, 0x0a1020, 0.9)
            .setStrokeStyle(2, Palette.warning, 0.8)
            .setInteractive({ useHandCursor: true });
        const text = this.add.text(x, y, label, {
            font: 'bold 22px Arial', color: '#ffffff',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5);

        bg.on('pointerover', () => {
            bg.setStrokeStyle(3, Palette.hero, 1);
            text.setColor(PaletteHex.warning);
        });
        bg.on('pointerout', () => {
            bg.setStrokeStyle(2, Palette.warning, 0.8);
            text.setColor('#ffffff');
        });
        bg.on('pointerdown', action);
        return { bg, text };
    }
}
