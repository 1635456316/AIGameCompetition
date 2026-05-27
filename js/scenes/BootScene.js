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
            if (file && file.key === 'fx_shockwave') {
                console.warn('[BootScene] 冲击波加载失败，第三段普攻特效将不可用');
            }
            if (file && file.key === 'sfx_punch') {
                console.warn('[BootScene] 挥拳音效加载失败，请确认 assets/audio/punch.mp3 存在');
            }
            if (file && file.key === 'sfx_dash') {
                console.warn('[BootScene] 冲刺音效加载失败，请确认 assets/audio/dash.wav 存在');
            }
            if (file && file.key === 'sfx_charge') {
                console.warn('[BootScene] 蓄力音效加载失败，请确认 assets/audio/charge.mp3 存在');
            }
        });

        // 音频资源
        this.load.audio('bgm_menu', 'assets/audio/MainMenu.mp3');
        // 使用英文文件名，避免部分本地服务器对中文路径加载失败
        this.load.audio('sfx_punch', 'assets/audio/punch.mp3', { instances: 4 });
        this.load.audio('sfx_dash', 'assets/audio/dash.wav', { instances: 3 });
        this.load.audio('sfx_charge', 'assets/audio/charge.mp3');
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

        // 关卡背景 / 结算背景：遍历关卡配置预加载，key 为 level_bg_${id} / result_bg_${id}
        if (typeof LevelConfigs !== 'undefined') {
            LevelConfigs.forEach((level) => {
                if (!level) return;
                if (level.bgUrl) {
                    this.load.image(`level_bg_${level.id}`, level.bgUrl);
                }
                if (level.resultBgUrl) {
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
        this.load.image('ui_ultimate_slice', 'assets/UI/大招切片.png');

        // 主角序列帧（视频生成序列帧工具导出）
        this.load.image('tex_hero_idle', 'assets/character/Hero/主角-Idle.png');
        this.load.image('tex_hero_run', 'assets/character/Hero/主角-奔跑.png');
        this.load.image('tex_hero_attack', 'assets/character/Hero/主角-普通攻击.png');
        this.load.image('tex_hero_dash', 'assets/character/Hero/主角-冲刺.png');
        this.load.image('tex_hero_sword_charge', 'assets/character/Hero/主角-持剑蓄力.png');
        this.load.image('tex_hero_sword_slash', 'assets/character/Hero/主角-持剑劈砍.png');
        this.load.image('tex_hero_ultimate', 'assets/character/Hero/主角-大招动作.png');
        this.load.json('hero_idle_meta', 'assets/character/Hero/主角-Idle.json');
        this.load.json('hero_run_meta', 'assets/character/Hero/主角-奔跑.json');
        this.load.json('hero_attack_meta', 'assets/character/Hero/主角-普通攻击.json');
        this.load.json('hero_dash_meta', 'assets/character/Hero/主角-冲刺.json');
        this.load.json('hero_sword_charge_meta', 'assets/character/Hero/主角-持剑蓄力.json');
        this.load.json('hero_sword_slash_meta', 'assets/character/Hero/主角-持剑劈砍.json');

        // 第 1 关 Boss 待机贴图
        this.load.image('tex_boss1_idle', 'assets/character/Level1Boss/第一关Boss.png');
        this.load.json('boss1_idle_meta', 'assets/character/Level1Boss/第一关Boss.json');

        // 最终关 Boss 待机贴图
        this.load.image('tex_boss_final_idle', 'assets/character/LevelFinalBoss/最终关Boss.png');
        this.load.json('boss_final_idle_meta', 'assets/character/LevelFinalBoss/最终关Boss.json');

        this.load.image('fx_punch_wind', 'assets/effects/拳风.png');
        this.load.image('fx_sword_qi', 'assets/effects/sword_qi.png');
        // 使用英文文件名，避免部分本地服务器对中文路径加载失败
        this.load.image('fx_shockwave', 'assets/effects/shockwave.png');

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

        HeroAnimLoader.registerAll(this);
        BossAnimLoader.registerAll(this);
        TextureFactory.bakeAll(this);
        this.scene.start('MenuScene');
    }
}
