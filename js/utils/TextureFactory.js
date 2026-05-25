/**
 * 程序化生成贴图。所有 key 在 BootScene.create 里统一烤一次。
 */
class TextureFactory {
    static bakeAll(scene) {
        // idle / run 使用真实序列帧资源，见 HeroAnimLoader
        TextureFactory.heroJump(scene, 'hero_jump');
        TextureFactory.heroAttack(scene, 'hero_attack');
        TextureFactory.heroDash(scene, 'hero_dash');

        TextureFactory.enemyMelee(scene, 'enemy_melee');
        TextureFactory.enemyRange(scene, 'enemy_range');
        TextureFactory.boss(scene, 'boss_default');

        TextureFactory.bullet(scene, 'bullet_hero', Palette.heroAccent);
        TextureFactory.bullet(scene, 'bullet_enemy', Palette.enemy);
        TextureFactory.particle(scene, 'particle_white', 0xffffff);
        TextureFactory.particle(scene, 'particle_fire', 0xff7a00);
        TextureFactory.particle(scene, 'particle_energy', Palette.energy);

        TextureFactory.tileGround(scene, 'tile_ground');
        TextureFactory.tilePlatform(scene, 'tile_platform');

        TextureFactory.bgFar(scene, 'bg_far', 1280, 720);
        TextureFactory.bgMid(scene, 'bg_mid', 1280, 720);
        TextureFactory.bgNear(scene, 'bg_near', 1280, 720);

        TextureFactory.hitFlash(scene, 'hit_flash');
        TextureFactory.laserBeam(scene, 'laser_beam', 1280, 64);
    }

    static _bake(scene, key, width, height, drawFn) {
        if (scene.textures.exists(key)) return;
        const g = scene.add.graphics({ x: 0, y: 0 });
        drawFn(g);
        g.generateTexture(key, width, height);
        g.destroy();
    }

    // 角色：48x64，简化为头+躯干+腿；不同状态颜色/姿态略变
    static _drawHumanoid(g, opts) {
        const {
            bodyColor = Palette.hero,
            darkColor = Palette.heroDark,
            accent    = Palette.heroAccent,
            tilt      = 0,
            crouch    = 0,
            attack    = false
        } = opts || {};

        const w = 48, h = 64;
        // 身体
        g.fillStyle(bodyColor, 1);
        g.fillRect(12, 18 + crouch, 24, 28 - crouch);
        // 躯干暗部
        g.fillStyle(darkColor, 1);
        g.fillRect(12, 34 + crouch, 24, 12 - crouch);
        // 头
        g.fillStyle(bodyColor, 1);
        g.fillRect(14, 4 + tilt, 20, 16);
        // 眼罩（红色横条，特摄感）
        g.fillStyle(Palette.danger, 1);
        g.fillRect(14, 10 + tilt, 20, 3);
        // 腿
        g.fillStyle(darkColor, 1);
        g.fillRect(14, 46, 8, 16 - crouch);
        g.fillRect(26, 46, 8, 16 - crouch);
        // 胸口能量核心
        g.fillStyle(accent, 1);
        g.fillRect(22, 26 + crouch, 4, 6);
        // 描边
        g.lineStyle(2, Palette.black, 1);
        g.strokeRect(12, 18 + crouch, 24, 28 - crouch);
        g.strokeRect(14, 4 + tilt, 20, 16);

        if (attack) {
            // 攻击时向前伸出的拳/刃
            g.fillStyle(accent, 1);
            g.fillRect(36, 28, 12, 6);
            g.lineStyle(2, Palette.black, 1);
            g.strokeRect(36, 28, 12, 6);
        }
        return { w, h };
    }

    static heroIdle(scene, key) {
        TextureFactory._bake(scene, key, 48, 64, g => {
            TextureFactory._drawHumanoid(g, {});
        });
    }
    static heroRun(scene, key) {
        TextureFactory._bake(scene, key, 48, 64, g => {
            TextureFactory._drawHumanoid(g, { tilt: 1 });
        });
    }
    static heroJump(scene, key) {
        TextureFactory._bake(scene, key, 48, 64, g => {
            TextureFactory._drawHumanoid(g, { crouch: -2 });
        });
    }
    static heroAttack(scene, key) {
        TextureFactory._bake(scene, key, 64, 64, g => {
            TextureFactory._drawHumanoid(g, { attack: true });
        });
    }
    static heroDash(scene, key) {
        TextureFactory._bake(scene, key, 48, 64, g => {
            TextureFactory._drawHumanoid(g, { bodyColor: 0x66f0ff, darkColor: Palette.hero });
        });
    }

    static enemyMelee(scene, key) {
        TextureFactory._bake(scene, key, 44, 56, g => {
            // 红色矮壮机械兵
            g.fillStyle(Palette.enemy, 1);
            g.fillRect(6, 10, 32, 38);
            g.fillStyle(Palette.enemyDark, 1);
            g.fillRect(6, 32, 32, 16);
            // 头
            g.fillStyle(Palette.enemyDark, 1);
            g.fillRect(12, 0, 20, 14);
            // 眼
            g.fillStyle(Palette.warning, 1);
            g.fillRect(16, 4, 4, 4);
            g.fillRect(24, 4, 4, 4);
            // 描边
            g.lineStyle(2, Palette.black, 1);
            g.strokeRect(6, 10, 32, 38);
            g.strokeRect(12, 0, 20, 14);
        });
    }

    static enemyRange(scene, key) {
        TextureFactory._bake(scene, key, 44, 56, g => {
            // 紫色细长远程兵 + 炮管
            g.fillStyle(0x8a2be2, 1);
            g.fillRect(10, 8, 24, 40);
            g.fillStyle(0x4b0082, 1);
            g.fillRect(10, 32, 24, 16);
            // 头
            g.fillStyle(0x4b0082, 1);
            g.fillRect(14, 0, 16, 12);
            // 眼
            g.fillStyle(Palette.warning, 1);
            g.fillRect(18, 3, 8, 4);
            // 炮管
            g.fillStyle(Palette.black, 1);
            g.fillRect(30, 22, 14, 6);
            g.fillStyle(Palette.danger, 1);
            g.fillRect(40, 24, 4, 2);
            g.lineStyle(2, Palette.black, 1);
            g.strokeRect(10, 8, 24, 40);
            g.strokeRect(14, 0, 16, 12);
        });
    }

    static boss(scene, key) {
        TextureFactory._bake(scene, key, 160, 180, g => {
            g.fillStyle(Palette.boss, 1);
            g.fillRect(20, 30, 120, 130);
            g.fillStyle(0x800066, 1);
            g.fillRect(20, 110, 120, 50);
            // 头
            g.fillStyle(0x800066, 1);
            g.fillRect(40, 0, 80, 40);
            // 双眼
            g.fillStyle(Palette.warning, 1);
            g.fillRect(50, 12, 16, 10);
            g.fillRect(94, 12, 16, 10);
            // 胸口核心
            g.fillStyle(Palette.energy, 1);
            g.fillRect(70, 70, 20, 20);
            g.lineStyle(3, Palette.black, 1);
            g.strokeRect(20, 30, 120, 130);
            g.strokeRect(40, 0, 80, 40);
        });
    }

    static bullet(scene, key, color) {
        TextureFactory._bake(scene, key, 16, 8, g => {
            g.fillStyle(color, 1);
            g.fillRect(0, 0, 16, 8);
            g.fillStyle(Palette.white, 1);
            g.fillRect(2, 2, 6, 4);
        });
    }

    static particle(scene, key, color) {
        TextureFactory._bake(scene, key, 8, 8, g => {
            g.fillStyle(color, 1);
            g.fillCircle(4, 4, 4);
        });
    }

    static tileGround(scene, key) {
        TextureFactory._bake(scene, key, 64, 64, g => {
            g.fillStyle(Palette.ground, 1);
            g.fillRect(0, 0, 64, 64);
            g.fillStyle(Palette.groundEdge, 1);
            g.fillRect(0, 0, 64, 6);
            // 噪点
            g.fillStyle(0x1a1a26, 1);
            for (let i = 0; i < 18; i++) {
                const x = (i * 37) % 60;
                const y = 10 + ((i * 53) % 50);
                g.fillRect(x, y, 2, 2);
            }
            g.lineStyle(1, Palette.black, 0.5);
            g.strokeRect(0, 0, 64, 64);
        });
    }

    static tilePlatform(scene, key) {
        TextureFactory._bake(scene, key, 96, 20, g => {
            g.fillStyle(Palette.platform, 1);
            g.fillRect(0, 0, 96, 20);
            g.fillStyle(Palette.groundEdge, 1);
            g.fillRect(0, 0, 96, 4);
            g.lineStyle(1, Palette.black, 0.6);
            g.strokeRect(0, 0, 96, 20);
        });
    }

    static bgFar(scene, key, w, h) {
        TextureFactory._bake(scene, key, w, h, g => {
            // 渐变天空（用多条横向矩形模拟）
            const steps = 32;
            for (let i = 0; i < steps; i++) {
                const t = i / (steps - 1);
                const r = Math.floor(0x2a * (1 - t) + 0x0a * t);
                const gg = Math.floor(0x0a * (1 - t) + 0x0a * t);
                const b = Math.floor(0x1a * (1 - t) + 0x14 * t);
                const color = (r << 16) | (gg << 8) | b;
                g.fillStyle(color, 1);
                g.fillRect(0, Math.floor(i * h / steps), w, Math.ceil(h / steps) + 1);
            }
            // 远方剪影
            g.fillStyle(Palette.bgFar, 1);
            for (let i = 0; i < 18; i++) {
                const bx = i * 80 + ((i * 53) % 30);
                const bh = 60 + ((i * 97) % 120);
                g.fillRect(bx, h - bh - 100, 60, bh);
            }
        });
    }

    static bgMid(scene, key, w, h) {
        TextureFactory._bake(scene, key, w, h, g => {
            g.fillStyle(0x000000, 0);
            g.fillRect(0, 0, w, h);
            g.fillStyle(Palette.bgMid, 1);
            for (let i = 0; i < 14; i++) {
                const bx = i * 100 + ((i * 31) % 50);
                const bh = 120 + ((i * 73) % 160);
                g.fillRect(bx, h - bh - 60, 80, bh);
                // 窗户
                g.fillStyle(Palette.warning, 0.5);
                for (let wy = 0; wy < bh - 20; wy += 18) {
                    for (let wx = 0; wx < 70; wx += 14) {
                        if (((wx * wy + i) % 5) === 0) {
                            g.fillRect(bx + 6 + wx, h - bh - 60 + 10 + wy, 4, 6);
                        }
                    }
                }
                g.fillStyle(Palette.bgMid, 1);
            }
        });
    }

    static bgNear(scene, key, w, h) {
        TextureFactory._bake(scene, key, w, h, g => {
            g.fillStyle(Palette.bgNear, 1);
            for (let i = 0; i < 10; i++) {
                const bx = i * 140 + ((i * 17) % 40);
                const bh = 200 + ((i * 41) % 200);
                g.fillRect(bx, h - bh - 20, 110, bh);
            }
        });
    }

    static hitFlash(scene, key) {
        TextureFactory._bake(scene, key, 64, 64, g => {
            g.fillStyle(Palette.white, 1);
            g.fillCircle(32, 32, 30);
            g.fillStyle(Palette.warning, 1);
            g.fillCircle(32, 32, 18);
            g.fillStyle(Palette.danger, 1);
            g.fillCircle(32, 32, 8);
        });
    }

    static laserBeam(scene, key, w, h) {
        TextureFactory._bake(scene, key, w, h, g => {
            g.fillStyle(Palette.energy, 0.4);
            g.fillRect(0, 0, w, h);
            g.fillStyle(Palette.energy, 0.8);
            g.fillRect(0, h * 0.25, w, h * 0.5);
            g.fillStyle(Palette.white, 1);
            g.fillRect(0, h * 0.45, w, h * 0.1);
        });
    }
}
