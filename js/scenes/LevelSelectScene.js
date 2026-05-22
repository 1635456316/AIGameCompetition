class LevelSelectScene extends Phaser.Scene {
    constructor() {
        super('LevelSelectScene');
    }

    create() {
        const w = GAME_WIDTH;
        const h = GAME_HEIGHT;
        const save = SaveSystem.load();
        const unlocked = save.unlockedLevel || 1;

        this.add.image(w / 2, h / 2, 'bg_far').setDisplaySize(w, h);
        this.add.image(w / 2, h / 2, 'bg_mid').setDisplaySize(w, h).setAlpha(0.9);
        this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.45);

        const scan = this.add.graphics().setDepth(1000);
        scan.fillStyle(0x000000, 0.16);
        for (let y = 0; y < h; y += 4) scan.fillRect(0, y, w, 2);

        this.add.text(w / 2, 70, '城市地图 · 关卡选择', {
            font: 'bold 48px Arial',
            color: PaletteHex.warning,
            stroke: '#000',
            strokeThickness: 8
        }).setOrigin(0.5);

        this.add.text(w / 2, 118, '通关后自动解锁下一关。本版本关卡机制为占位变体，后续可继续填充。', {
            font: '16px Arial', color: '#dddddd'
        }).setOrigin(0.5);

        const startX = 180;
        const gap = 225;
        LevelConfigs.forEach((level, i) => {
            const x = startX + i * gap;
            const y = 330 + (i % 2) * 70;
            const isUnlocked = level.id <= unlocked;
            const completed = save.completedLevels.includes(level.id);

            const color = isUnlocked ? 0x121827 : 0x101010;
            const stroke = completed ? Palette.energy : (isUnlocked ? Palette.warning : 0x555555);
            const card = this.add.rectangle(x, y, 190, 150, color, 0.92)
                .setStrokeStyle(3, stroke)
                .setInteractive({ useHandCursor: isUnlocked });

            this.add.text(x, y - 48, `第 ${level.id} 关`, {
                font: 'bold 24px Arial',
                color: isUnlocked ? PaletteHex.warning : '#777777'
            }).setOrigin(0.5);

            this.add.text(x, y - 12, level.title.replace(/^第 \d 关 · /, ''), {
                font: 'bold 20px Arial',
                color: isUnlocked ? '#ffffff' : '#666666',
                align: 'center'
            }).setOrigin(0.5);

            const bossName = BossConfigs[level.boss.type]?.name || '未知 Boss';
            this.add.text(x, y + 28, bossName, {
                font: '14px Arial',
                color: isUnlocked ? PaletteHex.hero : '#555555',
                align: 'center'
            }).setOrigin(0.5);

            this.add.text(x, y + 56, completed ? 'CLEARED' : (isUnlocked ? 'READY' : 'LOCKED'), {
                font: 'bold 14px Arial',
                color: completed ? PaletteHex.hero : (isUnlocked ? PaletteHex.warning : '#666666')
            }).setOrigin(0.5);

            if (isUnlocked) {
                card.on('pointerover', () => card.setScale(1.06));
                card.on('pointerout', () => card.setScale(1));
                card.on('pointerdown', () => this.scene.start('GameScene', { levelId: level.id }));
            }
        });

        this.add.text(w / 2, h - 70, 'ESC：返回主菜单    R：重置存档', {
            font: '16px Arial', color: '#bbbbbb'
        }).setOrigin(0.5);

        this.input.keyboard.on('keydown-ESC', () => this.scene.start('MenuScene'));
        this.input.keyboard.on('keydown-R', () => {
            SaveSystem.reset();
            this.scene.restart();
        });
    }
}
