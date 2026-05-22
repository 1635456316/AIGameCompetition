class PauseMenu {
    constructor(scene) {
        this.scene = scene;
        this.visible = false;
        this.selectedIndex = 0;

        this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(2000).setVisible(false);

        this.overlay = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.65);
        this.container.add(this.overlay);

        const panelW = 380;
        const panelH = 320;
        const panelX = GAME_WIDTH / 2;
        const panelY = GAME_HEIGHT / 2;
        const panel = scene.add.rectangle(panelX, panelY, panelW, panelH, 0x0a1020, 0.95)
            .setStrokeStyle(3, Palette.warning, 0.9);
        this.container.add(panel);

        const title = scene.add.text(panelX, panelY - 120, '暂   停', {
            font: 'bold 40px Arial', color: PaletteHex.warning,
            stroke: '#000', strokeThickness: 6
        }).setOrigin(0.5);
        this.container.add(title);

        this.items = [
            { label: '继续游戏', action: () => this.hide() },
            { label: '重新开始', action: () => { this.hide(); scene.scene.restart(); } },
            { label: '返回主菜单', action: () => { this.hide(); scene.scene.start('MenuScene'); } }
        ];

        this.buttons = [];
        this.items.forEach((item, i) => {
            const y = panelY - 40 + i * 60;
            const bg = scene.add.rectangle(panelX, y, 300, 46, 0x121d30, 0.9)
                .setStrokeStyle(2, Palette.hero, 0.5)
                .setInteractive({ useHandCursor: true });
            const text = scene.add.text(panelX, y, item.label, {
                font: 'bold 24px Arial', color: '#ffffff',
                stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5);

            bg.on('pointerover', () => {
                this.selectedIndex = i;
                this._updateSelection();
            });
            bg.on('pointerdown', item.action);

            this.container.add([bg, text]);
            this.buttons.push({ bg, text });
        });

        this._navUp = scene.input.keyboard.addKey('UP');
        this._navDown = scene.input.keyboard.addKey('DOWN');
        this._navW = scene.input.keyboard.addKey('W');
        this._navS = scene.input.keyboard.addKey('S');
        this._enter = scene.input.keyboard.addKey('ENTER');

        scene.input.keyboard.on('keydown-UP', () => this._navigate(-1));
        scene.input.keyboard.on('keydown-DOWN', () => this._navigate(1));
        scene.input.keyboard.on('keydown-W', () => { if (this.visible) this._navigate(-1); });
        scene.input.keyboard.on('keydown-S', () => { if (this.visible) this._navigate(1); });
        scene.input.keyboard.on('keydown-ENTER', () => { if (this.visible) this.items[this.selectedIndex].action(); });
    }

    show() {
        if (this.visible) return;
        this.visible = true;
        this.scene.paused = true;
        this.scene.physics.world.pause();
        this.scene.tweens.pauseAll();
        this.container.setVisible(true);
        this.selectedIndex = 0;
        this._updateSelection();
    }

    hide() {
        if (!this.visible) return;
        this.visible = false;
        this.scene.paused = false;
        this.scene.physics.world.resume();
        this.scene.tweens.resumeAll();
        this.container.setVisible(false);
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
