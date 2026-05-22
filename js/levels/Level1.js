const LevelConfigs = [
    {
        id: 1,
        title: '第 1 关 · 废 弃 城 区',
        subtitle: '教学关：移动、跳跃、攻击',
        width: 3200,
        playerStart: { x: 160, yOffset: 120 },
        bossTriggerOffset: 600,
        boss: { type: 'mechanicalDino', xOffset: 220, yOffset: 80 },
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
    },
    {
        id: 2,
        title: '第 2 关 · 地 下 实 验 室',
        subtitle: '电流机关与章鱼博士',
        width: 3400,
        playerStart: { x: 160, yOffset: 120 },
        bossTriggerOffset: 620,
        boss: { type: 'octopusDoctor', xOffset: 240, yOffset: 80 },
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
        id: 3,
        title: '第 3 关 · 港 口 基 地',
        subtitle: '集装箱战场与导弹轰炸',
        width: 3600,
        playerStart: { x: 160, yOffset: 120 },
        bossTriggerOffset: 650,
        boss: { type: 'steelCrab', xOffset: 260, yOffset: 80 },
        platforms: [
            [420, 540, 3], [820, 500, 2], [1080, 420, 2],
            [1460, 540, 3], [1840, 450, 2], [2220, 520, 3],
            [2600, 410, 2], [2940, 500, 3], [3300, 430, 2]
        ],
        spawns: [
            { type: 'melee', x: 600 }, { type: 'melee', x: 980 },
            { type: 'ranged', x: 1300 }, { type: 'melee', x: 1660 },
            { type: 'ranged', x: 2040 }, { type: 'melee', x: 2440 },
            { type: 'ranged', x: 2860 }, { type: 'melee', x: 3180 }
        ],
        hazards: [
            { type: 'missile', xMin: 600, xMax: 1200, interval: 3500, damage: 12 },
            { type: 'missile', xMin: 1400, xMax: 2000, interval: 3000, damage: 14 },
            { type: 'missile', xMin: 2200, xMax: 2900, interval: 2800, damage: 14 }
        ]
    },
    {
        id: 4,
        title: '第 4 关 · 天 空 战 舰',
        subtitle: '高空平台与强风区域',
        width: 3800,
        playerStart: { x: 160, yOffset: 120 },
        bossTriggerOffset: 680,
        boss: { type: 'skyCarrier', xOffset: 280, yOffset: 80 },
        platforms: [
            [380, 500, 2], [700, 390, 2], [980, 520, 2],
            [1320, 420, 2], [1640, 330, 2], [1960, 500, 2],
            [2280, 390, 2], [2600, 520, 2], [2960, 400, 2], [3340, 500, 2]
        ],
        spawns: [
            { type: 'ranged', x: 520 }, { type: 'ranged', x: 880 },
            { type: 'melee', x: 1240 }, { type: 'ranged', x: 1580 },
            { type: 'melee', x: 1960 }, { type: 'ranged', x: 2360 },
            { type: 'ranged', x: 2760 }, { type: 'melee', x: 3160 }
        ],
        hazards: [
            { type: 'wind', x: 900, y: 400, w: 200, h: 300, force: 160, dir: 1 },
            { type: 'wind', x: 1700, y: 350, w: 180, h: 280, force: 200, dir: -1 },
            { type: 'wind', x: 2500, y: 420, w: 220, h: 300, force: 180, dir: 1 }
        ]
    },
    {
        id: 5,
        title: '第 5 关 · 终 焉 都 市',
        subtitle: '最终关：崩坏地面与终焉暴龙神',
        width: 4000,
        playerStart: { x: 160, yOffset: 120 },
        bossTriggerOffset: 720,
        boss: { type: 'finalDinoGod', xOffset: 300, yOffset: 80 },
        platforms: [
            [420, 540, 2], [760, 450, 2], [1120, 540, 3],
            [1540, 420, 2], [1900, 500, 3], [2320, 380, 2],
            [2700, 520, 3], [3140, 420, 2], [3500, 500, 2]
        ],
        spawns: [
            { type: 'melee', x: 560 }, { type: 'ranged', x: 880 },
            { type: 'melee', x: 1220 }, { type: 'ranged', x: 1580 },
            { type: 'melee', x: 1960 }, { type: 'ranged', x: 2320 },
            { type: 'melee', x: 2700 }, { type: 'ranged', x: 3060 },
            { type: 'melee', x: 3400 }
        ],
        hazards: [
            { type: 'crumble', x: 900, y: 500, delay: 700, respawn: 5000 },
            { type: 'crumble', x: 1400, y: 460, delay: 600, respawn: 4500 },
            { type: 'crumble', x: 2000, y: 520, delay: 700, respawn: 5000 },
            { type: 'crumble', x: 2600, y: 440, delay: 600, respawn: 4000 },
            { type: 'crumble', x: 3200, y: 480, delay: 500, respawn: 4500 }
        ]
    }
];
