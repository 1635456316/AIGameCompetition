/**
 * 程序化生成贴图。所有 key 在 BootScene.create 里统一烤一次。
 */
class TextureFactory {
    static bakeAll(scene) {
        ['tile_ground', 'tile_wall', 'tile_destructible', 'tile_platform'].forEach((key) => {
            if (scene.textures.exists(key)) scene.textures.remove(key);
        });

        // idle / run 使用真实序列帧资源，见 HeroAnimLoader
        TextureFactory.heroJump(scene, 'hero_jump');
        TextureFactory.heroAttack(scene, 'hero_attack');
        TextureFactory.heroDash(scene, 'hero_dash');

        TextureFactory.boss(scene, 'boss_default');

        TextureFactory.bullet(scene, 'bullet_hero', Palette.heroAccent);
        TextureFactory.bullet(scene, 'bullet_enemy', Palette.enemy);
        TextureFactory.particle(scene, 'particle_white', 0xffffff);
        TextureFactory.particle(scene, 'particle_fire', 0xff7a00);
        TextureFactory.particle(scene, 'particle_energy', Palette.energy);

        TextureFactory.tileGround(scene, 'tile_ground');
        TextureFactory.tileWall(scene, 'tile_wall');
        TextureFactory.tileDestructible(scene, 'tile_destructible');
        TextureFactory.tilePlatform(scene, 'tile_platform');

        TextureFactory.bgFar(scene, 'bg_far', 1280, 720);
        TextureFactory.bgMid(scene, 'bg_mid', 1280, 720);
        TextureFactory.bgNear(scene, 'bg_near', 1280, 720);

        TextureFactory.hitFlash(scene, 'hit_flash');
        TextureFactory.hitSpark(scene, 'hit_spark');
        TextureFactory.laserBeam(scene, 'laser_beam', 1280, 64);
        TextureFactory.laserBeamRed(scene, 'laser_beam_red', 1280, 64);
    }

    static _bake(scene, key, width, height, drawFn) {
        if (scene.textures.exists(key)) return;
        const g = scene.add.graphics({ x: 0, y: 0 });
        drawFn(g);
        g.generateTexture(key, width, height);
        g.destroy();
    }

    /** 逻辑体占位纹理：尺寸须与 body.offset 所参照的序列帧一致 */
    static logicProxy(scene, width, height) {
        const w = Math.max(1, Math.round(width));
        const h = Math.max(1, Math.round(height));
        const key = `logic_proxy_${w}x${h}`;
        if (scene.textures.exists(key)) return key;
        TextureFactory._bake(scene, key, w, h, g => {
            g.fillStyle(0xffffff, 0.001);
            g.fillRect(0, 0, w, h);
        });
        return key;
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
            g.fillStyle(Palette.groundShadow, 1);
            g.fillRect(0, 56, 64, 8);
            g.fillStyle(Palette.ground, 1);
            g.fillRect(0, 0, 64, 56);
            g.fillStyle(Palette.groundHighlight, 1);
            g.fillRect(0, 0, 64, 4);
            g.lineStyle(1, Palette.groundHighlight, 0.35);
            for (let x = 0; x < 64; x += 16) {
                g.lineBetween(x, 6, x, 62);
            }
            g.fillStyle(0x4a5a6e, 0.25);
            for (let i = 0; i < 14; i++) {
                const x = (i * 41) % 58;
                const y = 8 + ((i * 47) % 48);
                g.fillRect(x, y, 3, 2);
            }
            g.lineStyle(1, Palette.black, 0.35);
            g.strokeRect(0, 0, 64, 64);
        });
    }

    /** 不可破坏竖墙 / 边界墙：纯色块，拉伸后无横纹/铆钉 */
    static tileWall(scene, key) {
        TextureFactory._bake(scene, key, 64, 64, g => {
            g.fillStyle(Palette.wallSolid, 1);
            g.fillRect(0, 0, 64, 64);
        });
    }

    /** 可破坏墙：带裂纹的色块，与固墙色差区分 */
    static tileDestructible(scene, key) {
        TextureFactory._bake(scene, key, 64, 64, g => {
            g.fillStyle(Palette.wallBreakable, 1);
            g.fillRect(0, 0, 64, 64);
            g.fillStyle(Palette.wallBreakableHi, 0.25);
            g.fillRect(0, 0, 5, 64);
            g.fillStyle(Palette.wallBreakableDark, 0.3);
            g.fillRect(59, 0, 5, 64);
            TextureFactory.drawWallCracks(g, 64, 64, 42, 0.55);
            g.lineStyle(1, Palette.black, 0.25);
            g.strokeRect(0, 0, 64, 64);
        });
    }

    /** 在墙面上绘制裂纹；seed 决定走向，intensity 0–1 控制密度与深浅 */
    static drawWallCracks(g, w, h, seed, intensity = 1) {
        const count = Math.max(1, Math.round(2 + intensity * 5));
        const alpha = 0.35 + intensity * 0.45;
        const lineW = intensity > 0.6 ? 2 : 1;
        g.lineStyle(lineW, Palette.wallBreakableDark, alpha);

        const rand = (i) => {
            const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
            return v - Math.floor(v);
        };

        for (let c = 0; c < count; c++) {
            let x = 6 + rand(c) * (w - 12);
            let y = rand(c + 50) * h * 0.15;
            const segs = 2 + Math.floor(rand(c + 100) * 4);
            g.beginPath();
            g.moveTo(x, y);
            for (let s = 0; s < segs; s++) {
                x += (rand(c * 11 + s) - 0.5) * (w * 0.28);
                y += (h / (segs + 1)) * (0.65 + rand(c * 11 + s + 30) * 0.5);
                x = Phaser.Math.Clamp(x, 3, w - 3);
                y = Phaser.Math.Clamp(y, 3, h - 3);
                g.lineTo(x, y);
                if (rand(c * 11 + s + 60) > 0.72 && intensity > 0.4) {
                    const bx = Phaser.Math.Clamp(x + (rand(c + s + 70) - 0.5) * 12, 3, w - 3);
                    const by = Phaser.Math.Clamp(y + rand(c + s + 80) * 18, 3, h - 3);
                    g.moveTo(x, y);
                    g.lineTo(bx, by);
                    g.moveTo(x, y);
                }
            }
            g.strokePath();
        }
    }

    static tilePlatform(scene, key) {
        TextureFactory._bake(scene, key, 96, 20, g => {
            g.fillStyle(Palette.platform, 1);
            g.fillRect(0, 0, 96, 20);
            g.fillStyle(Palette.platformHighlight, 1);
            g.fillRect(0, 0, 96, 3);
            g.fillStyle(0x3a2e52, 1);
            g.fillRect(0, 17, 96, 3);
            g.lineStyle(1, Palette.black, 0.5);
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
            const cx = 32;
            const cy = 32;
            const rays = [
                { angle: 0, len: 30, w: 3.5 },
                { angle: Math.PI / 2, len: 30, w: 3.5 },
                { angle: Math.PI, len: 30, w: 3.5 },
                { angle: Math.PI * 1.5, len: 30, w: 3.5 },
                { angle: Math.PI / 4, len: 20, w: 2.5 },
                { angle: Math.PI * 0.75, len: 20, w: 2.5 },
                { angle: Math.PI * 1.25, len: 20, w: 2.5 },
                { angle: Math.PI * 1.75, len: 20, w: 2.5 }
            ];

            rays.forEach(({ angle, len, w }) => {
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const px = -sin * w;
                const py = cos * w;
                g.fillStyle(Palette.warning, 0.95);
                g.fillTriangle(cx + px, cy + py, cx - px, cy - py, cx + cos * len, cy + sin * len);
                g.fillStyle(Palette.white, 0.75);
                g.fillTriangle(
                    cx + px * 0.4, cy + py * 0.4,
                    cx - px * 0.4, cy - py * 0.4,
                    cx + cos * len * 0.82, cy + sin * len * 0.82
                );
            });

            g.fillStyle(Palette.white, 1);
            g.fillCircle(cx, cy, 8);
            g.fillStyle(Palette.warning, 0.55);
            g.fillCircle(cx, cy, 14);
        });
    }

    static hitSpark(scene, key) {
        TextureFactory._bake(scene, key, 12, 4, g => {
            g.fillStyle(Palette.white, 1);
            g.fillRect(0, 0, 12, 4);
            g.fillStyle(Palette.warning, 0.85);
            g.fillRect(0, 1, 9, 2);
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

    static laserBeamRed(scene, key, w, h) {
        TextureFactory._bake(scene, key, w, h, g => {
            g.fillStyle(Palette.danger, 0.35);
            g.fillRect(0, 0, w, h);
            g.fillStyle(0xff3333, 0.85);
            g.fillRect(0, h * 0.25, w, h * 0.5);
            g.fillStyle(0xffcccc, 1);
            g.fillRect(0, h * 0.45, w, h * 0.1);
        });
    }
}
