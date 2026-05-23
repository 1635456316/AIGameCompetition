class HUD {
    constructor(scene, player) {
        this.scene = scene;
        this.player = player;

        const container = scene.add.container(0, 0).setScrollFactor(0).setDepth(1000);

        // 血条
        this.hpBg = scene.add.rectangle(20, 20, 280, 18, 0x000000, 0.6).setOrigin(0, 0);
        this.hpFill = scene.add.rectangle(22, 22, 276, 14, Palette.danger).setOrigin(0, 0);
        this.hpLabel = scene.add.text(24, 22, 'HP', { font: 'bold 12px Arial', color: '#fff' });

        // 能量
        this.enBg = scene.add.rectangle(20, 46, 280, 14, 0x000000, 0.6).setOrigin(0, 0);
        this.enFill = scene.add.rectangle(22, 48, 276, 10, Palette.energy).setOrigin(0, 0);
        this.enLabel = scene.add.text(24, 46, 'EN', { font: 'bold 10px Arial', color: '#fff' });

        // 分数 & 连击
        this.scoreText = scene.add.text(GAME_WIDTH - 20, 20, 'SCORE 0', {
            font: 'bold 20px Arial', color: PaletteHex.warning
        }).setOrigin(1, 0);
        this.comboText = scene.add.text(GAME_WIDTH - 20, 46, '', {
            font: 'bold 28px Arial', color: PaletteHex.hero
        }).setOrigin(1, 0);

        // 暂停按钮（鼠标）
        const pauseBtnW = 96;
        const pauseBtnH = 32;
        const pauseBtnX = GAME_WIDTH - 20 - pauseBtnW / 2;
        const pauseBtnY = 90;
        this.pauseBtnBg = scene.add.rectangle(pauseBtnX, pauseBtnY, pauseBtnW, pauseBtnH, 0x0a1020, 0.85)
            .setStrokeStyle(2, Palette.warning, 0.85)
            .setInteractive({ useHandCursor: true });
        this.pauseBtnText = scene.add.text(pauseBtnX, pauseBtnY, '‖ 暂停 (ESC)', {
            font: 'bold 14px Arial', color: '#ffffff',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5);
        this.pauseBtnBg.on('pointerover', () => {
            this.pauseBtnBg.setFillStyle(0x12243a, 1);
            this.pauseBtnText.setColor(PaletteHex.warning);
        });
        this.pauseBtnBg.on('pointerout', () => {
            this.pauseBtnBg.setFillStyle(0x0a1020, 0.85);
            this.pauseBtnText.setColor('#ffffff');
        });
        this.pauseBtnBg.on('pointerdown', () => {
            if (scene.gameOver) return;
            if (scene.pauseMenu) scene.pauseMenu.show();
        });

        container.add([this.hpBg, this.hpFill, this.hpLabel, this.enBg, this.enFill, this.enLabel,
            this.scoreText, this.comboText, this.pauseBtnBg, this.pauseBtnText]);

        [this.hpBg, this.hpFill, this.hpLabel, this.enBg, this.enFill, this.enLabel,
            this.scoreText, this.comboText, this.pauseBtnBg, this.pauseBtnText]
            .forEach(o => o.setScrollFactor(0).setDepth(1000));

        this.combo = 0;
        this.maxCombo = 0;
        this.comboExpireAt = 0;
        this.score = 0;
        this._lastComboAlive = false;
    }

    update(time) {
        const hpRatio = Math.max(0, this.player.hp / PlayerConfig.maxHp);
        const enRatio = Math.max(0, this.player.energy / PlayerConfig.maxEnergy);
        this.hpFill.width = 276 * hpRatio;
        this.enFill.width = 276 * enRatio;

        if (this.combo > 0 && time > this.comboExpireAt) {
            this._breakCombo();
        }
        this._lastComboAlive = this.combo > 0;
    }

    addCombo(time) {
        this.combo += 1;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        this.comboExpireAt = time + 1800;

        this.comboText.setText(this.combo + ' HIT');
        this.comboText.setColor(this._comboColor());

        this.scene.tweens.add({
            targets: this.comboText,
            scale: { from: 1.3, to: 1 },
            duration: 140,
            ease: 'Quad.easeOut'
        });

        if (this.combo === 10 || this.combo === 20 || this.combo === 30) {
            Effects.bigText(this.scene, this.combo + ' HIT!!', this._comboColor());
            Effects.shake(this.scene, 80, 0.006);
        }
    }

    getEnergyMultiplier() {
        return 1 + Math.min(this.combo, 30) * 0.02;
    }

    addScore(v) {
        this.score += v;
        this.scoreText.setText('SCORE ' + this.score);
    }

    _comboColor() {
        if (this.combo >= 20) return PaletteHex.danger;
        if (this.combo >= 10) return '#ff8800';
        if (this.combo >= 3) return PaletteHex.warning;
        return PaletteHex.hero;
    }

    _breakCombo() {
        if (this.combo >= 3) {
            const breakText = this.scene.add.text(
                GAME_WIDTH - 20, 80, 'BREAK', {
                    font: 'bold 22px Arial',
                    color: PaletteHex.danger,
                    stroke: '#000', strokeThickness: 4
                }
            ).setOrigin(1, 0).setScrollFactor(0).setDepth(1000);
            this.scene.tweens.add({
                targets: breakText,
                alpha: 0,
                y: 70,
                duration: 600,
                onComplete: () => breakText.destroy()
            });
        }
        this.combo = 0;
        this.comboText.setText('');
    }
}
