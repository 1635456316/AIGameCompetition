/**
 * 创意工坊
 *
 * 风格：全息玻璃 + 青/品红霓虹点缀
 * 布局：玻璃顶栏 / 2×3 卡片网格 / 分页器 / 玻璃底部按钮
 *
 * 卡片信息：自动生成的关卡缩略图 + 标签 + 难度 + 标题 + 作者 + 日期 + 统计占位
 */
class WorkshopScene extends Phaser.Scene {
    constructor() {
        super('WorkshopScene');
    }

    init() {
        this.levels = [];
        this.loading = true;
        this.errorText = '';
        this.focusIndex = 0;
        this.pageIndex = 0;
        this.pageSize = 6;
        this.authLoggedIn = false;
        this.authUser = null;
        this.levelCards = [];
        this.textResolution = Math.max(2, Math.min(3, (window.devicePixelRatio || 1) * 1.5));
    }

    _addText(x, y, text, style) {
        const obj = this.add.text(x, y, text, style);
        obj.setResolution(this.textResolution);
        return obj;
    }

    create() {
        const w = GAME_WIDTH;
        const h = GAME_HEIGHT;

        MenuBGM.play(this);

        const bg = this.add.image(w / 2, h / 2, 'ui_workshop_bg');
        const tex = this.textures.get('ui_workshop_bg').getSourceImage();
        if (tex && tex.width && tex.height) {
            bg.setScale(Math.max(w / tex.width, h / tex.height));
        } else {
            bg.setDisplaySize(w, h);
        }

        this.add.rectangle(w / 2, h / 2, w, h, 0x040814, 0.55).setDepth(1);

        const vignette = this.add.graphics().setDepth(2);
        vignette.fillStyle(0x000000, 0.35);
        vignette.fillRect(0, 0, w, 90);
        vignette.fillRect(0, h - 110, w, 110);

        this._createTopBar(w);
        this._createInfoBar(w);
        this._createCardsArea(w, h);
        this._createPagination(w);
        this._createBottomBar(w, h);

        this.input.keyboard.on('keydown-ESC', () => this.scene.start('LevelSelectScene'));
        this.input.keyboard.on('keydown-LEFT', () => this._moveFocus(-1));
        this.input.keyboard.on('keydown-RIGHT', () => this._moveFocus(1));
        this.input.keyboard.on('keydown-UP', () => this._moveFocus(-3));
        this.input.keyboard.on('keydown-DOWN', () => this._moveFocus(3));
        this.input.keyboard.on('keydown-PAGE_UP', () => this._gotoPage(this.pageIndex - 1));
        this.input.keyboard.on('keydown-PAGE_DOWN', () => this._gotoPage(this.pageIndex + 1));
        this.input.keyboard.on('keydown-ENTER', () => this._enterFocusedLevel());

        this._loadAuth();
        this._loadLevels();
    }

    // ============ 顶栏（玻璃面板：标题 + 登录信息） ============

    _createTopBar(w) {
        const barY = 0;
        const barH = 86;

        const panel = this._drawGlassRect(0, barY, w, barH, {
            fill: 0x040d1c,
            fillAlpha: 0.72,
            borderColor: 0x5feaff,
            borderAlpha: 0.55,
            depth: 10
        });
        panel.setDepth(10);

        const accentLine = this.add.graphics().setDepth(11);
        accentLine.fillStyle(0x5feaff, 0.85);
        accentLine.fillRect(0, barH - 1, w, 1);
        accentLine.fillStyle(0xff5fb9, 1);
        accentLine.fillRect(0, barH - 1, 220, 1);

        const iconX = 36;
        const iconY = 30;
        const iconGfx = this.add.graphics().setDepth(12);
        iconGfx.lineStyle(2, 0x5feaff, 1);
        iconGfx.strokeCircle(iconX, iconY, 12);
        iconGfx.lineStyle(1.5, 0xff5fb9, 1);
        iconGfx.beginPath();
        iconGfx.moveTo(iconX - 12, iconY);
        iconGfx.lineTo(iconX + 12, iconY);
        iconGfx.moveTo(iconX, iconY - 12);
        iconGfx.lineTo(iconX, iconY + 12);
        iconGfx.strokePath();

        this.titleText = this._addText(56, 16, '创 意 工 坊', {
            font: 'bold 28px Microsoft YaHei, Arial',
            color: '#5feaff'
        }).setOrigin(0, 0).setDepth(13);

        this.subtitleText = this._addText(58, 50, '加载中…', {
            font: '13px Microsoft YaHei, Arial',
            color: '#9fb0c8'
        }).setOrigin(0, 0).setDepth(13);

        this._createAuthBar(w, barH);
    }

    _createAuthBar(w, barH) {
        const panelW = 240;
        const panelH = 42;
        const panelX = w - panelW - 22;
        const panelY = (barH - panelH) / 2;

        this.authBar = this.add.container(panelX, panelY).setDepth(15);

        const bg = this._drawGlassRect(0, 0, panelW, panelH, {
            fill: 0x081628,
            fillAlpha: 0.8,
            borderColor: 0x5feaff,
            borderAlpha: 0.45
        });
        this.authBar.add(bg);

        const avatarX = 22;
        const avatarY = panelH / 2;
        this.authAvatar = this.add.graphics();
        this.authAvatar.fillStyle(0x0c2a4a, 1);
        this.authAvatar.fillCircle(avatarX, avatarY, 12);
        this.authAvatar.lineStyle(1.5, 0x5feaff, 0.85);
        this.authAvatar.strokeCircle(avatarX, avatarY, 12);
        this.authBar.add(this.authAvatar);

        this.authAvatarText = this._addText(avatarX, avatarY, '?', {
            font: 'bold 13px Microsoft YaHei, Arial',
            color: '#5feaff'
        }).setOrigin(0.5);
        this.authBar.add(this.authAvatarText);

        this.authUserText = this._addText(42, panelH / 2, '检测登录…', {
            font: '13px Microsoft YaHei, Arial',
            color: '#9fb0c8'
        }).setOrigin(0, 0.5);
        this.authBar.add(this.authUserText);

        const actionContainer = this.add.container(panelW - 14, panelH / 2);
        const actionBg = this.add.rectangle(0, 0, 56, 24, 0x5feaff, 0.12).setStrokeStyle(1, 0x5feaff, 0.7);
        actionBg.setOrigin(1, 0.5);
        actionContainer.add(actionBg);

        this.authActionText = this._addText(-28, 0, '登录', {
            font: 'bold 12px Microsoft YaHei, Arial',
            color: '#5feaff'
        }).setOrigin(0.5, 0.5);
        actionContainer.add(this.authActionText);

        const actionHit = this.add.zone(-28, 0, 60, 24).setInteractive({ useHandCursor: true });
        actionContainer.add(actionHit);

        actionHit.on('pointerover', () => {
            actionBg.setFillStyle(0x5feaff, 0.28);
            this.authActionText.setColor('#ffffff');
        });
        actionHit.on('pointerout', () => {
            actionBg.setFillStyle(0x5feaff, 0.12);
            this.authActionText.setColor(this.authLoggedIn ? '#ff8fbf' : '#5feaff');
        });
        actionHit.on('pointerdown', () => this._onAuthAction());

        this.authActionBg = actionBg;
        this.authBar.add(actionContainer);
    }

    // ============ 信息栏（"共 X 个 / 第 N/M 页" + 排序占位） ============

    _createInfoBar(w) {
        const y = 100;

        this.infoText = this._addText(36, y, '', {
            font: '13px Microsoft YaHei, Arial',
            color: '#8fbfd6'
        }).setOrigin(0, 0).setDepth(12);

        const sortContainer = this.add.container(w - 36, y + 6).setDepth(12);
        const sortBg = this.add.rectangle(0, 0, 110, 24, 0x081628, 0.7)
            .setStrokeStyle(1, 0x5feaff, 0.35);
        sortBg.setOrigin(1, 0.5);
        sortContainer.add(sortBg);
        const sortText = this._addText(-12, 0, '排序：最新', {
            font: '12px Microsoft YaHei, Arial',
            color: '#8fbfd6'
        }).setOrigin(1, 0.5);
        sortContainer.add(sortText);
    }

    // ============ 卡片网格 ============

    _createCardsArea(w, h) {
        this.cardsContainer = this.add.container(0, 0).setDepth(15);

        this.emptyContainer = this.add.container(w / 2, h / 2 - 20).setDepth(16).setVisible(false);
        const emptyPanel = this._drawGlassRect(-220, -90, 440, 180, {
            fill: 0x0a1830,
            fillAlpha: 0.72,
            borderColor: 0x5feaff,
            borderAlpha: 0.5
        });
        this.emptyContainer.add(emptyPanel);
        this.emptyTitle = this._addText(0, -52, '', {
            font: 'bold 20px Microsoft YaHei, Arial',
            color: '#5feaff'
        }).setOrigin(0.5);
        this.emptyContainer.add(this.emptyTitle);
        this.emptyDesc = this._addText(0, -10, '', {
            font: '13px Microsoft YaHei, Arial',
            color: '#9fb0c8',
            align: 'center',
            wordWrap: { width: 400 }
        }).setOrigin(0.5);
        this.emptyContainer.add(this.emptyDesc);

        const emptyAction = this.add.container(0, 50);
        const emptyBtnBg = this.add.rectangle(0, 0, 180, 36, 0x5feaff, 0.16)
            .setStrokeStyle(1.5, 0x5feaff, 0.8);
        const emptyBtnText = this._addText(0, 0, '前往关卡编辑器', {
            font: 'bold 14px Microsoft YaHei, Arial',
            color: '#5feaff'
        }).setOrigin(0.5);
        emptyAction.add([emptyBtnBg, emptyBtnText]);
        emptyBtnBg.setInteractive({ useHandCursor: true });
        emptyBtnBg.on('pointerover', () => {
            emptyBtnBg.setFillStyle(0x5feaff, 0.28);
            emptyBtnText.setColor('#ffffff');
        });
        emptyBtnBg.on('pointerout', () => {
            emptyBtnBg.setFillStyle(0x5feaff, 0.16);
            emptyBtnText.setColor('#5feaff');
        });
        emptyBtnBg.on('pointerdown', () => this._openEditor());
        this.emptyContainer.add(emptyAction);
    }

    // ============ 分页器 ============

    _createPagination(w) {
        const y = 590;
        this.pagination = this.add.container(w / 2, y).setDepth(15).setVisible(false);

        const makeArrow = (x, dir) => {
            const c = this.add.container(x, 0);
            const bg = this.add.rectangle(0, 0, 36, 30, 0x081628, 0.7)
                .setStrokeStyle(1, 0x5feaff, 0.5);
            const arrow = this.add.graphics();
            arrow.fillStyle(0x5feaff, 1);
            if (dir === -1) {
                arrow.fillTriangle(4, 0, -3, -6, -3, 6);
            } else {
                arrow.fillTriangle(-4, 0, 3, -6, 3, 6);
            }
            c.add([bg, arrow]);
            bg.setInteractive({ useHandCursor: true });
            bg.on('pointerover', () => bg.setFillStyle(0x5feaff, 0.22));
            bg.on('pointerout', () => bg.setFillStyle(0x081628, 0.7));
            bg.on('pointerdown', () => this._gotoPage(this.pageIndex + dir));
            return { container: c, bg };
        };

        const left = makeArrow(-80, -1);
        const right = makeArrow(80, 1);
        this.pagination.add([left.container, right.container]);
        this.pageLeftBtn = left;
        this.pageRightBtn = right;

        this.pageLabel = this._addText(0, 0, '1 / 1', {
            font: 'bold 14px Microsoft YaHei, Arial',
            color: '#cfe6f5'
        }).setOrigin(0.5);
        this.pagination.add(this.pageLabel);
    }

    // ============ 底部按钮栏（玻璃风按钮） ============

    _createBottomBar(w, h) {
        const barY = h - 78;

        const barPanel = this._drawGlassRect(0, h - 108, w, 108, {
            fill: 0x040d1c,
            fillAlpha: 0.78,
            borderColor: 0x5feaff,
            borderAlpha: 0.4,
            depth: 8
        });
        barPanel.setDepth(8);

        const accent = this.add.graphics().setDepth(9);
        accent.fillStyle(0x5feaff, 0.65);
        accent.fillRect(0, h - 108, w, 1);

        const btnW = 200;
        const btnH = 48;
        const btnGap = 18;
        const totalW = btnW * 3 + btnGap * 2;
        const startX = (w - totalW) / 2 + btnW / 2;

        this._createGlassButton(startX, barY, btnW, btnH, '◀  返回选关', () => {
            this.scene.start('LevelSelectScene');
        }, { color: 0x5feaff });

        this._createGlassButton(startX + btnW + btnGap, barY, btnW, btnH, '✦  关卡编辑器', () => {
            this._openEditor();
        }, { color: 0xff5fb9, primary: true });

        this._createGlassButton(startX + (btnW + btnGap) * 2, barY, btnW, btnH, '↻  刷新列表', () => {
            this.scene.restart();
        }, { color: 0x5feaff });

        this._addText(w / 2, h - 18, '← →  切换    ↑ ↓  翻页    ENTER  游玩    ESC  返回', {
            font: 'bold 11px Microsoft YaHei, Arial',
            color: '#7f99b3'
        }).setOrigin(0.5).setDepth(20);
    }

    // ============ 登录态相关（保持原行为） ============

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
            this.authUserText.setText(this._truncate(name, 10));
            this.authUserText.setColor('#cfe6f5');
            this.authAvatarText.setText(name.slice(0, 1));
            this.authAvatarText.setColor('#ffffff');
            this.authAvatar.clear();
            this.authAvatar.fillStyle(0x0d6b96, 1);
            this.authAvatar.fillCircle(22, 21, 12);
            this.authAvatar.lineStyle(1.5, 0x5feaff, 1);
            this.authAvatar.strokeCircle(22, 21, 12);
            this.authActionText.setText('登出');
            this.authActionText.setColor('#ff8fbf');
            this.authActionBg.setStrokeStyle(1, 0xff5fb9, 0.7);
        } else {
            this.authUserText.setText('未登录');
            this.authUserText.setColor('#9fb0c8');
            this.authAvatarText.setText('?');
            this.authAvatarText.setColor('#5feaff');
            this.authAvatar.clear();
            this.authAvatar.fillStyle(0x0c2a4a, 1);
            this.authAvatar.fillCircle(22, 21, 12);
            this.authAvatar.lineStyle(1.5, 0x5feaff, 0.85);
            this.authAvatar.strokeCircle(22, 21, 12);
            this.authActionText.setText('登录');
            this.authActionText.setColor('#5feaff');
            this.authActionBg.setStrokeStyle(1, 0x5feaff, 0.7);
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

    // ============ 数据加载 ============

    async _loadLevels() {
        try {
            this.levels = await WorkshopApi.fetchLevels();
            this.loading = false;
            this.errorText = '';
            this._updateInfo();
            this._renderPage();
        } catch (err) {
            this.loading = false;
            this.errorText = err.message || String(err);
            this.subtitleText.setText('加载失败');
            this._showEmpty('加载失败', `无法加载创意工坊列表\n${this.errorText}\n\n请确认通过 server 启动游戏`);
        }
    }

    _updateInfo() {
        const total = this.levels.length;
        const pages = Math.max(1, Math.ceil(total / this.pageSize));
        if (total === 0) {
            this.subtitleText.setText('暂无玩家关卡，去编辑器创作吧');
            this.infoText.setText('');
        } else {
            this.subtitleText.setText(`共 ${total} 个玩家关卡 · 第 ${this.pageIndex + 1} / ${pages} 页`);
            this.infoText.setText(`◆ 共 ${total} 个关卡  ·  当前第 ${this.pageIndex + 1} / ${pages} 页`);
        }
    }

    // ============ 卡片网格渲染 ============

    _renderPage() {
        this.cardsContainer.removeAll(true);
        this.levelCards = [];

        if (!this.levels.length) {
            this.pagination.setVisible(false);
            this._showEmpty('还没有玩家发布的关卡', '点击下方「关卡编辑器」开始创作\n你的关卡将与全场玩家分享');
            return;
        }

        this.emptyContainer.setVisible(false);

        const total = this.levels.length;
        const totalPages = Math.max(1, Math.ceil(total / this.pageSize));
        if (this.pageIndex >= totalPages) this.pageIndex = totalPages - 1;
        if (this.pageIndex < 0) this.pageIndex = 0;

        const cardW = 268;
        const cardH = 210;
        const colGap = 32;
        const rowGap = 18;
        const cols = 3;
        const startX = (GAME_WIDTH - (cardW * cols + colGap * (cols - 1))) / 2 + cardW / 2;
        const startY = 232;

        const begin = this.pageIndex * this.pageSize;
        const end = Math.min(begin + this.pageSize, total);

        for (let i = begin; i < end; i++) {
            const local = i - begin;
            const col = local % cols;
            const row = Math.floor(local / cols);
            const x = startX + col * (cardW + colGap);
            const y = startY + row * (cardH + rowGap);
            const card = this._createLevelCard(this.levels[i], x, y, cardW, cardH, local, i);
            this.levelCards.push(card);
        }

        this._updatePagination(totalPages);
        this._updateInfo();

        this.focusIndex = 0;
        this._updateCardFocus();
    }

    _updatePagination(totalPages) {
        this.pagination.setVisible(true);
        this.pageLabel.setText(`${this.pageIndex + 1} / ${totalPages}`);

        const hasPrev = this.pageIndex > 0;
        const hasNext = this.pageIndex < totalPages - 1;
        this.pageLeftBtn.bg.setAlpha(hasPrev ? 1 : 0.35);
        this.pageRightBtn.bg.setAlpha(hasNext ? 1 : 0.35);
    }

    _gotoPage(idx) {
        if (!this.levels.length) return;
        const totalPages = Math.max(1, Math.ceil(this.levels.length / this.pageSize));
        const target = Math.max(0, Math.min(totalPages - 1, idx));
        if (target === this.pageIndex) return;
        this.pageIndex = target;
        this._renderPage();
    }

    _createLevelCard(level, x, y, cardW, cardH, localIndex, globalIndex) {
        const container = this.add.container(x, y);
        container.setSize(cardW, cardH);
        this.cardsContainer.add(container);

        const halfW = cardW / 2;
        const halfH = cardH / 2;

        const outerGlow = this.add.graphics();
        outerGlow.fillStyle(0x5feaff, 0.08);
        outerGlow.fillRoundedRect(-halfW - 6, -halfH - 6, cardW + 12, cardH + 12, 12);
        container.add(outerGlow);

        const bg = this.add.graphics();
        bg.fillStyle(0x0a1628, 0.92);
        bg.fillRoundedRect(-halfW, -halfH, cardW, cardH, 8);
        bg.fillStyle(0x5feaff, 0.04);
        bg.fillRoundedRect(-halfW, -halfH, cardW, cardH / 2, 8);
        bg.lineStyle(1.5, 0x5feaff, 0.7);
        bg.strokeRoundedRect(-halfW, -halfH, cardW, cardH, 8);
        bg.fillStyle(0x5feaff, 0.85);
        bg.fillRect(-halfW + 1, -halfH + 1, cardW - 2, 1);
        bg.fillStyle(0x000000, 0.4);
        bg.fillRect(-halfW + 1, halfH - 2, cardW - 2, 1);
        container.add(bg);

        const thumbW = LevelThumbnail.WIDTH;
        const thumbH = LevelThumbnail.HEIGHT;
        const thumbX = 0;
        const thumbY = -halfH + 8 + thumbH / 2;

        const thumbFrame = this.add.graphics();
        thumbFrame.lineStyle(1, 0x5feaff, 0.55);
        thumbFrame.strokeRect(thumbX - thumbW / 2, thumbY - thumbH / 2, thumbW, thumbH);
        container.add(thumbFrame);

        const thumbPlaceholder = this.add.graphics();
        thumbPlaceholder.fillStyle(0x081628, 1);
        thumbPlaceholder.fillRect(thumbX - thumbW / 2, thumbY - thumbH / 2, thumbW, thumbH);
        thumbPlaceholder.fillStyle(0x5feaff, 0.06);
        thumbPlaceholder.fillRect(thumbX - thumbW / 2, thumbY - thumbH / 2, thumbW, thumbH);
        container.add(thumbPlaceholder);

        const thumbLoading = this._addText(thumbX, thumbY, '◌ 加载预览…', {
            font: '12px Microsoft YaHei, Arial',
            color: '#5feaff'
        }).setOrigin(0.5).setAlpha(0.8);
        container.add(thumbLoading);

        const thumbImage = this.add.image(thumbX, thumbY, '__DEFAULT')
            .setVisible(false)
            .setDisplaySize(thumbW, thumbH);
        container.add(thumbImage);

        const infoTop = thumbY + thumbH / 2 + 12;

        const tags = this._buildTagsForLevel(level);
        const tagY = infoTop;
        let tagX = -halfW + 14;
        tags.forEach(tag => {
            const tagText = this._addText(0, 0, tag.label, {
                font: 'bold 10px Microsoft YaHei, Arial',
                color: tag.fg
            }).setOrigin(0, 0.5);
            const padX = 6;
            const tagW = tagText.width + padX * 2;
            const tagH = 18;
            const tagBg = this.add.rectangle(tagX, tagY, tagW, tagH, tag.bg, tag.bgAlpha)
                .setOrigin(0, 0.5)
                .setStrokeStyle(1, tag.border, 0.85);
            tagText.setPosition(tagX + padX, tagY);
            container.add(tagBg);
            container.add(tagText);
            tagX += tagW + 6;
        });

        const titleY = infoTop + 20;
        const title = this._addText(0, titleY, this._truncate(level.title || '未命名关卡', 14), {
            font: 'bold 16px Microsoft YaHei, Arial',
            color: '#ffffff'
        }).setOrigin(0.5, 0);
        container.add(title);

        const metaY = titleY + 24;
        const metaText = this._addText(0, metaY, `${this._truncate(level.authorName || '未知作者', 10)}  ·  ${this._formatDate(level.createdAt)}`, {
            font: '11px Microsoft YaHei, Arial',
            color: '#8fbfd6'
        }).setOrigin(0.5, 0);
        container.add(metaText);

        const statY = halfH - 12;
        const statText = this._addText(0, statY, '— 关卡详情加载中 —', {
            font: '11px Microsoft YaHei, Arial',
            color: '#5a7080'
        }).setOrigin(0.5);
        container.add(statText);

        const hit = this.add.zone(0, 0, cardW, cardH).setInteractive({ useHandCursor: true });
        container.add(hit);

        const card = {
            container,
            level,
            localIndex,
            globalIndex,
            bg,
            outerGlow,
            thumbImage,
            thumbLoading,
            statText,
            title,
            tagY,
            hit,
            focused: false
        };

        hit.on('pointerover', () => {
            if (!card.focused) {
                this.focusIndex = localIndex;
                this._updateCardFocus();
            }
        });
        hit.on('pointerdown', () => {
            this.focusIndex = localIndex;
            this._updateCardFocus();
            this._enterLevel(level.id);
        });

        this._loadCardThumbnail(card);

        return card;
    }

    async _loadCardThumbnail(card) {
        const { textureKey, level } = await LevelThumbnail.ensure(this, card.level.id);
        if (!card.container || !card.container.scene) return;
        if (textureKey && this.textures.exists(textureKey)) {
            card.thumbImage.setTexture(textureKey);
            card.thumbImage.setDisplaySize(LevelThumbnail.WIDTH, LevelThumbnail.HEIGHT);
            card.thumbImage.setVisible(true).setAlpha(0);
            this.tweens.add({ targets: card.thumbImage, alpha: 1, duration: 240, ease: 'Sine.easeOut' });
            this.tweens.add({ targets: card.thumbLoading, alpha: 0, duration: 200, onComplete: () => card.thumbLoading.setVisible(false) });

            const info = LevelThumbnail.analyze(level || {});
            const stars = '★'.repeat(info.difficulty) + '☆'.repeat(5 - info.difficulty);
            const counts = `${stars}    平台 ${info.platformCount}  ·  敌人 ${info.enemyCount}`;
            card.statText.setText(counts);
            card.statText.setColor('#ffd76b');

            this._appendModeTag(card, info);
        } else {
            card.thumbLoading.setText('预览不可用');
            card.thumbLoading.setColor('#ff8fbf');
            card.statText.setText('— 详情加载失败 —');
        }
    }

    _appendModeTag(card, info) {
        if (!info.isBoss && !info.isFinish) return;
        const tag = info.isBoss
            ? { label: 'BOSS', fg: '#ffffff', bg: 0xff2b2b, bgAlpha: 0.85, border: 0xff5fb9 }
            : { label: '通关', fg: '#001a33', bg: 0xffd400, bgAlpha: 0.9, border: 0xffd400 };

        const tagText = this._addText(0, 0, tag.label, {
            font: 'bold 10px Microsoft YaHei, Arial',
            color: tag.fg
        }).setOrigin(0, 0.5);
        const padX = 6;
        const tagW = tagText.width + padX * 2;
        const tagH = 18;
        const halfW = card.container.width / 2;
        const tagY = card.tagY;
        // Place after existing tags by inspecting existing children's right edge
        let rightEdge = -halfW + 14;
        card.container.list.forEach(obj => {
            if (obj instanceof Phaser.GameObjects.Rectangle && Math.abs(obj.y - tagY) < 1 && obj.originX === 0) {
                rightEdge = Math.max(rightEdge, obj.x + obj.width + 6);
            }
        });
        const tagBg = this.add.rectangle(rightEdge, tagY, tagW, tagH, tag.bg, tag.bgAlpha)
            .setOrigin(0, 0.5)
            .setStrokeStyle(1, tag.border, 0.85);
        tagText.setPosition(rightEdge + padX, tagY);
        card.container.add(tagBg);
        card.container.add(tagText);
    }

    _buildTagsForLevel(level) {
        const tags = [];
        const now = Date.now();
        const sevenDays = 7 * 24 * 3600 * 1000;
        if (level.createdAt && now - level.createdAt < sevenDays) {
            tags.push({
                label: '新作',
                fg: '#ffffff',
                bg: 0xff5fb9,
                bgAlpha: 0.85,
                border: 0xff5fb9
            });
        }
        return tags;
    }

    _showEmpty(title, desc) {
        this.emptyTitle.setText(title);
        this.emptyDesc.setText(desc);
        this.emptyContainer.setVisible(true);
    }

    // ============ 焦点与交互 ============

    _moveFocus(delta) {
        if (!this.levelCards.length) return;

        const total = this.levels.length;
        const totalPages = Math.max(1, Math.ceil(total / this.pageSize));
        let nextGlobal = this.pageIndex * this.pageSize + this.focusIndex + delta;

        if (nextGlobal < 0) {
            if (this.pageIndex > 0) {
                this.pageIndex -= 1;
                this._renderPage();
                this.focusIndex = this.levelCards.length - 1;
                this._updateCardFocus();
            }
            return;
        }
        if (nextGlobal >= total) {
            if (this.pageIndex < totalPages - 1) {
                this.pageIndex += 1;
                this._renderPage();
                this.focusIndex = 0;
                this._updateCardFocus();
            }
            return;
        }

        const targetPage = Math.floor(nextGlobal / this.pageSize);
        if (targetPage !== this.pageIndex) {
            this.pageIndex = targetPage;
            this._renderPage();
        }
        this.focusIndex = nextGlobal - this.pageIndex * this.pageSize;
        this._updateCardFocus();
    }

    _updateCardFocus() {
        if (!this.levelCards) return;
        this.levelCards.forEach((card, i) => {
            const focused = i === this.focusIndex;
            card.focused = focused;

            card.container.setScale(1);

            card.outerGlow.clear();
            if (focused) {
                card.outerGlow.fillStyle(0xff5fb9, 0.22);
                card.outerGlow.fillRoundedRect(-card.container.width / 2 - 8, -card.container.height / 2 - 8,
                    card.container.width + 16, card.container.height + 16, 14);
                card.outerGlow.fillStyle(0x5feaff, 0.18);
                card.outerGlow.fillRoundedRect(-card.container.width / 2 - 4, -card.container.height / 2 - 4,
                    card.container.width + 8, card.container.height + 8, 12);
            } else {
                card.outerGlow.fillStyle(0x5feaff, 0.08);
                card.outerGlow.fillRoundedRect(-card.container.width / 2 - 6, -card.container.height / 2 - 6,
                    card.container.width + 12, card.container.height + 12, 12);
            }

            card.bg.clear();
            this._drawCardBg(card.bg, card.container.width, card.container.height, focused);
            card.title.setColor(focused ? '#5feaff' : '#ffffff');
        });
    }

    _drawCardBg(bg, cardW, cardH, focused) {
        const halfW = cardW / 2;
        const halfH = cardH / 2;
        bg.fillStyle(focused ? 0x0d2240 : 0x0a1628, 0.94);
        bg.fillRoundedRect(-halfW, -halfH, cardW, cardH, 8);
        bg.fillStyle(0x5feaff, focused ? 0.08 : 0.04);
        bg.fillRoundedRect(-halfW, -halfH, cardW, cardH / 2, 8);
        bg.lineStyle(focused ? 2 : 1.5, focused ? 0xff5fb9 : 0x5feaff, focused ? 1 : 0.7);
        bg.strokeRoundedRect(-halfW, -halfH, cardW, cardH, 8);
        bg.fillStyle(0x5feaff, 0.85);
        bg.fillRect(-halfW + 1, -halfH + 1, cardW - 2, 1);
        bg.fillStyle(0x000000, 0.4);
        bg.fillRect(-halfW + 1, halfH - 2, cardW - 2, 1);
    }

    _enterFocusedLevel() {
        const card = this.levelCards[this.focusIndex];
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

    // ============ 通用 UI 组件 ============

    _drawGlassRect(x, y, w, h, opts = {}) {
        const {
            fill = 0x081628,
            fillAlpha = 0.8,
            borderColor = 0x5feaff,
            borderAlpha = 0.6,
            radius = 0,
            depth
        } = opts;
        const gfx = this.add.graphics();
        if (depth != null) gfx.setDepth(depth);

        if (radius > 0) {
            gfx.fillStyle(fill, fillAlpha);
            gfx.fillRoundedRect(x, y, w, h, radius);
            gfx.lineStyle(1, borderColor, borderAlpha);
            gfx.strokeRoundedRect(x, y, w, h, radius);
        } else {
            gfx.fillStyle(fill, fillAlpha);
            gfx.fillRect(x, y, w, h);
            gfx.lineStyle(1, borderColor, borderAlpha);
            gfx.strokeRect(x, y, w, h);
        }
        gfx.fillStyle(0xffffff, 0.06);
        gfx.fillRect(x + 1, y + 1, w - 2, 1);
        return gfx;
    }

    _createGlassButton(x, y, w, h, label, action, opts = {}) {
        const {
            color = 0x5feaff,
            primary = false
        } = opts;

        const container = this.add.container(x, y).setDepth(20);
        const halfW = w / 2;
        const halfH = h / 2;

        const glow = this.add.graphics();
        glow.fillStyle(color, primary ? 0.18 : 0.1);
        glow.fillRoundedRect(-halfW - 4, -halfH - 4, w + 8, h + 8, 8);
        container.add(glow);

        const bg = this.add.graphics();
        const drawBg = (hovered) => {
            bg.clear();
            bg.fillStyle(primary ? 0x2a0c20 : 0x081628, hovered ? 0.92 : 0.85);
            bg.fillRoundedRect(-halfW, -halfH, w, h, 6);
            if (primary) {
                bg.fillStyle(color, hovered ? 0.32 : 0.18);
                bg.fillRoundedRect(-halfW, -halfH, w, h, 6);
            }
            bg.lineStyle(hovered ? 2 : 1.5, color, hovered ? 1 : 0.75);
            bg.strokeRoundedRect(-halfW, -halfH, w, h, 6);
            bg.fillStyle(color, 0.65);
            bg.fillRect(-halfW + 2, -halfH + 1, w - 4, 1);
        };
        drawBg(false);
        container.add(bg);

        const text = this._addText(0, 0, label, {
            font: `bold 14px Microsoft YaHei, Arial`,
            color: primary ? '#ffffff' : '#cfe6f5'
        }).setOrigin(0.5);
        container.add(text);

        const hit = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
        container.add(hit);

        hit.on('pointerover', () => {
            drawBg(true);
            text.setColor('#ffffff');
        });
        hit.on('pointerout', () => {
            drawBg(false);
            text.setColor(primary ? '#ffffff' : '#cfe6f5');
        });
        hit.on('pointerdown', action);
        return container;
    }

    // ============ 工具 ============

    _formatDate(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    _truncate(str, max) {
        if (!str) return '';
        if (str.length <= max) return str;
        return str.slice(0, Math.max(1, max - 1)) + '…';
    }
}
