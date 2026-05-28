class PauseMenu {
    constructor(scene) {
        this.scene = scene;
        this.visible = false;
        this.selectedIndex = 0;
        this.uiDepth = 2000;
        this._ui = [];

        const panelX = GAME_WIDTH / 2;
        const panelY = GAME_HEIGHT / 2;

        this.overlay = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.65)
            .setScrollFactor(0).setDepth(this.uiDepth).setVisible(false);
        this._ui.push(this.overlay);

        const panel = scene.add.rectangle(panelX, panelY, 380, 320, 0x0a1020, 0.95)
            .setStrokeStyle(3, Palette.warning, 0.9)
            .setScrollFactor(0).setDepth(this.uiDepth + 1).setVisible(false);
        this._ui.push(panel);

        const title = scene.add.text(panelX, panelY - 120, this._buildTitle(), {
            font: 'bold 40px Arial', color: PaletteHex.warning,
            stroke: '#000', strokeThickness: 6
        }).setOrigin(0.5).setScrollFactor(0).setDepth(this.uiDepth + 2).setVisible(false);
        this._ui.push(title);

        this.items = this._buildItems();

        this.buttons = [];
        this.items.forEach((item, i) => {
            const y = panelY - 40 + i * 60;
            const bg = scene.add.rectangle(panelX, y, 300, 46, 0x121d30, 0.9)
                .setStrokeStyle(2, Palette.hero, 0.5)
                .setScrollFactor(0)
                .setDepth(this.uiDepth + 3)
                .setInteractive({ useHandCursor: true })
                .setVisible(false);
            const text = scene.add.text(panelX, y, item.label, {
                font: 'bold 24px Arial', color: '#ffffff',
                stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5).setScrollFactor(0).setDepth(this.uiDepth + 4).setVisible(false);

            bg.on('pointerover', () => {
                this.selectedIndex = i;
                this._updateSelection();
            });
            bg.on('pointerdown', () => item.action());

            this.buttons.push({ bg, text });
            this._ui.push(bg, text);
        });

        scene.input.keyboard.on('keydown-UP', () => this._navigate(-1));
        scene.input.keyboard.on('keydown-DOWN', () => this._navigate(1));
        scene.input.keyboard.on('keydown-W', () => { if (this.visible) this._navigate(-1); });
        scene.input.keyboard.on('keydown-S', () => { if (this.visible) this._navigate(1); });
        scene.input.keyboard.on('keydown-ENTER', () => { if (this.visible) this.items[this.selectedIndex].action(); });
    }

    _buildTitle() {
        const mode = this.scene.mode || 'campaign';
        if (mode === 'editorTest') return '试 玩 暂 停';
        return '暂   停';
    }

    _buildItems() {
        const scene = this.scene;
        const mode = scene.mode || 'campaign';

        if (mode === 'editorTest') {
            return [
                { label: '继续试玩', action: () => this.hide() },
                { label: '重新开始', action: () => { this.hide(); scene.scene.restart(); } },
                { label: '返回关卡编辑器', action: () => { window.location.href = '/ExtraTools/关卡编辑器/?mode=player'; } }
            ];
        }

        if (mode === 'workshop') {
            return [
                { label: '继续游戏', action: () => this.hide() },
                { label: '重新开始', action: () => { this.hide(); scene.scene.restart(); } },
                { label: '返回创意工坊', action: () => { this.hide(); scene.scene.start('WorkshopScene'); } }
            ];
        }

        return [
            { label: '继续游戏', action: () => this.hide() },
            { label: '重新开始', action: () => { this.hide(); scene.scene.restart(); } },
            { label: '返回主菜单', action: () => { this.hide(); scene.scene.start('MenuScene'); } }
        ];
    }

    show() {
        if (this.visible) return;
        this.visible = true;
        this.scene.paused = true;
        this.scene.physics.world.pause();
        this.scene.tweens.pauseAll();
        this._ui.forEach(o => o.setVisible(true));
        this.selectedIndex = 0;
        this._updateSelection();
    }

    hide() {
        if (!this.visible) return;
        this.visible = false;
        this.scene.paused = false;
        this.scene.physics.world.resume();
        this.scene.tweens.resumeAll();
        this._ui.forEach(o => o.setVisible(false));
    }

    _navigate(dir) {
        if (!this.visible) return;
        this.selectedIndex = (this.selectedIndex + dir + this.items.length) % this.items.length;
        this._updateSelection();
    }

    _updateSelection() {
        this.buttons.forEach((btn, i) => {
            if (i === this.selectedIndex) {
                btn.bg.setStrokeStyle(3, Palette.warning, 1);
                btn.bg.setFillStyle(0x1a2a44, 1);
                btn.text.setColor(PaletteHex.warning);
            } else {
                btn.bg.setStrokeStyle(2, Palette.hero, 0.5);
                btn.bg.setFillStyle(0x121d30, 0.9);
                btn.text.setColor('#ffffff');
            }
        });
    }
}
