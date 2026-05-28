/**
 * 飞书头像加载与圆形裁剪缓存
 *
 * - 使用原生 Image() + canvas 圆形裁剪生成圆形纹理，注册到场景纹理表
 * - 同一 (userId/url) 只加载一次，cache 持久化在内存中
 * - 跨域失败 / 网络错误自动 fallback 到 null，调用方应回退到首字母圆形
 */
class AvatarCache {
    static cache = new Map();
    static inflight = new Map();
    static SIZE = 96;

    static keyFor(userId, url) {
        const base = userId || this._hash(url || '');
        return `avatar_${base}`;
    }

    static _hash(s) {
        let h = 0;
        for (let i = 0; i < s.length; i++) {
            h = ((h << 5) - h) + s.charCodeAt(i);
            h |= 0;
        }
        return `u${Math.abs(h)}`;
    }

    /**
     * 确保某个用户的圆形头像纹理就绪
     * @param {Phaser.Scene} scene
     * @param {string} userId  (可选；用作纹理 key)
     * @param {string} url     头像 URL
     * @returns {Promise<string|null>} 纹理 key（圆形 RGBA 64x64），失败返回 null
     */
    static async ensure(scene, userId, url) {
        if (!url) return null;
        const key = this.keyFor(userId, url);

        if (this.cache.has(key)) {
            const v = this.cache.get(key);
            return v === '__failed__' ? null : key;
        }
        if (this.inflight.has(key)) return this.inflight.get(key);

        const promise = new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const size = this.SIZE;
                    const canvas = document.createElement('canvas');
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error('no 2d context');

                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                    ctx.closePath();
                    ctx.clip();

                    const ar = img.width / img.height;
                    let sx, sy, sw, sh;
                    if (ar >= 1) {
                        sh = img.height;
                        sw = img.height;
                        sx = (img.width - sw) / 2;
                        sy = 0;
                    } else {
                        sw = img.width;
                        sh = img.width;
                        sx = 0;
                        sy = (img.height - sh) / 2;
                    }
                    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
                    ctx.restore();

                    if (!scene.textures.exists(key)) {
                        scene.textures.addCanvas(key, canvas);
                    }
                    this.cache.set(key, key);
                    resolve(key);
                } catch {
                    this.cache.set(key, '__failed__');
                    resolve(null);
                }
            };
            img.onerror = () => {
                this.cache.set(key, '__failed__');
                resolve(null);
            };
            img.src = url;
        }).finally(() => this.inflight.delete(key));

        this.inflight.set(key, promise);
        return promise;
    }
}

window.AvatarCache = AvatarCache;
