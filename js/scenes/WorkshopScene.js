class WorkshopScene extends Phaser.Scene {
    constructor() {
        super('WorkshopScene');
    }

    init() {
        this.levels = [];
        this.loading = true;
        this.errorText = '';
        this.focusIndex = 0;
        this.authLoggedIn = false;
        this.authUser = null;
    }

    create() {
        const w = GAME_WIDTH;
        const h = GAME_HEIGHT;

        MenuBGM.play(this);

        const bg = this.add.image(w / 2, h / 2, 'ui_level_select_bg');
        const tex = this.textures.get('ui_level_select_bg').getSourceImage();
        if (tex && tex.width && tex.height) {
            bg.setScale(Math.max(w / tex.width, h / tex.height));
        } else {
            bg.setDisplaySize(w, h);
        }

        this.add.rectangle(w / 2, h / 2, w, h, 0x05060e, 0.42);

        this.titleText = this.add.text(w / 2, 70, '创 意 工 坊', {
            font: 'bold 42px Microsoft YaHei, Arial',
            color: PaletteHex.warning,
            stroke: '#000',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(20);

        this.subtitleText = this.add.text(w / 2, 118, '加载中…', {
            font: '16px Microsoft YaHei, Arial',
            color: '#9fb0c8'
        }).setOrigin(0.5).setDepth(20);

        this._createAuthBar(w);

        this.cardsContainer = this.add.container(0, 0).setDepth(15);
        this.emptyText = this.add.text(w / 2, h / 2, '', {
            font: '18px Microsoft YaHei, Arial',
            color: '#8899aa',
            align: 'center'
        }).setOrigin(0.5).setDepth(15).setVisible(false);

        const btnW = 185;
        const btnGap = 12;
        const btnY = h - 78;
        const btnStartX = w / 2 - (btnW * 3 + btnGap * 2) / 2 + btnW / 2;

        this._createImageButton(btnStartX, btnY, 'ui_btn_continue', '返回选关', () => {
            this.scene.start('LevelSelectScene');
        }, btnW);

        this._createImageButton(btnStartX + btnW + btnGap, btnY, 'ui_btn_continue', '关卡编辑器', () => {
            this._openEditor();
        }, btnW);

        this._createImageButton(btnStartX + (btnW + btnGap) * 2, btnY, 'ui_btn_exit', '刷新列表', () => {
            this.scene.restart();
        }, btnW);

        this.add.text(w / 2, h - 18, '←→ 切换    ENTER 游玩    ESC 返回选关', {
            font: 'bold 11px Microsoft YaHei, Arial',
            color: '#7f8998'
        }).setOrigin(0.5).setDepth(25);

        this.input.keyboard.on('keydown-ESC', () => this.scene.start('LevelSelectScene'));
        this.input.keyboard.on('keydown-LEFT', () => this._moveFocus(-1));
        this.input.keyboard.on('keydown-RIGHT', () => this._moveFocus(1));
        this.input.keyboard.on('keydown-ENTER', () => this._enterFocusedLevel());

        this._loadAuth();
        this._loadLevels();
    }

    _createAuthBar(w) {
        const panelW = 248;
        const panelH = 38;
        const rightX = w - 18;
        const panelY = 34;

        this.authBar = this.add.container(rightX, panelY).setDepth(40);

        const bg = this.add.rectangle(-panelW / 2, 0, panelW, panelH, 0x0a1020, 0.88)
            .setStrokeStyle(1, Palette.warning, 0.45);
        this.authBar.add(bg);

        this.authUserText = this.add.text(-panelW + 14, 0, '登录状态加载中…', {
            font: '14px Microsoft YaHei, Arial',
            color: '#8899aa'
        }).setOrigin(0, 0.5);
        this.authBar.add(this.authUserText);

        this.authActionText = this.add.text(-14, 0, '登录', {
            font: 'bold 14px Microsoft YaHei, Arial',
            color: PaletteHex.warning
        }).setOrigin(1, 0.5);
        this.authBar.add(this.authActionText);

        const actionHit = this.add.zone(-36, 0, 72, panelH).setInteractive({ useHandCursor: true });
        this.authBar.add(actionHit);

        actionHit.on('pointerover', () => this.authActionText.setColor('#ffffff'));
        actionHit.on('pointerout', () => {
            this.authActionText.setColor(this.authLoggedIn ? '#ff9a9a' : PaletteHex.warning);
        });
        actionHit.on('pointerdown', () => this._onAuthAction());
    }

    async _loadAuth() {
        try {
            const auth = await WorkshopApi.checkAuth();
            this._updateAuthBar(auth);
        } catch {
            this._updateAuthBar({ loggedIn: false });
        }
    }

    _updateAuthBar(auth) {
        this.authLoggedIn = !!auth.loggedIn;
        this.authUser = auth.loggedIn ? auth : null;

        if (auth.loggedIn) {
            const name = auth.userName || '已登录';
            this.authUserText.setText(name);
            this.authUserText.setColor('#8fdcff');
            this.authActionText.setText('登出');
            this.authActionText.setColor('#ff9a9a');
        } else {
            this.authUserText.setText('未登录');
            this.authUserText.setColor('#8899aa');
            this.authActionText.setText('登录');
            this.authActionText.setColor(PaletteHex.warning);
        }
    }

    async _onAuthAction() {
        if (this.authLoggingOut) return;

        if (this.authLoggedIn) {
            this.authLoggingOut = true;
            this.authActionText.setText('登出中…');
            try {
                await WorkshopApi.logout();
                this._updateAuthBar({ loggedIn: false });
            } catch (err) {
                this.subtitleText.setText(`登出失败：${err.message || err}`);
            } finally {
                this.authLoggingOut = false;
            }
            return;
        }

        sessionStorage.setItem('boot-scene', 'WorkshopScene');
        window.location.href = WorkshopApi.getLoginUrl('/');
    }

    async _loadLevels() {
        try {
            this.levels = await WorkshopApi.fetchLevels();
            this.loading = false;
            this.errorText = '';
            this.subtitleText.setText(this.levels.length ? `共 ${this.levels.length} 个玩家关卡` : '暂无玩家关卡，去编辑器创作吧');
            this._renderCards();
        } catch (err) {
            this.loading = false;
            this.errorText = err.message || String(err);
            this.subtitleText.setText('加载失败');
            this.emptyText.setText(`无法加载创意工坊列表\n${this.errorText}\n\n请确认已通过 server 启动游戏`);
            this.emptyText.setVisible(true);
        }
    }

    _renderCards() {
        this.cardsContainer.removeAll(true);
        this.levelCards = [];

        if (!this.levels.length) {
            this.emptyText.setText('还没有玩家发布的关卡\n点击「关卡编辑器」开始创作');
            this.emptyText.setVisible(true);
            return;
        }

        this.emptyText.setVisible(false);

        const w = GAME_WIDTH;
        const cardW = 240;
        const cardH = 200;
        const gap = 260;
        const visible = Math.min(this.levels.length, 4);
        const totalWidth = (visible - 1) * gap + cardW;
        const startX = (w - totalWidth) / 2 + cardW / 2;
        const cardY = 340;

        this.levels.slice(0, 8).forEach((level, i) => {
            const x = startX + (i % 4) * gap;
            const y = cardY + Math.floor(i / 4) * 230;
            const card = this._createLevelCard(level, x, y, cardW, cardH, i);
            this.levelCards.push(card);
        });

        this.focusIndex = 0;
        this._updateCardFocus();
    }

    _createLevelCard(level, x, y, cardW, cardH, index) {
        const container = this.add.container(x, y);
        const bg = this.add.rectangle(0, 0, cardW, cardH, 0x0c1220, 0.92)
            .setStrokeStyle(2, Palette.warning, 0.7)
            .setInteractive({ useHandCursor: true });

        const title = this.add.text(0, -cardH / 2 + 36, level.title || '未命名关卡', {
            font: 'bold 18px Microsoft YaHei, Arial',
            color: '#ffffff',
            wordWrap: { width: cardW - 24 },
            align: 'center'
        }).setOrigin(0.5);

        const author = this.add.text(0, -cardH / 2 + 72, `作者：${level.authorName || '未知'}`, {
            font: '13px Microsoft YaHei, Arial',
            color: '#8fdcff'
        }).setOrigin(0.5);

        const desc = this.add.text(0, 10, level.description || '（无描述）', {
            font: '13px Microsoft YaHei, Arial',
            color: '#aab4c4',
            wordWrap: { width: cardW - 28 },
            align: 'center'
        }).setOrigin(0.5);

        const date = this.add.text(0, cardH / 2 - 24, this._formatDate(level.createdAt), {
            font: '11px Microsoft YaHei, Arial',
            color: '#667788'
        }).setOrigin(0.5);

        container.add([bg, title, author, desc, date]);
        this.cardsContainer.add(container);

        bg.on('pointerdown', () => {
            this.focusIndex = index;
            this._updateCardFocus();
            this._enterLevel(level.id);
        });

        return { container, bg, level, index };
    }

    _formatDate(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    _moveFocus(delta) {
        if (!this.levelCards || !this.levelCards.length) return;
        this.focusIndex = (this.focusIndex + delta + this.levelCards.length) % this.levelCards.length;
        this._updateCardFocus();
    }

    _updateCardFocus() {
        if (!this.levelCards) return;
        this.levelCards.forEach((card, i) => {
            const focused = i === this.focusIndex;
            card.bg.setStrokeStyle(focused ? 3 : 2, focused ? Palette.hero : Palette.warning, focused ? 1 : 0.7);
            card.container.setScale(focused ? 1.04 : 1);
        });
    }

    _enterFocusedLevel() {
        const card = this.levelCards && this.levelCards[this.focusIndex];
        if (card) this._enterLevel(card.level.id);
    }

    async _enterLevel(levelId) {
        try {
            const data = await WorkshopApi.fetchLevel(levelId);
            MenuBGM.stop();
            this.scene.start('GameScene', {
                mode: 'workshop',
                levelConfig: data.level,
                workshopLevelId: levelId,
                returnScene: 'WorkshopScene'
            });
        } catch (err) {
            this.subtitleText.setText(`进入关卡失败：${err.message || err}`);
        }
    }

    async _openEditor() {
        let loggedIn = this.authLoggedIn;
        if (!loggedIn) {
            try {
                const auth = await WorkshopApi.checkAuth();
                loggedIn = !!auth.loggedIn;
                if (loggedIn) this._updateAuthBar(auth);
            } catch {
                loggedIn = false;
            }
        }
        if (!loggedIn) {
            sessionStorage.setItem('boot-scene', 'WorkshopScene');
            window.location.href = WorkshopApi.getLoginUrl('/ExtraTools/关卡编辑器/?mode=player');
            return;
        }
        window.location.href = '/ExtraTools/关卡编辑器/?mode=player';
    }

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
        const hitZone = this.add.zone(0, 0, hitW, hitH).setInteractive({ useHandCursor: true });
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
        hitZone.on('pointerdown', action);
        return container;
    }
}
