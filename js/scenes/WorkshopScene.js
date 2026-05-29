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
        this.myLevelsMenuOpen = false;
        this.myLevelsLoading = false;
        this.loginPanelOpen = false;
        this.loginPendingReturnTo = null;
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

        this.scale.on('resize', this._onScaleResize, this);
    }

    shutdown() {
        this.scale.off('resize', this._onScaleResize, this);
        this._closeMyLevelsMenu();
        this._removeMyLevelsMenuDom();
        this._closeLoginPanel();
        this._removeLoginPanelDom();
    }

    _onScaleResize() {
        if (this.myLevelsMenuOpen) this._positionMyLevelsMenu();
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
        this.authAvatarSlot = this.add.container(avatarX, avatarY);
        this.authBar.add(this.authAvatarSlot);
        this._renderAvatarInto(this.authAvatarSlot, 12, null, null, '?', false);

        const avatarHit = this.add.zone(avatarX, avatarY, 30, 30).setInteractive({ useHandCursor: true });
        this.authBar.add(avatarHit);
        avatarHit.on('pointerdown', (pointer) => {
            pointer.event.stopPropagation();
            this._onAvatarClick();
        });
        this.authAvatarHit = avatarHit;

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

        this.authBarPanelX = panelX;
        this.authBarPanelY = panelY;
        this.authBarPanelW = panelW;
        this.authBarPanelH = panelH;
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
                arrow.fillTriangle(-4, 0, 3, -6, 3, 6);
            } else {
                arrow.fillTriangle(4, 0, -3, -6, -3, 6);
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
            this._renderAvatarInto(this.authAvatarSlot, 12, auth.userId, auth.avatarUrl, name, true);
            this.authActionText.setText('登出');
            this.authActionText.setColor('#ff8fbf');
            this.authActionBg.setStrokeStyle(1, 0xff5fb9, 0.7);
        } else {
            this.authUserText.setText('未登录');
            this.authUserText.setColor('#9fb0c8');
            this._renderAvatarInto(this.authAvatarSlot, 12, null, null, '?', false);
            this.authActionText.setText('登录');
            this.authActionText.setColor('#5feaff');
            this.authActionBg.setStrokeStyle(1, 0x5feaff, 0.7);
        }
    }

    _goFeishuLogin(returnTo) {
        sessionStorage.setItem('boot-scene', 'WorkshopScene');
        window.location.href = WorkshopApi.getLoginUrl(returnTo || '/');
    }

    _ensureLoginPanelDom() {
        if (this.loginPanelBackdropEl) return;

        if (!document.getElementById('workshop-login-panel-styles')) {
            const style = document.createElement('style');
            style.id = 'workshop-login-panel-styles';
            style.textContent = `
                .workshop-login-backdrop {
                    position: fixed;
                    inset: 0;
                    z-index: 10050;
                    background: rgba(4, 10, 22, 0.72);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: "Microsoft YaHei", Arial, sans-serif;
                }
                .workshop-login-backdrop[hidden] { display: none !important; }
                .workshop-login-panel {
                    width: min(360px, calc(100vw - 32px));
                    padding: 22px 20px 18px;
                    background: linear-gradient(180deg, rgba(8, 22, 40, 0.98) 0%, rgba(4, 13, 28, 0.99) 100%);
                    border: 1px solid rgba(95, 234, 255, 0.55);
                    border-radius: 12px;
                    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 95, 185, 0.12);
                }
                .workshop-login-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 16px;
                }
                .workshop-login-title {
                    font-size: 15px;
                    font-weight: 700;
                    color: #5feaff;
                }
                .workshop-login-close {
                    border: none;
                    background: transparent;
                    color: #8fbfd6;
                    font-size: 20px;
                    line-height: 1;
                    cursor: pointer;
                    padding: 0 4px;
                }
                .workshop-login-close:hover { color: #ffffff; }
                .workshop-login-feishu {
                    width: 100%;
                    padding: 10px 14px;
                    border: 1px solid rgba(95, 234, 255, 0.7);
                    border-radius: 8px;
                    background: rgba(95, 234, 255, 0.14);
                    color: #5feaff;
                    font-size: 14px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: background 0.12s;
                }
                .workshop-login-feishu:hover {
                    background: rgba(95, 234, 255, 0.28);
                    color: #ffffff;
                }
                .workshop-login-divider {
                    margin: 16px 0 14px;
                    text-align: center;
                    font-size: 12px;
                    color: #6a8aa3;
                }
                .workshop-login-label {
                    display: block;
                    font-size: 12px;
                    color: #8fbfd6;
                    margin-bottom: 6px;
                }
                .workshop-login-input {
                    width: 100%;
                    box-sizing: border-box;
                    padding: 9px 12px;
                    border: 1px solid rgba(95, 234, 255, 0.35);
                    border-radius: 8px;
                    background: rgba(4, 16, 32, 0.9);
                    color: #e6eef8;
                    font-size: 14px;
                    outline: none;
                }
                .workshop-login-input:focus {
                    border-color: rgba(95, 234, 255, 0.75);
                    box-shadow: 0 0 0 2px rgba(95, 234, 255, 0.15);
                }
                .workshop-login-submit {
                    width: 100%;
                    margin-top: 12px;
                    padding: 10px 14px;
                    border: 1px solid rgba(255, 95, 185, 0.65);
                    border-radius: 8px;
                    background: rgba(255, 95, 185, 0.14);
                    color: #ff8fbf;
                    font-size: 14px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: background 0.12s;
                }
                .workshop-login-submit:hover:not(:disabled) {
                    background: rgba(255, 95, 185, 0.28);
                    color: #ffffff;
                }
                .workshop-login-submit:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .workshop-login-error {
                    margin-top: 10px;
                    min-height: 18px;
                    font-size: 12px;
                    color: #ff8fbf;
                    line-height: 1.4;
                }
                .workshop-login-hint {
                    margin-top: 8px;
                    font-size: 11px;
                    color: #6a8aa3;
                    line-height: 1.45;
                }
            `;
            document.head.appendChild(style);
        }

        const backdrop = document.createElement('div');
        backdrop.id = 'workshop-login-backdrop';
        backdrop.className = 'workshop-login-backdrop';
        backdrop.hidden = true;
        backdrop.innerHTML = `
            <div class="workshop-login-panel" role="dialog" aria-labelledby="workshop-login-title">
                <div class="workshop-login-header">
                    <span class="workshop-login-title" id="workshop-login-title">登录</span>
                    <button type="button" class="workshop-login-close" aria-label="关闭">×</button>
                </div>
                <button type="button" class="workshop-login-feishu">飞书登录(直链可用)</button>
                <div class="workshop-login-divider">或使用用户名</div>
                <label class="workshop-login-label" for="workshop-login-username">用户名</label>
                <input type="text" class="workshop-login-input" id="workshop-login-username"
                    maxlength="16" autocomplete="username" placeholder="2–16 字符，中文/英文/数字/下划线" />
                <button type="button" class="workshop-login-submit">使用用户名登录</button>
                <div class="workshop-login-error"></div>
                <p class="workshop-login-hint">首次登录将绑定当前 IP；该 IP 与用户名此后不可互换。</p>
            </div>`;
        document.body.appendChild(backdrop);

        this.loginPanelBackdropEl = backdrop;
        this.loginPanelEl = backdrop.querySelector('.workshop-login-panel');
        this.loginUsernameInputEl = backdrop.querySelector('.workshop-login-input');
        this.loginErrorEl = backdrop.querySelector('.workshop-login-error');
        this.loginSubmitBtnEl = backdrop.querySelector('.workshop-login-submit');
        this.loginFeishuBtnEl = backdrop.querySelector('.workshop-login-feishu');

        backdrop.querySelector('.workshop-login-close').addEventListener('click', () => this._closeLoginPanel());
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) this._closeLoginPanel();
        });
        this.loginPanelEl.addEventListener('click', (e) => e.stopPropagation());
        this.loginFeishuBtnEl.addEventListener('click', () => {
            this._goFeishuLogin(this.loginPendingReturnTo || '/');
        });
        this.loginSubmitBtnEl.addEventListener('click', () => this._submitUsernameLogin());
        this.loginUsernameInputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._submitUsernameLogin();
        });

        this._loginPanelEscHandler = (e) => {
            if (e.key === 'Escape' && this.loginPanelOpen) this._closeLoginPanel();
        };
    }

    _removeLoginPanelDom() {
        if (this._loginPanelEscHandler) {
            document.removeEventListener('keydown', this._loginPanelEscHandler);
            this._loginPanelEscHandler = null;
        }
        if (this.loginPanelBackdropEl) {
            this.loginPanelBackdropEl.remove();
            this.loginPanelBackdropEl = null;
            this.loginPanelEl = null;
            this.loginUsernameInputEl = null;
            this.loginErrorEl = null;
            this.loginSubmitBtnEl = null;
            this.loginFeishuBtnEl = null;
        }
    }

    _openLoginPanel(returnTo) {
        this._closeMyLevelsMenu();
        this._ensureLoginPanelDom();
        this.loginPanelOpen = true;
        this.loginPendingReturnTo = returnTo || null;
        this.loginPanelBackdropEl.hidden = false;
        if (this.loginErrorEl) this.loginErrorEl.textContent = '';
        if (this.loginUsernameInputEl) {
            this.loginUsernameInputEl.value = '';
            this.loginUsernameInputEl.disabled = false;
        }
        if (this.loginSubmitBtnEl) {
            this.loginSubmitBtnEl.disabled = false;
            this.loginSubmitBtnEl.textContent = '使用用户名登录';
        }
        document.addEventListener('keydown', this._loginPanelEscHandler);
        setTimeout(() => this.loginUsernameInputEl?.focus(), 0);
    }

    _closeLoginPanel() {
        this.loginPanelOpen = false;
        this.loginPendingReturnTo = null;
        if (this.loginPanelBackdropEl) this.loginPanelBackdropEl.hidden = true;
        if (this._loginPanelEscHandler) {
            document.removeEventListener('keydown', this._loginPanelEscHandler);
        }
    }

    async _submitUsernameLogin() {
        if (!this.loginUsernameInputEl || this.loginSubmitting) return;
        const userName = this.loginUsernameInputEl.value.trim();
        if (!userName) {
            if (this.loginErrorEl) this.loginErrorEl.textContent = '请输入用户名';
            return;
        }

        this.loginSubmitting = true;
        if (this.loginSubmitBtnEl) {
            this.loginSubmitBtnEl.disabled = true;
            this.loginSubmitBtnEl.textContent = '登录中…';
        }
        if (this.loginErrorEl) this.loginErrorEl.textContent = '';

        try {
            const auth = await WorkshopApi.loginWithUsername(userName);
            this._updateAuthBar(auth);
            const returnTo = this.loginPendingReturnTo;
            this._closeLoginPanel();
            if (returnTo) {
                window.location.href = returnTo;
            }
        } catch (err) {
            if (this.loginErrorEl) {
                this.loginErrorEl.textContent = err.message || '登录失败';
            }
        } finally {
            this.loginSubmitting = false;
            if (this.loginSubmitBtnEl) {
                this.loginSubmitBtnEl.disabled = false;
                this.loginSubmitBtnEl.textContent = '使用用户名登录';
            }
        }
    }

    async _onAvatarClick() {
        if (!this.authLoggedIn) {
            this._openLoginPanel('/');
            return;
        }

        if (this.myLevelsMenuOpen) {
            this._closeMyLevelsMenu();
            return;
        }

        await this._openMyLevelsMenu();
    }

    _ensureMyLevelsMenuDom() {
        if (this.myLevelsMenuEl) return;

        if (!document.getElementById('workshop-my-levels-styles')) {
            const style = document.createElement('style');
            style.id = 'workshop-my-levels-styles';
            style.textContent = `
                .workshop-my-levels-menu {
                    position: fixed;
                    z-index: 10000;
                    width: 280px;
                    max-height: 320px;
                    display: flex;
                    flex-direction: column;
                    background: linear-gradient(180deg, rgba(8, 22, 40, 0.97) 0%, rgba(4, 13, 28, 0.98) 100%);
                    border: 1px solid rgba(95, 234, 255, 0.55);
                    border-radius: 10px;
                    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 95, 185, 0.15);
                    backdrop-filter: blur(8px);
                    overflow: hidden;
                    font-family: "Microsoft YaHei", Arial, sans-serif;
                }
                .workshop-my-levels-menu[hidden] { display: none !important; }
                .workshop-my-levels-header {
                    padding: 10px 14px;
                    font-size: 13px;
                    font-weight: 700;
                    color: #5feaff;
                    border-bottom: 1px solid rgba(95, 234, 255, 0.25);
                    background: rgba(95, 234, 255, 0.06);
                }
                .workshop-my-levels-list {
                    overflow-y: auto;
                    max-height: 260px;
                    padding: 6px;
                }
                .workshop-my-levels-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 10px;
                    border-radius: 6px;
                    transition: background 0.12s;
                }
                .workshop-my-levels-item:hover { background: rgba(95, 234, 255, 0.08); }
                .workshop-my-levels-title {
                    flex: 1;
                    min-width: 0;
                    font-size: 13px;
                    color: #e6eef8;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .workshop-my-levels-delete {
                    flex-shrink: 0;
                    padding: 4px 10px;
                    border: 1px solid rgba(255, 95, 185, 0.65);
                    border-radius: 5px;
                    background: rgba(255, 95, 185, 0.12);
                    color: #ff8fbf;
                    font-size: 12px;
                    cursor: pointer;
                    transition: background 0.12s, color 0.12s;
                }
                .workshop-my-levels-delete:hover:not(:disabled) {
                    background: rgba(255, 95, 185, 0.28);
                    color: #ffffff;
                }
                .workshop-my-levels-delete:disabled {
                    opacity: 0.45;
                    cursor: not-allowed;
                }
                .workshop-my-levels-empty,
                .workshop-my-levels-loading,
                .workshop-my-levels-error {
                    padding: 16px 14px;
                    font-size: 13px;
                    color: #8fbfd6;
                    text-align: center;
                }
                .workshop-my-levels-error { color: #ff8fbf; }
            `;
            document.head.appendChild(style);
        }

        const menu = document.createElement('div');
        menu.id = 'workshop-my-levels-menu';
        menu.className = 'workshop-my-levels-menu';
        menu.hidden = true;
        menu.innerHTML = `
            <div class="workshop-my-levels-header">我的发布</div>
            <div class="workshop-my-levels-list"></div>`;
        document.body.appendChild(menu);

        this.myLevelsMenuEl = menu;
        this.myLevelsListEl = menu.querySelector('.workshop-my-levels-list');

        this._myLevelsOutsideHandler = (e) => {
            if (!this.myLevelsMenuOpen || !this.myLevelsMenuEl) return;
            if (this.myLevelsMenuEl.contains(e.target)) return;
            this._closeMyLevelsMenu();
        };
    }

    _removeMyLevelsMenuDom() {
        if (this._myLevelsOutsideHandler) {
            document.removeEventListener('mousedown', this._myLevelsOutsideHandler);
            this._myLevelsOutsideHandler = null;
        }
        if (this.myLevelsMenuEl) {
            this.myLevelsMenuEl.remove();
            this.myLevelsMenuEl = null;
            this.myLevelsListEl = null;
        }
    }

    _gameToScreen(x, y) {
        const canvas = this.game.canvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / GAME_WIDTH;
        const scaleY = rect.height / GAME_HEIGHT;
        return {
            left: rect.left + x * scaleX,
            top: rect.top + y * scaleY,
            scaleX,
            scaleY
        };
    }

    _positionMyLevelsMenu() {
        if (!this.myLevelsMenuEl) return;

        const panelX = this.authBarPanelX ?? (GAME_WIDTH - 262);
        const panelY = this.authBarPanelY ?? 22;
        const panelW = this.authBarPanelW ?? 240;
        const panelH = this.authBarPanelH ?? 42;

        const anchorX = panelX + panelW;
        const anchorY = panelY + panelH + 6;
        const screen = this._gameToScreen(anchorX, anchorY);
        const menuW = this.myLevelsMenuEl.offsetWidth || 280;

        let left = screen.left - menuW;
        let top = screen.top;

        left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
        top = Math.max(8, Math.min(top, window.innerHeight - (this.myLevelsMenuEl.offsetHeight || 200) - 8));

        this.myLevelsMenuEl.style.left = `${left}px`;
        this.myLevelsMenuEl.style.top = `${top}px`;
    }

    async _openMyLevelsMenu() {
        this._ensureMyLevelsMenuDom();
        this.myLevelsMenuOpen = true;
        this.myLevelsMenuEl.hidden = false;
        this._positionMyLevelsMenu();
        document.addEventListener('mousedown', this._myLevelsOutsideHandler);

        await this._refreshMyLevelsMenu();
    }

    _closeMyLevelsMenu() {
        this.myLevelsMenuOpen = false;
        if (this.myLevelsMenuEl) this.myLevelsMenuEl.hidden = true;
        if (this._myLevelsOutsideHandler) {
            document.removeEventListener('mousedown', this._myLevelsOutsideHandler);
        }
    }

    async _refreshMyLevelsMenu() {
        if (!this.myLevelsListEl) return;
        this.myLevelsLoading = true;
        this.myLevelsListEl.innerHTML = '<div class="workshop-my-levels-loading">加载中…</div>';

        try {
            const levels = await WorkshopApi.fetchMyLevels();
            this._renderMyLevelsMenu(levels);
        } catch (err) {
            this.myLevelsListEl.innerHTML = `<div class="workshop-my-levels-error">${this._escapeHtml(err.message || '加载失败')}</div>`;
        } finally {
            this.myLevelsLoading = false;
            if (this.myLevelsMenuOpen) this._positionMyLevelsMenu();
        }
    }

    _renderMyLevelsMenu(levels) {
        if (!this.myLevelsListEl) return;
        this.myLevelsListEl.innerHTML = '';

        if (!levels.length) {
            this.myLevelsListEl.innerHTML = '<div class="workshop-my-levels-empty">暂无发布关卡</div>';
            return;
        }

        levels.forEach(level => {
            const row = document.createElement('div');
            row.className = 'workshop-my-levels-item';

            const title = document.createElement('span');
            title.className = 'workshop-my-levels-title';
            title.textContent = level.title || '未命名关卡';
            title.title = level.title || '未命名关卡';

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'workshop-my-levels-delete';
            delBtn.textContent = '删除';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._deleteMyLevel(level.id, level.title || '未命名关卡', delBtn);
            });

            row.appendChild(title);
            row.appendChild(delBtn);
            this.myLevelsListEl.appendChild(row);
        });
    }

    async _deleteMyLevel(levelId, title, btn) {
        if (!levelId || this.myLevelsDeleting) return;
        if (!confirm(`确定删除关卡「${title}」吗？\n此操作不可恢复。`)) return;

        this.myLevelsDeleting = true;
        if (btn) {
            btn.disabled = true;
            btn.textContent = '删除中…';
        }

        try {
            await WorkshopApi.deleteLevel(levelId);
            this.levels = this.levels.filter(l => l.id !== levelId);
            this._updateInfo();
            this._renderPage();
            await this._refreshMyLevelsMenu();
            this.subtitleText.setText(`已删除「${this._truncate(title, 12)}」`);
        } catch (err) {
            alert(err.message || '删除失败');
            if (btn) {
                btn.disabled = false;
                btn.textContent = '删除';
            }
        } finally {
            this.myLevelsDeleting = false;
        }
    }

    _escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async _onAuthAction() {
        if (this.authLoggingOut) return;

        if (this.authLoggedIn) {
            this.authLoggingOut = true;
            this.authActionText.setText('登出中…');
            try {
                await WorkshopApi.logout();
                this._closeMyLevelsMenu();
                this._updateAuthBar({ loggedIn: false });
            } catch (err) {
                this.subtitleText.setText(`登出失败：${err.message || err}`);
            } finally {
                this.authLoggingOut = false;
            }
            return;
        }

        this._openLoginPanel('/');
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

        const metaY = titleY + 26;
        const metaStr = `${this._truncate(level.authorName || '未知作者', 10)}  ·  ${this._formatDate(level.createdAt)}`;
        const metaText = this._addText(0, metaY, metaStr, {
            font: '11px Microsoft YaHei, Arial',
            color: '#8fbfd6'
        }).setOrigin(0, 0.5);
        container.add(metaText);

        const avatarR = 9;
        const gap = 6;
        const totalW = avatarR * 2 + gap + metaText.width;
        const startX = -Math.round(totalW / 2);
        const avatarSlot = this.add.container(startX + avatarR, metaY);
        container.add(avatarSlot);
        metaText.setPosition(startX + avatarR * 2 + gap, metaY);

        this._renderAvatarInto(
            avatarSlot,
            avatarR,
            level.authorId || '',
            level.authorAvatar || '',
            level.authorName || '?',
            true
        );

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
            this._openLoginPanel('/ExtraTools/关卡编辑器/?mode=player');
            return;
        }
        window.location.href = '/ExtraTools/关卡编辑器/?mode=player';
    }

    // ============ 通用 UI 组件 ============

    /**
     * 在容器内渲染圆形头像槽位：圆形底 + 首字母 + 异步加载真实头像覆盖
     * 调用前确保 slot 是空的（内部会 removeAll）
     */
    _renderAvatarInto(slot, radius, userId, url, name, loggedIn) {
        slot.removeAll(true);

        const baseColor = loggedIn ? 0x0d6b96 : 0x0c2a4a;
        const strokeAlpha = loggedIn ? 1 : 0.85;

        const gfx = this.add.graphics();
        gfx.fillStyle(baseColor, 1);
        gfx.fillCircle(0, 0, radius);
        gfx.lineStyle(1.5, 0x5feaff, strokeAlpha);
        gfx.strokeCircle(0, 0, radius);
        slot.add(gfx);

        const fallbackChar = ((name || '?').trim().charAt(0) || '?').toUpperCase();
        const fontSize = Math.max(8, Math.round(radius * 1.1));
        const letter = this._addText(0, 0, fallbackChar, {
            font: `bold ${fontSize}px Microsoft YaHei, Arial`,
            color: loggedIn ? '#ffffff' : '#5feaff'
        }).setOrigin(0.5);
        slot.add(letter);

        if (loggedIn && url) {
            AvatarCache.ensure(this, userId, url).then(key => {
                if (!slot.scene) return;
                if (!key || !this.textures.exists(key)) return;
                const img = this.add.image(0, 0, key);
                img.setDisplaySize(radius * 2, radius * 2);
                img.setAlpha(0);
                slot.add(img);
                letter.setVisible(false);
                this.tweens.add({ targets: img, alpha: 1, duration: 220, ease: 'Sine.easeOut' });
            }).catch(() => {});
        }
    }

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
