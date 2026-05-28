/**
 * 关卡缩略图生成器
 *
 * 用关卡 JSON 数据（platforms / walls / spawns / boss / finish 等）
 * 在前端用 Phaser Graphics 绘制成小图，注册为纹理供创意工坊卡片复用。
 *
 * - 全部异步加载，带 inflight 去重和持久内存缓存（同一 levelId 只画一次）
 * - 不依赖后端额外字段，纯客户端实现
 */
class LevelThumbnail {
    static cache = new Map();
    static inflight = new Map();

    static WIDTH = 220;
    static HEIGHT = 110;

    /**
     * 确保某个关卡的缩略图纹理就绪
     * @param {Phaser.Scene} scene
     * @param {string} levelId
     * @returns {Promise<{ textureKey: string|null, level: object|null }>}
     */
    static async ensure(scene, levelId) {
        if (!levelId) return { textureKey: null, level: null };
        if (this.cache.has(levelId)) return this.cache.get(levelId);
        if (this.inflight.has(levelId)) return this.inflight.get(levelId);

        const promise = (async () => {
            try {
                const data = await WorkshopApi.fetchLevel(levelId);
                const level = data.level || {};
                const key = `level_thumb_${levelId}`;
                if (!scene.textures.exists(key)) {
                    this._render(scene, key, level);
                }
                const entry = { textureKey: key, level };
                this.cache.set(levelId, entry);
                return entry;
            } catch {
                return { textureKey: null, level: null };
            } finally {
                this.inflight.delete(levelId);
            }
        })();

        this.inflight.set(levelId, promise);
        return promise;
    }

    /**
     * 从关卡数据生成统计标签（前端启发式）
     * @param {object} level
     * @returns {{ difficulty: number, isBoss: boolean, isFinish: boolean, platformCount: number, enemyCount: number }}
     */
    static analyze(level) {
        const platforms = (level.platforms || []).length;
        const enemies = (level.spawns || []).length;
        const isBoss = !!level.boss;
        const isFinish = !isBoss && !!level.finish;

        // 简单启发式：敌人多 + 平台多 + Boss 关 ⇒ 难度高
        let score = enemies * 1.0 + platforms * 0.35 + (isBoss ? 4 : 0);
        let difficulty = 1;
        if (score >= 4) difficulty = 2;
        if (score >= 9) difficulty = 3;
        if (score >= 16) difficulty = 4;
        if (score >= 24) difficulty = 5;

        return {
            difficulty,
            isBoss,
            isFinish,
            platformCount: platforms,
            enemyCount: enemies
        };
    }

    static _render(scene, key, level) {
        const W = this.WIDTH;
        const H = this.HEIGHT;
        const levelW = Math.max(800, level.width || 2400);
        const levelH = GAME_HEIGHT;
        const sx = W / levelW;
        const sy = H / levelH;

        const gfx = scene.add.graphics();

        gfx.fillStyle(0x06101c, 1);
        gfx.fillRect(0, 0, W, H);
        gfx.fillStyle(0x0a1a30, 0.85);
        gfx.fillRect(0, H * 0.55, W, H * 0.45);

        gfx.lineStyle(1, 0x0e2a48, 0.5);
        for (let x = 0; x < W; x += 18) {
            gfx.lineBetween(x, 0, x, H);
        }
        for (let y = 0; y < H; y += 18) {
            gfx.lineBetween(0, y, W, y);
        }

        const groundH = Math.max(4, 64 * sy);
        gfx.fillStyle(0x1d3658, 1);
        gfx.fillRect(0, H - groundH, W, groundH);
        gfx.fillStyle(0x5feaff, 0.6);
        gfx.fillRect(0, H - groundH, W, 1);

        gfx.fillStyle(0x5feaff, 0.85);
        (level.platforms || []).forEach(p => {
            const [px, py, pw, ph] = p;
            const rx = px * sx;
            const ry = py * sy;
            const rw = Math.max(2, pw * sx);
            const rh = Math.max(2, ph * sy);
            gfx.fillRect(rx, ry, rw, rh);
        });

        const drawWalls = (arr, color, alpha) => {
            if (!arr) return;
            gfx.fillStyle(color, alpha);
            arr.forEach(w => {
                const rx = (w.x || 0) * sx;
                const ry = (w.y || 0) * sy;
                const rw = Math.max(2, (w.w || 0) * sx);
                const rh = Math.max(2, (w.h || 0) * sy);
                gfx.fillRect(rx, ry, rw, rh);
            });
        };
        drawWalls(level.walls, 0x728498, 0.7);
        drawWalls(level.destructibleWalls, 0xa89880, 0.75);
        drawWalls(level.systemWalls, 0x566578, 0.75);

        if (Array.isArray(level.hazards)) {
            gfx.fillStyle(0xff5fb9, 0.85);
            level.hazards.forEach(h => {
                // 风场区域大且游戏中几乎不可见，缩略图里会占满整图
                if (h.type === 'wind') return;
                const rx = (h.x || 0) * sx;
                const ry = (h.y || 0) * sy;
                const rw = Math.max(2, (h.w || 32) * sx);
                const rh = Math.max(2, (h.h || 32) * sy);
                gfx.fillRect(rx, ry, rw, rh);
            });
        }

        if (Array.isArray(level.pickups)) {
            gfx.fillStyle(0xffd400, 1);
            level.pickups.forEach(p => {
                gfx.fillCircle((p.x || 0) * sx, (p.y || 0) * sy, 1.5);
            });
        }

        gfx.fillStyle(0xff2b2b, 1);
        (level.spawns || []).forEach(s => {
            const ex = (s.x || 0) * sx;
            const ey = (s.y != null ? s.y : GAME_HEIGHT - 80) * sy;
            gfx.fillCircle(ex, ey, 2.2);
        });

        const ps = level.playerStart || { x: 160, yOffset: 120 };
        const psx = ps.x * sx;
        const psy = (GAME_HEIGHT - 64 - (ps.yOffset || 120)) * sy;
        gfx.fillStyle(0x00e5ff, 1);
        gfx.fillCircle(psx, psy, 3);
        gfx.lineStyle(1, 0xffffff, 0.9);
        gfx.strokeCircle(psx, psy, 3.5);

        if (level.boss) {
            const bossX = (level.boss.x != null
                ? level.boss.x
                : (levelW - (level.boss.xOffset != null ? level.boss.xOffset : 240))) * sx;
            const bossY = (GAME_HEIGHT - 64 - (level.boss.yOffset != null ? level.boss.yOffset : 80)) * sy;
            gfx.fillStyle(0xff00aa, 1);
            gfx.fillRect(bossX - 6, bossY - 9, 12, 18);
            gfx.lineStyle(1, 0xffffff, 0.95);
            gfx.strokeRect(bossX - 6, bossY - 9, 12, 18);
        } else if (level.finish) {
            const fx = (level.finish.x != null ? level.finish.x : levelW - 100) * sx;
            const fyVal = (level.finish.y != null
                ? level.finish.y
                : GAME_HEIGHT - 64 - (level.finish.yOffset || 80));
            const fy = fyVal * sy;
            gfx.fillStyle(0xffd400, 1);
            gfx.fillTriangle(fx, fy - 6, fx - 5, fy + 5, fx + 5, fy + 5);
            gfx.fillStyle(0xffe96b, 1);
            gfx.fillCircle(fx, fy - 1, 2);
        }

        gfx.lineStyle(1, 0x5feaff, 0.5);
        gfx.strokeRect(0, 0, W - 1, H - 1);

        gfx.generateTexture(key, W, H);
        gfx.destroy();
    }
}

window.LevelThumbnail = LevelThumbnail;
