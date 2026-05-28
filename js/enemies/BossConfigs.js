const BossConfigs = {
    // 第 1 关 Boss：钢甲要塞的开场教学 Boss。
    // 仅使用近战招式：跳跃砸地 + 冲撞；无碰撞伤害，便于玩家学习走位与闪避。
    steelTriceratops: {
        name: '钢甲三角龙',
        title: '钢甲三角龙 · 钢甲要塞主宰',
        hp: 260,
        tint: 0x4a6fb0,        // 工业钢蓝
        phase2Tint: 0x9a4cff,  // 二阶段磁暴紫电
        contactDamage: 0,
        speed: 80,
        stopDistance: 130,
        phase1Cooldown: 2200,
        phase2Cooldown: 1600,
        phase1Skills: ['jumpSlam', 'charge'],
        phase2Skills: ['jumpSlam', 'charge'],
        skills: {
            jumpSlam: {
                windupMs: 420,
                arcHeight: 300,
                airDurationMs: 950,
                maxDurationMs: 2600,
                damage: 18,
                radius: 210
            },
            charge: {
                windupMs: 480,
                speed: 440,
                durationMs: 680,
                damage: 16
            }
        },
        logic: {
            origin: { x: 0.5, y: 1 },
            referenceFrameWidth: 1024,
            referenceFrameHeight: 1024,
            body: { width: 230, height: 175, offsetX: 397, feetAlign: true },
            fallbackBody: { width: 120, height: 158, offsetX: 20, offsetY: 2 },
            depth: 19,
            collideWorldBounds: true
        },
        visual: {
            idleTexture: 'tex_boss1_idle',
            framePrefix: 'idle',
            idleAnim: 'boss1_idle',
            displayHeight: 210,
            referenceFrameHeight: 1024,
            feetVisualOffsetY: 16,
            depth: 15
        }
    },
    // 第 2 关（最终关）Boss：废弃城区的钢铁咆哮压轴。
    // 仅弹幕攻击，弹幕朝玩家方向发射；移动与重力行为与其他 Boss 一致。
    mechanicalDino: {
        name: '机械暴龙',
        title: '机械暴龙 · 钢铁咆哮',
        hp: 300,
        tint: 0xff2b2b,
        phase2Tint: 0xff5577,
        contactDamage: 14,
        speed: 95,
        stopDistance: 110,
        skillAim: 'player',
        phase1Cooldown: 1700,
        phase2Cooldown: 1050,
        phase1Skills: ['tri', 'spread', 'rain'],
        phase2Skills: ['tri', 'spread', 'rain'],
        skills: {
            spread: { speed: 340, count: 5, spreadDeg: 36, phase2Count: 7, phase2SpreadDeg: 48 },
            tri: { speed: 420, count: 3, intervalMs: 160, phase2Count: 5, phase2IntervalMs: 110 },
            rain: {
                count: 6, intervalMs: 120, xSpread: 180, speed: 400,
                phase2Count: 9, phase2IntervalMs: 90, phase2XSpread: 240, phase2Speed: 440
            }
        },
        logic: {
            origin: { x: 0.5, y: 1 },
            referenceFrameWidth: 1024,
            referenceFrameHeight: 1024,
            body: { width: 150, height: 210, offsetX: 437, feetAlign: true },
            fallbackBody: { width: 120, height: 158, offsetX: 20, offsetY: 2 },
            depth: 19,
            collideWorldBounds: true
        },
        visual: {
            idleTexture: 'tex_boss_final_idle',
            framePrefix: 'final_idle',
            idleAnim: 'boss_final_idle',
            displayHeight: 220,
            referenceFrameHeight: 1024,
            feetVisualOffsetY: 16,
            depth: 15
        }
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
    },

    /** 构建 Boss 实体配置（逻辑体 + 表现层） */
    buildEntityConfig(scene, config) {
        const cfg = config || BossConfigs.mechanicalDino;
        const vis = cfg.visual;
        const logicCfg = cfg.logic || {};
        const useSheet = !!(vis && scene.textures.exists(vis.idleTexture));

        const refW = logicCfg.referenceFrameWidth || vis?.referenceFrameWidth || (useSheet ? 1024 : 160);
        const refH = logicCfg.referenceFrameHeight || vis?.referenceFrameHeight || (useSheet ? 1024 : 180);
        let body = logicCfg.fallbackBody || { width: 120, height: 158, offsetX: 20, offsetY: 2 };
        if (useSheet && logicCfg.body) {
            const b = logicCfg.body;
            const height = b.height;
            const offsetY = b.feetAlign === false && b.offsetY != null
                ? b.offsetY
                : (refH - height);
            body = { width: b.width, height, offsetX: b.offsetX, offsetY };
        }

        const logic = {
            origin: logicCfg.origin || { x: 0.5, y: 1 },
            referenceFrameWidth: refW,
            referenceFrameHeight: refH,
            body,
            depth: logicCfg.depth || 19,
            collideWorldBounds: logicCfg.collideWorldBounds !== false
        };

        const visual = useSheet ? {
            idleTexture: vis.idleTexture,
            idleFrame: vis.idleFrame || `${vis.framePrefix || 'idle'}_0`,
            idleAnim: vis.idleAnim,
            displayHeight: vis.displayHeight || 140,
            referenceFrameHeight: refH,
            feetVisualOffsetY: vis.feetVisualOffsetY || 0,
            depth: vis.depth || 15
        } : {
            texture: 'boss_default',
            displayHeight: 140,
            referenceFrameHeight: 180,
            depth: vis?.depth || 15,
            tint: cfg.tint || Palette.boss
        };

        return { logic, visual, useSheet };
    }
};
