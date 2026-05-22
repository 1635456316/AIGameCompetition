class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        // 显示加载进度条
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50);

        const loadingText = this.add.text(width / 2, height / 2 - 50, '加载中...', {
            font: '20px Arial',
            fill: '#ffffff'
        }).setOrigin(0.5);

        this.load.on('progress', (value) => {
            progressBar.clear();
            progressBar.fillStyle(0x00ff00, 1);
            progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30);
        });

        this.load.on('complete', () => {
            progressBar.destroy();
            progressBox.destroy();
            loadingText.destroy();
        });

        this.load.on('loaderror', (file) => {
            console.warn('[BootScene] 资源加载失败:', file && file.key, file && file.src);
        });

        // 音频资源
        this.load.audio('bgm_menu', 'assets/audio/MainMenu.mp3');

        // 视频资源（PV / 主菜单待机）
        // 主菜单待机：丢弃音轨，便于自动循环播放。后续 BGM 单独接入。
        this.load.video('video_menu_idle', 'assets/video/主界面待机.mp4', true);
        // PV：保留音轨
        this.load.video('video_intro_pv',  'assets/video/PV-开始.mp4', false);
        this.load.video('video_ending_pv', 'assets/video/PV-结束.mp4', false);
    }

    create() {
        TextureFactory.bakeAll(this);
        this.scene.start('MenuScene');
    }
}
