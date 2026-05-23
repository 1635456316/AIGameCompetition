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
        // 每关 BGM：遍历关卡配置，自动用 `bgm_level_${id}_normal/boss` 作 key 预加载。
        if (typeof LevelConfigs !== 'undefined') {
            LevelConfigs.forEach((level) => {
                if (!level) return;
                if (level.normalBgmUrl) {
                    this.load.audio(`bgm_level_${level.id}_normal`, level.normalBgmUrl);
                }
                if (level.bossBgmUrl) {
                    this.load.audio(`bgm_level_${level.id}_boss`, level.bossBgmUrl);
                }
            });
        }

        // UI 图片资源
        this.load.image('ui_level_select_bg', 'assets/UI/关卡选择背景.png');
        this.load.image('bg_level1', 'assets/UI/第一关背景图.png');

        // 每关结算背景：遍历关卡配置，自动用 `result_bg_${id}` 作 key 预加载。
        // 关卡配置的 resultBgUrl 为空时跳过，ResultScene 会回退到程序生成的 bg_far。
        if (typeof LevelConfigs !== 'undefined') {
            LevelConfigs.forEach((level) => {
                if (level && level.resultBgUrl) {
                    this.load.image(`result_bg_${level.id}`, level.resultBgUrl);
                }
            });
        }
        this.load.image('ui_logo', 'assets/UI/Logo.png');
        this.load.image('ui_btn_start',    'assets/UI/StartBtn.png');
        this.load.image('ui_btn_continue', 'assets/UI/ContinueBtn.png');
        this.load.image('ui_btn_setting',  'assets/UI/SettingBtn.png');
        this.load.image('ui_btn_exit',     'assets/UI/ExitBtn.png');
        this.load.image('ui_deco_battery', 'assets/UI/Deco1.png');
        this.load.image('ui_deco_warning', 'assets/UI/Deco2.png');
        this.load.image('ui_deco_radar',   'assets/UI/Deco3.png');
        this.load.image('ui_deco_paw',     'assets/UI/Deco4.png');

        // 视频资源（主菜单待机）
        // 主菜单待机：丢弃音轨，便于自动循环播放。后续 BGM 单独接入。
        this.load.video('video_menu_idle', 'assets/video/主界面待机.mp4', true);
        // 关卡 PV（开始 / 终结）不在这里预加载：PVScene 使用 DOM <video> 直接按 URL 播放，
        // 视频名称写在 LevelConfigs[*].startVideoUrl / endVideoUrl 里，
        // 由 LevelSelectScene / GameScene 在合适时机触发。
    }

    create() {
        // 窗口失焦时不要暂停声音（默认 true 会把 BGM 一并 pauseAll）
        this.sound.pauseOnBlur = false;

        TextureFactory.bakeAll(this);
        this.scene.start('MenuScene');
    }
}
