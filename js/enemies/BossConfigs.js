const BossConfigs = {
    // 第 1 关 Boss：磁暴军工厂的开场教学 Boss。
    // 设计参考策划案：电磁三角主炮（tri）+ 重装冲撞（contact）；二阶段召唤磁暴电流地板（slam）。
    // HP / 伤害比第 2 关最终 Boss 略低，承担教学职责。
    steelTriceratops: {
        name: '钢甲三角龙',
        title: '钢甲三角龙 · 磁暴军工厂主宰',
        hp: 260,
        tint: 0x4a6fb0,        // 工业钢蓝
        phase2Tint: 0x9a4cff,  // 二阶段磁暴紫电
        contactDamage: 12,
        speed: 80,
        stopDistance: 130,
        phase1Cooldown: 1750,
        phase2Cooldown: 1100,
        phase1Skills: ['tri', 'spread'],
        phase2Skills: ['tri', 'slam', 'spread']
    },
    // 第 2 关（最终关）Boss：废弃城区的钢铁咆哮压轴。
    mechanicalDino: {
        name: '机械暴龙',
        title: '机械暴龙 · 钢铁咆哮',
        hp: 300,
        tint: 0xff2b2b,
        phase2Tint: 0xff5577,
        contactDamage: 14,
        speed: 95,
        stopDistance: 110,
        phase1Cooldown: 1700,
        phase2Cooldown: 1050,
        phase1Skills: ['tri', 'spread'],
        phase2Skills: ['tri', 'spread', 'slam']
    },
    octopusDoctor: {
        name: '深海章鱼博士',
        title: '深海章鱼博士 · 八腕电光',
        hp: 220,
        tint: 0x8a2be2,
        phase2Tint: 0x00e5ff,
        contactDamage: 12,
        speed: 70,
        stopDistance: 300,
        phase1Cooldown: 1500,
        phase2Cooldown: 900,
        phase1Skills: ['spread', 'tri'],
        phase2Skills: ['spread', 'rain', 'tri']
    },
    steelCrab: {
        name: '钢铁巨蟹',
        title: '钢铁巨蟹 · 港口破坏王',
        hp: 780,
        tint: 0xff7a00,
        phase2Tint: 0xff2b2b,
        contactDamage: 16,
        speed: 115,
        stopDistance: 180,
        phase1Cooldown: 1600,
        phase2Cooldown: 1000,
        phase1Skills: ['slam', 'tri'],
        phase2Skills: ['slam', 'spread', 'tri']
    },
    skyCarrier: {
        name: '空中母舰',
        title: '空中母舰 · 天空压制',
        hp: 760,
        tint: 0x00e5ff,
        phase2Tint: 0xffd400,
        contactDamage: 13,
        speed: 85,
        stopDistance: 340,
        phase1Cooldown: 1450,
        phase2Cooldown: 850,
        phase1Skills: ['rain', 'tri'],
        phase2Skills: ['rain', 'spread', 'tri']
    },
    finalDinoGod: {
        name: '终焉暴龙神',
        title: '终焉暴龙神 · 最终裁决',
        hp: 1000,
        tint: 0xff00aa,
        phase2Tint: 0xffffff,
        contactDamage: 18,
        speed: 105,
        stopDistance: 240,
        phase1Cooldown: 1300,
        phase2Cooldown: 750,
        phase1Skills: ['spread', 'tri', 'slam'],
        phase2Skills: ['spread', 'tri', 'slam', 'rain']
    }
};
