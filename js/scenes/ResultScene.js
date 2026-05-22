class ResultScene extends Phaser.Scene {
    constructor() {
        super('ResultScene');
    }

    init(data) {
        this.levelId = data.levelId || 1;
        this.score = data.score || 0;
        this.maxCombo = data.maxCombo || 0;
        this.timeSec = data.timeSec || 0;
        this.damageTaken = data.damageTaken || 0;
        this.isFinal = data.isFinal || false;
    }

    create() {
        const W = GAME_WIDTH;
        const H = GAME_HEIGHT;

        this.add.image(W / 2, H / 2, 'bg_far').setDisplaySize(W, H);
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

        if (this.isFinal) {
            buttons.push({ label: '观看结尾', action: () => this._playEnding() });
        } else {
            buttons.push({ label: '下一关', action: () => this.scene.start('GameScene', { levelId: this.levelId + 1 }) });
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

    _playEnding() {
        this.scene.start('PVScene', {
            videoKey: 'video_ending_pv',
            videoUrl: 'assets/video/PV-结束.mp4',
            nextScene: 'MenuScene',
            pvId: 'ending',
            title: '结尾 PV'
        });
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
    }
}
