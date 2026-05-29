class LevelSelectScene extends Phaser.Scene {
    constructor() {
        super('LevelSelectScene');
    }

    create() {
        const w = GAME_WIDTH;
        const h = GAME_HEIGHT;
        const save = SaveSystem.load();
        const unlocked = save.unlockedLevel || 1;
        const completedCount = save.completedLevels.length;
        const totalLevels = LevelConfigs.length;

        MenuBGM.play(this);

        const bg = this.add.image(w / 2, h / 2, 'ui_level_select_bg');
        const tex = this.textures.get('ui_level_select_bg').getSourceImage();
        if (tex && tex.width && tex.height) {
            bg.setScale(Math.max(w / tex.width, h / tex.height));
        } else {
            bg.setDisplaySize(w, h);
        }

        this.add.rectangle(w / 2, h / 2, w, h, 0x05060e, 0.38);

        const scan = this.add.graphics().setDepth(1000);
        scan.fillStyle(0x000000, 0.12);
        for (let y = 0; y < h; y += 4) scan.fillRect(0, y, w, 2);

        this._createHeader(w, completedCount, totalLevels);

        const cardW = 210;
        const cardH = 270;
        const gap = 280;
        const totalCardsWidth = (totalLevels - 1) * gap + cardW;
        const startX = (w - totalCardsWidth) / 2 + cardW / 2;
        const cardY = 370;
        const useStagger = totalLevels > 3;

        this.levelCards = [];
        let defaultFocus = LevelConfigs.findIndex(
            level => level.id <= unlocked && !save.completedLevels.includes(level.id)
        );
        if (defaultFocus < 0) {
            defaultFocus = Math.max(0, Math.min(unlocked - 1, totalLevels - 1));
        }

        LevelConfigs.forEach((level, i) => {
            const x = startX + i * gap;
            const y = useStagger ? cardY + (i % 2) * 56 : cardY;
            const isUnlocked = level.id <= unlocked;
            const completed = save.completedLevels.includes(level.id);

            const card = this._createLevelCard(level, x, y, cardW, cardH, {
                isUnlocked,
                completed,
                index: i,
                isRecommended: isUnlocked && (!completed || i === totalLevels - 1)
            });
            this.levelCards.push(card);
        });

        this.focusIndex = defaultFocus;
        this._updateCardFocus();

        const btnW = 185;
        const btnGap = 12;
        const btnY = h - 78;
        const btnCount = 3;
        const btnStartX = w / 2 - (btnW * btnCount + btnGap * (btnCount - 1)) / 2 + btnW / 2;
        const bottomEnterOffset = 48;
        const bottomBtnDelay = 220 + totalLevels * 45;
        const bottomBtnDuration = 300;

        const backBtn = this._createImageButton(btnStartX, btnY + bottomEnterOffset, 'ui_btn_continue', '返回主菜单', () => {
            this.scene.start('MenuScene');
        }, btnW).setAlpha(0);
        const workshopBtn = this._createImageButton(btnStartX + btnW + btnGap, btnY + bottomEnterOffset, 'ui_btn_continue', '创意工坊', () => {
            this.scene.start('WorkshopScene');
        }, btnW).setAlpha(0);
        const resetBtn = this._createImageButton(btnStartX + (btnW + btnGap) * 2, btnY + bottomEnterOffset, 'ui_btn_exit', '重置存档', () => {
            SaveSystem.reset();
            this.scene.restart();
        }, btnW).setAlpha(0);

        this.tweens.add({
            targets: [backBtn, workshopBtn, resetBtn],
            alpha: 1,
            y: btnY,
            duration: bottomBtnDuration,
            delay: bottomBtnDelay,
            ease: 'Cubic.easeOut'
        });

        this._attachWorkshopButtonPrompt(workshopBtn, btnW, bottomBtnDelay + bottomBtnDuration + 180);

        const hintText = this.add.text(w / 2, h - 18 + bottomEnterOffset, 'ESC 返回主菜单    R 重置存档    ←→ 切换关卡    ENTER 进入', {
            font: 'bold 11px Microsoft YaHei, Arial',
            color: '#7f8998'
        }).setOrigin(0.5).setDepth(25).setAlpha(0);

        this.tweens.add({
            targets: hintText,
            alpha: 0.85,
            y: h - 18,
            duration: bottomBtnDuration,
            delay: bottomBtnDelay + 40,
            ease: 'Cubic.easeOut'
        });

        this.input.keyboard.on('keydown-ESC', () => this.scene.start('MenuScene'));
        this.input.keyboard.on('keydown-R', () => {
            SaveSystem.reset();
            this.scene.restart();
        });
        this.input.keyboard.on('keydown-LEFT', () => this._moveFocus(-1));
        this.input.keyboard.on('keydown-RIGHT', () => this._moveFocus(1));
        this.input.keyboard.on('keydown-ENTER', () => this._enterFocusedLevel());
        const numKeys = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
        LevelConfigs.forEach((level, i) => {
            if (i >= numKeys.length) return;
            this.input.keyboard.on(`keydown-${numKeys[i]}`, () => {
                if (level.id <= unlocked) {
                    this.focusIndex = i;
                    this._updateCardFocus();
                    this._enterLevel(level.id);
                }
            });
        });
    }

    _createHeader(w, completedCount, totalLevels) {
        const panelW = 620;
        const panelH = 96;
        const panelY = 88;
        const enterOffset = 56;

        const header = this.add.container(w / 2, panelY - enterOffset).setAlpha(0).setDepth(20);

        header.add(this.add.rectangle(0, 0, panelW, panelH, 0x070b14, 0.82)
            .setStrokeStyle(2, Palette.warning, 0.55));

        const corners = this.add.graphics();
        corners.lineStyle(2, Palette.hero, 0.85);
        const hw = panelW / 2;
        const hh = panelH / 2;
        const cl = 16;
        [
            [-hw, -hh + cl, -hw, -hh, -hw + cl, -hh],
            [hw - cl, -hh, hw, -hh, hw, -hh + cl],
            [-hw, hh - cl, -hw, hh, -hw + cl, hh],
            [hw - cl, hh, hw, hh, hw, hh - cl]
        ].forEach(([x1, y1, x2, y2, x3, y3]) => {
            corners.beginPath();
            corners.moveTo(x1, y1);
            corners.lineTo(x2, y2);
            corners.lineTo(x3, y3);
            corners.strokePath();
        });
        header.add(corners);

        header.add(this.add.text(0, -22, '城 市 地 图', {
            font: 'bold 42px Microsoft YaHei, Arial',
            color: PaletteHex.warning,
            stroke: '#000',
            strokeThickness: 7
        }).setOrigin(0.5));

        header.add(this.add.text(0, 8, `击败 Boss 解锁下一区域  ·  进度 ${completedCount} / ${totalLevels}`, {
            font: 'bold 15px Microsoft YaHei, Arial',
            color: '#c8d4e8'
        }).setOrigin(0.5));

        const barW = 360;
        const barX = -barW / 2;
        const barY = 30;
        header.add(this.add.rectangle(barX + barW / 2, barY, barW, 8, 0x101828, 0.95));
        const fillW = totalLevels > 0 ? (completedCount / totalLevels) * barW : 0;
        if (fillW > 0) {
            header.add(this.add.rectangle(barX + fillW / 2, barY, fillW, 8, Palette.hero, 0.95));
        }

        this.tweens.add({
            targets: header,
            alpha: 1,
            y: panelY,
            duration: 480,
            ease: 'Cubic.easeOut'
        });
    }

    _createLevelCard(level, x, y, cardW, cardH, state) {
        const { isUnlocked, completed, index, isRecommended } = state;
        const bossConfig = BossConfigs[level.boss?.type] || BossConfigs.mechanicalDino;
        const accent = completed ? Palette.energy : (isUnlocked ? Palette.warning : 0x555555);

        const container = this.add.container(x, y + 36).setDepth(20).setAlpha(0);
        container.cardData = { level, isUnlocked, completed, accent };

        const shadow = this.add.rectangle(0, 4, cardW + 8, cardH + 8, 0x000000, 0.35);
        const bg = this.add.rectangle(0, 0, cardW, cardH, isUnlocked ? 0x0c1424 : 0x080a10, 0.94)
            .setStrokeStyle(2, accent, isUnlocked ? 0.9 : 0.45);
        const glow = this.add.rectangle(0, 0, cardW + 10, cardH + 10, accent, 0)
            .setStrokeStyle(3, accent, 0);

        const frame = this.add.graphics();
        this._drawCardCorners(frame, cardW, cardH, accent, isUnlocked ? 0.9 : 0.35);

        const previewY = -cardH / 2 + 62;
        const previewW = cardW - 18;
        const previewH = 96;

        let previewKey = null;
        const levelBgKey = `level_bg_${level.id}`;
        if (this.textures.exists(levelBgKey)) {
            previewKey = levelBgKey;
        } else {
            const resultKey = `result_bg_${level.id}`;
            if (this.textures.exists(resultKey)) previewKey = resultKey;
        }

        const previewBox = this._buildCardPreviewBox(previewKey, previewW, previewH, accent, isUnlocked);
        previewBox.setPosition(0, previewY);

        const levelBadge = this.add.text(-cardW / 2 + 16, -cardH / 2 + 14, `STAGE ${level.id}`, {
            font: 'bold 11px Arial',
            color: isUnlocked ? PaletteHex.warning : '#666666',
            stroke: '#000',
            strokeThickness: 3
        }).setOrigin(0, 0.5);

        const displayTitle = level.title.replace(/^第 \d 关 · /, '');
        const title = this.add.text(0, 18, displayTitle, {
            font: 'bold 22px Microsoft YaHei, Arial',
            color: isUnlocked ? '#ffffff' : '#666666',
            align: 'center',
            wordWrap: { width: cardW - 24 }
        }).setOrigin(0.5);

        const bossName = this.add.text(0, 52, bossConfig.name || '未知 Boss', {
            font: 'bold 14px Microsoft YaHei, Arial',
            color: isUnlocked ? PaletteHex.hero : '#555555'
        }).setOrigin(0.5);

        const subtitle = (level.subtitle || '').replace(/^[^：]+：/, '');
        const subText = this.add.text(0, 76, subtitle, {
            font: '12px Microsoft YaHei, Arial',
            color: isUnlocked ? '#8aa0b8' : '#444444',
            align: 'center',
            wordWrap: { width: cardW - 28 }
        }).setOrigin(0.5);

        const statusLabel = completed ? '已通关' : (isUnlocked ? '可挑战' : '未解锁');
        const statusColor = completed ? PaletteHex.hero : (isUnlocked ? PaletteHex.warning : '#666666');
        const statusBg = this.add.rectangle(0, cardH / 2 - 22, 108, 26, 0x050810, 0.9)
            .setStrokeStyle(1, accent, 0.6);
        const statusText = this.add.text(0, cardH / 2 - 22, statusLabel, {
            font: 'bold 13px Microsoft YaHei, Arial',
            color: statusColor,
            stroke: '#000',
            strokeThickness: 3
        }).setOrigin(0.5);

        const cardLayers = [shadow, glow, bg, frame, previewBox, levelBadge, title, bossName, subText, statusBg, statusText];
        container.add(cardLayers);

        if (!isUnlocked) {
            const lockOverlay = this.add.rectangle(0, 0, cardW, cardH, 0x000000, 0.52);
            const lockText = this.add.text(0, 0, 'LOCKED', {
                font: 'bold 28px Arial',
                color: '#888888',
                stroke: '#000',
                strokeThickness: 5
            }).setOrigin(0.5);
            container.add([lockOverlay, lockText]);
        }

        if (isRecommended && isUnlocked) {
            this.tweens.add({
                targets: glow,
                alpha: { from: 0.08, to: 0.22 },
                duration: 900,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }

        this.tweens.add({
            targets: container,
            alpha: 1,
            y: y,
            duration: 420,
            delay: 160 + index * 110,
            ease: 'Cubic.easeOut'
        });

        if (isUnlocked) {
            const hitZone = this.add.zone(0, 0, cardW, cardH)
                .setInteractive({ useHandCursor: true });
            container.add(hitZone);
            container.hitZone = hitZone;

            hitZone.on('pointerover', () => {
                this.focusIndex = index;
                this._updateCardFocus();
                this.tweens.add({
                    targets: container,
                    scale: 1.05,
                    duration: 120,
                    ease: 'Sine.easeOut'
                });
                bg.setStrokeStyle(3, Palette.hero, 1);
            });
            hitZone.on('pointerout', () => {
                this.tweens.add({
                    targets: container,
                    scale: 1,
                    duration: 140,
                    ease: 'Sine.easeOut'
                });
                this._updateCardFocus();
            });
            hitZone.on('pointerdown', () => this._enterLevel(level.id));
        }

        container.glow = glow;
        container.bg = bg;
        container.frame = frame;

        if (completed) {
            this._attachPVButtons(container, level, cardW, cardH);
        }

        return container;
    }

    _buildCardPreviewBox(textureKey, width, height, accent, isUnlocked) {
        const box = this.add.container(0, 0);
        box.add(this.add.rectangle(0, 0, width, height, 0x050810, 1));

        if (textureKey) {
            const src = this.textures.get(textureKey).getSourceImage();
            if (src && src.width && src.height) {
                const rt = this.add.renderTexture(0, 0, width, height).setOrigin(0.5);
                const stamp = this.make.image({ key: textureKey, add: false });
                stamp.setScale(Math.max(width / src.width, height / src.height));
                rt.draw(stamp, width / 2, height / 2);
                stamp.destroy();

                rt.setAlpha(isUnlocked ? 1 : 0.45);
                if (!isUnlocked) rt.setTint(0x777777);
                box.add(rt);
            }
        }

        box.add(this.add.rectangle(0, 0, width, height, 0x000000, 0)
            .setStrokeStyle(2, accent, isUnlocked ? 0.75 : 0.35));

        return box;
    }

    _drawCardCorners(g, cardW, cardH, accent, alpha) {
        g.clear();
        g.lineStyle(2, accent, alpha);
        const hw = cardW / 2;
        const hh = cardH / 2;
        const len = 14;
        [
            [-hw, -hh + len, -hw, -hh, -hw + len, -hh],
            [hw - len, -hh, hw, -hh, hw, -hh + len],
            [-hw, hh - len, -hw, hh, -hw + len, hh],
            [hw - len, hh, hw, hh, hw, hh - len]
        ].forEach(([x1, y1, x2, y2, x3, y3]) => {
            g.beginPath();
            g.moveTo(x1, y1);
            g.lineTo(x2, y2);
            g.lineTo(x3, y3);
            g.strokePath();
        });
    }

    _attachPVButtons(cardContainer, level, cardW, cardH) {
        const pvBtnW = 84;
        const pvBtnH = 28;
        const pvBtnGap = 10;
        const pvBtns = [];
        if (level.startVideoUrl) {
            pvBtns.push({ label: '开始 PV', action: () => this._playLevelPV(level, 'start') });
        }
        if (level.endVideoUrl) {
            pvBtns.push({ label: '结束 PV', action: () => this._playLevelPV(level, 'end') });
        }
        if (!pvBtns.length) return;

        const row = this.add.container(0, cardH / 2 + 28);
        const totalPvW = pvBtns.length * pvBtnW + (pvBtns.length - 1) * pvBtnGap;
        const firstPvX = -totalPvW / 2 + pvBtnW / 2;

        pvBtns.forEach((btn, idx) => {
            const bx = firstPvX + idx * (pvBtnW + pvBtnGap);
            this._createPVButton(row, bx, 0, pvBtnW, pvBtnH, btn.label, btn.action);
        });

        cardContainer.add(row);
    }

    _moveFocus(delta) {
        if (!this.levelCards || !this.levelCards.length) return;
        let next = this.focusIndex;
        for (let step = 0; step < this.levelCards.length; step++) {
            next = (next + delta + this.levelCards.length) % this.levelCards.length;
            if (this.levelCards[next].cardData.isUnlocked) break;
        }
        this.focusIndex = next;
        this._updateCardFocus();
    }

    _updateCardFocus() {
        if (!this.levelCards) return;
        this.levelCards.forEach((card, i) => {
            const { accent, isUnlocked } = card.cardData;
            const focused = i === this.focusIndex && isUnlocked;
            card.bg.setStrokeStyle(focused ? 3 : 2, focused ? Palette.hero : accent, focused ? 1 : (isUnlocked ? 0.9 : 0.45));
            this._drawCardCorners(card.frame, 210, 270, focused ? Palette.hero : accent, focused ? 1 : (isUnlocked ? 0.9 : 0.35));
        });
    }

    _enterFocusedLevel() {
        const card = this.levelCards && this.levelCards[this.focusIndex];
        if (card && card.cardData.isUnlocked) {
            this._enterLevel(card.cardData.level.id);
        }
    }

    _enterLevel(levelId) {
        const level = LevelConfigs.find(l => l.id === levelId);
        if (!level) return;
        MenuBGM.stop();

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

    static startPVKey(levelId) { return `level${levelId}-start`; }
    static endPVKey(levelId)   { return `level${levelId}-end`; }

    _createImageButton(x, y, textureKey, label, action, targetWidth = 185) {
        const container = this.add.container(x, y).setDepth(30);

        const bg = this.add.image(0, 0, textureKey);
        if (bg.width > 0) bg.setScale(targetWidth / bg.width);

        const textScale = targetWidth / 185;
        const text = this.add.text(30 * textScale, -1, label, {
            font: `bold ${Math.round(16 * textScale)}px Microsoft YaHei, Arial`,
            color: '#e8faff',
            stroke: '#001428',
            strokeThickness: Math.max(3, Math.round(4 * textScale))
        }).setOrigin(0.5);

        container.add([bg, text]);

        const hitW = bg.displayWidth * 0.92;
        const hitH = bg.displayHeight * 0.72;
        const hitZone = this.add.zone(0, 0, hitW, hitH)
            .setInteractive({ useHandCursor: true });
        container.add(hitZone);
        container.sendToBack(hitZone);

        hitZone.on('pointerover', () => {
            bg.setTint(0xb8f4ff);
            text.setColor(PaletteHex.warning);
            this.tweens.add({ targets: container, scale: 1.05, duration: 110, ease: 'Sine.easeOut' });
        });
        hitZone.on('pointerout', () => {
            bg.clearTint();
            text.setColor('#e8faff');
            this.tweens.add({ targets: container, scale: 1, duration: 130, ease: 'Sine.easeOut' });
        });
        hitZone.on('pointerdown', () => {
            this.tweens.add({
                targets: container,
                scale: 0.96,
                duration: 70,
                yoyo: true,
                onComplete: action
            });
        });

        container.bg = bg;
        container.text = text;
        container.hitZone = hitZone;

        return container;
    }

    _attachWorkshopButtonPrompt(container, btnW, startDelay) {
        const badge = this.add.container(btnW / 2 - 6, -26);
        const badgeRing = this.add.circle(0, 0, 11, 0xff5fb9, 0.15)
            .setStrokeStyle(1.5, 0xff5fb9, 0.85);
        const badgeCore = this.add.circle(0, 0, 7, 0xff5fb9, 0.92);
        const badgeIcon = this.add.text(0, -1, '✦', {
            font: 'bold 11px Arial',
            color: '#ffffff',
            stroke: '#000',
            strokeThickness: 2
        }).setOrigin(0.5);
        badge.add([badgeRing, badgeCore, badgeIcon]);
        container.add(badge);

        const promptTweens = [];
        const startPrompt = () => {
            promptTweens.push(this.tweens.add({
                targets: badge,
                y: -28,
                duration: 680,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            }));
            promptTweens.push(this.tweens.add({
                targets: badgeIcon,
                angle: { from: -10, to: 10 },
                duration: 820,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            }));
            promptTweens.push(this.tweens.add({
                targets: badgeRing,
                scale: { from: 1, to: 1.35 },
                alpha: { from: 0.35, to: 0.05 },
                duration: 1200,
                repeat: -1,
                ease: 'Sine.easeOut'
            }));
        };

        this.time.delayedCall(startDelay, startPrompt);

        const pausePrompt = () => promptTweens.forEach(t => t.pause());
        const resumePrompt = () => promptTweens.forEach(t => t.resume());

        if (container.hitZone) {
            container.hitZone.on('pointerover', pausePrompt);
            container.hitZone.on('pointerout', resumePrompt);
        }

        this.events.once('shutdown', () => promptTweens.forEach(t => t.stop()));
    }

    _createPVButton(parent, x, y, width, height, label, action) {
        const btn = this.add.container(x, y);
        const bg = this.add.rectangle(0, 0, width, height, 0x070b12, 0.92)
            .setStrokeStyle(1, Palette.hero, 0.7)
            .setInteractive({ useHandCursor: true });
        const text = this.add.text(0, 0, label, {
            font: 'bold 12px Microsoft YaHei, Arial',
            color: '#cfeaff',
            stroke: '#000',
            strokeThickness: 3
        }).setOrigin(0.5);

        btn.add([bg, text]);
        parent.add(btn);

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
}
