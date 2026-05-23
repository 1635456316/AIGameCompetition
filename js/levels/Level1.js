// 当前版本一共 2 关（对齐策划案 V1.1）：
// - 第 1 关：磁暴军工厂（钢甲三角龙）—— 教学关，地面 / 平台周期性电磁脉冲。
// - 第 2 关（最后一关）：废弃城区（机械暴龙）—— 最终关。
//
// 关卡 PV 系统：
// - startVideoUrl：进入关卡时播放的开场 PV（第一次进入自动播放，之后可在选关界面回看）。
// - endVideoUrl  ：击败 Boss 后 1 秒自动播放的终结动画（首次通关自动播放，之后可在选关界面回看）。
// - 字段为空 (null/undefined) 时跳过对应 PV，直接进入下一步。
//
// 关卡音乐：
// - normalBgmUrl：关卡普通阶段循环播放的 BGM。
// - bossBgmUrl  ：触发 Boss 后切换播放的 BGM。
// - 字段为空时跳过对应音乐；Boss 曲为空则继续保留普通曲。
//
// 结算画面背景：
// - resultBgUrl：通关结算画面（ResultScene）使用的背景图路径。
// - 字段为空时 fallback 到程序生成的 bg_far 远景纹理（黑色风格）。
// - BootScene 会自动以 `result_bg_${id}` 为 key 预加载所有非空配置。
const LevelConfigs = [
    {
        id: 1,
        title: '第 1 关 · 磁 暴 军 工 厂',
        subtitle: '教学关：电磁机关与钢甲三角龙',
        width: 3400,
        playerStart: { x: 160, yOffset: 120 },
        bossTriggerOffset: 620,
        boss: { type: 'steelTriceratops', xOffset: 240, yOffset: 80 },
        startVideoUrl: 'assets/video/第一关Boss出场.mp4',
        endVideoUrl: 'assets/video/第一关Boss处决.mp4',
        normalBgmUrl: 'assets/audio/第一关普通曲.mp3',
        bossBgmUrl: 'assets/audio/第一关Boss曲.mp3',
        // 结算背景暂用第 1 关的地图设计稿，画面与关卡氛围保持一致。
        resultBgUrl: 'assets/UI/第一关Boss倒地.jpg',
        platforms: [
            [360, 520, 2], [640, 440, 3], [1040, 500, 2],
            [1320, 380, 3], [1740, 480, 2], [2060, 400, 3],
            [2460, 520, 2], [2780, 430, 3], [3120, 520, 2]
        ],
        spawns: [
            { type: 'ranged', x: 540 }, { type: 'melee', x: 840 },
            { type: 'ranged', x: 1180 }, { type: 'ranged', x: 1540 },
            { type: 'melee', x: 1900 }, { type: 'melee', x: 2260 },
            { type: 'ranged', x: 2620 }
        ],
        hazards: [
            { type: 'electric', x: 800, y: 600, w: 140, h: 60, period: 2400, activeDuration: 1000 },
            { type: 'electric', x: 1500, y: 600, w: 160, h: 60, period: 2000, activeDuration: 900 },
            { type: 'electric', x: 2200, y: 440, w: 120, h: 60, period: 2600, activeDuration: 1100 }
        ]
    },
    {
        id: 2,
        title: '第 2 关 · 废 弃 城 区',
        subtitle: '最终关：机械暴龙的钢铁咆哮',
        width: 3200,
        playerStart: { x: 160, yOffset: 120 },
        bossTriggerOffset: 600,
        boss: { type: 'mechanicalDino', xOffset: 220, yOffset: 80 },
        // 当前可用素材：暂用 PV-结束作为最终关 Boss 终结动画；开场 PV 等专属素材到位后再填。
        startVideoUrl: null,
        endVideoUrl: 'assets/video/PV-结束.mp4',
        normalBgmUrl: 'assets/audio/第一关普通曲.mp3',
        bossBgmUrl: 'assets/audio/第一关Boss曲.mp3',
        // 第 2 关结算背景暂为空 → fallback 到程序生成的 bg_far 远景。
        // 后续放入专属图后写到这里即可（推荐尺寸 1280x720 或更大）。
        resultBgUrl: null,
        platforms: [
            [380, 540, 3], [720, 460, 2], [1040, 540, 2],
            [1340, 420, 3], [1700, 500, 2], [2000, 380, 2],
            [2280, 480, 3], [2620, 420, 2], [2880, 540, 2]
        ],
        spawns: [
            { type: 'melee',  x: 600 },
            { type: 'ranged', x: 900 },
            { type: 'melee',  x: 1200 },
            { type: 'ranged', x: 1500 },
            { type: 'melee',  x: 1850 },
            { type: 'melee',  x: 2100 },
            { type: 'ranged', x: 2350 }
        ],
        hazards: []
    }
];
