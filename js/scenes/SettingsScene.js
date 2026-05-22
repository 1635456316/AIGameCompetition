class SettingsScene extends Phaser.Scene {
    constructor() {
        super('SettingsScene');
    }

    create() {
        this.volume = SaveSystem.getVolume();
        this.cameras.main.setBackgroundColor('#05070d');

        const w = GAME_WIDTH;
        const h = GAME_HEIGHT;

        this.add.rectangle(w / 2, h / 2, w, h, 0x05070d, 1);
        this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.28);

        const scan = this.add.graphics().setDepth(1000);
        scan.fillStyle(0x000000, 0.14);
        for (let y = 0; y < h; y += 4) scan.fillRect(0, y, w, 2);

        this.add.text(w / 2, 88, '系统设置', {
            font: 'bold 52px Arial',
            color: PaletteHex.warning,
            stroke: '#000000',
            strokeThickness: 8
        }).setOrigin(0.5);

        this.add.text(w / 2, 136, 'SYSTEM CONFIGURATION', {
            font: 'bold 18px Arial',
            color: PaletteHex.hero,
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setAlpha(0.92);

        this.add.rectangle(w / 2, 354, 760, 310, 0x080d16, 0.92)
            .setStrokeStyle(3, Palette.warning, 0.85);
        this.add.rectangle(w / 2, 354, 728, 278, 0x020407, 0.48)
            .setStrokeStyle(1, Palette.hero, 0.45);

        this.add.text(320, 266, '主音量', {
            font: 'bold 30px Arial',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 5
        }).setOrigin(0, 0.5);

        this.volumeText = this.add.text(920, 266, '', {
            font: 'bold 30px Arial',
            color: PaletteHex.warning,
            stroke: '#000000',
            strokeThickness: 5
        }).setOrigin(1, 0.5);

        this._createVolumeSlider(320, 342, 640);
        this._createStepButton(348, 442, '-10%', -0.1);
        this._createStepButton(520, 442, '+10%', 0.1);
        this._createStepButton(692, 442, '静音', 'mute');
        this._createStepButton(864, 442, '默认', 'default');

        this.add.text(w / 2, h - 92, '← / →：调节音量    M：静音/恢复    ESC：返回主菜单', {
            font: 'bold 17px Arial',
            color: '#cbd7e6',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        this._startPreviewBGM();
        this._setVolume(this.volume, false);

        this.input.keyboard.on('keydown-LEFT', () => this._setVolume(this.volume - 0.05));
        this.input.keyboard.on('keydown-RIGHT', () => this._setVolume(this.volume + 0.05));
        this.input.keyboard.on('keydown-M', () => {
            this._setVolume(this.volume > 0 ? 0 : 0.8);
        });
        this.input.keyboard.once('keydown-ESC', () => this.scene.start('MenuScene'));
    }

    _createVolumeSlider(x, y, width) {
        this.sliderX = x;
        this.sliderY = y;
        this.sliderWidth = width;

        this.add.rectangle(x + width / 2, y, width, 18, 0x121827, 1)
            .setStrokeStyle(2, Palette.hero, 0.72);
        this.sliderFill = this.add.rectangle(x, y, 1, 18, Palette.warning, 0.95)
            .setOrigin(0, 0.5);
        this.sliderKnob = this.add.rectangle(x, y, 24, 54, Palette.hero, 0.96)
            .setStrokeStyle(2, Palette.warning, 0.9);
        this.volumeBlocks = this.add.text(x, y + 52, '', {
            font: 'bold 18px Arial',
            color: PaletteHex.hero,
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0, 0.5);

        const hitZone = this.add.zone(x + width / 2, y, width + 40, 70)
            .setInteractive({ useHandCursor: true, draggable: true });
        const setFromPointer = (pointer) => {
            const localX = Phaser.Math.Clamp(pointer.x - x, 0, width);
            this._setVolume(localX / width);
        };

        hitZone.on('pointerdown', setFromPointer);
        hitZone.on('drag', (pointer) => setFromPointer(pointer));
    }

    _createStepButton(x, y, label, action) {
        const button = this.add.container(x, y);
        const bg = this.add.rectangle(0, 0, 130, 46, 0x070b12, 0.9)
            .setStrokeStyle(2, Palette.warning, 0.75);
        const text = this.add.text(0, 0, label, {
            font: 'bold 20px Arial',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);
        button.add([bg, text]);

        const hitZone = this.add.zone(x, y, 130, 46).setInteractive({ useHandCursor: true });
        hitZone.on('pointerover', () => {
            bg.setFillStyle(0x12243a, 1);
            text.setColor(PaletteHex.warning);
        });
        hitZone.on('pointerout', () => {
            bg.setFillStyle(0x070b12, 0.9);
            text.setColor('#ffffff');
        });
        hitZone.on('pointerdown', () => {
            if (action === 'mute') {
                this._setVolume(0);
                return;
            }
            if (action === 'default') {
                this._setVolume(0.8);
                return;
            }
            this._setVolume(this.volume + action);
        });
    }

    _setVolume(value, save = true) {
        this.volume = Phaser.Math.Clamp(value, 0, 1);
        if (save) SaveSystem.setVolume(this.volume);

        if (this.volumeText) {
            this.volumeText.setText(`${Math.round(this.volume * 100)}%`);
        }
        if (this.sliderFill && this.sliderKnob) {
            const fillWidth = this.sliderWidth * this.volume;
            this.sliderFill.width = Math.max(1, fillWidth);
            this.sliderKnob.x = this.sliderX + fillWidth;
        }
        if (this.volumeBlocks) {
            const blocks = Math.round(this.volume * 10);
            this.volumeBlocks.setText('■'.repeat(blocks) + '□'.repeat(10 - blocks));
        }

        const bgm = this.sound.get('bgm_menu');
        if (bgm) bgm.setVolume(this.volume);
    }

    _startPreviewBGM() {
        if (!this.cache.audio.exists('bgm_menu')) return;

        let bgm = this.sound.get('bgm_menu');
        if (!bgm) {
            bgm = this.sound.add('bgm_menu', { loop: true, volume: this.volume });
        }

        const ctx = this.sound && this.sound.context;
        const tryPlay = () => {
            try {
                if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
                    ctx.resume();
                }
            } catch (e) {}
            if (!bgm.isPlaying) {
                try { bgm.play(); } catch (e) {}
            }
        };

        tryPlay();
        if (this.sound.locked) {
            this.sound.once(Phaser.Sound.Events.UNLOCKED, tryPlay);
        }
    }
}
