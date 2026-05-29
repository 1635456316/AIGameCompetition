/**
 * 创意工坊 API 封装（与 server 同域）
 */
class WorkshopApi {
    static async fetchJson(url, options = {}) {
        const res = await fetch(url, {
            credentials: 'include',
            ...options,
            headers: {
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...(options.headers || {})
            }
        });

        let data = null;
        try {
            data = await res.json();
        } catch {
            data = null;
        }

        if (!res.ok) {
            let message = data?.error || `请求失败 (${res.status})`;
            if (res.status === 404 && message === 'Not Found' && String(url).startsWith('/api/')) {
                message = '接口不存在，请重启 server（npm run dev 或 .\\server.ps1 restart dev）后重试';
            }
            throw new Error(message);
        }

        return data;
    }

    static async checkAuth() {
        return this.fetchJson('/api/auth/me');
    }

    static getLoginUrl(returnTo) {
        const encoded = encodeURIComponent(returnTo || '/ExtraTools/关卡编辑器/?mode=player');
        return `/api/auth/feishu?returnTo=${encoded}`;
    }

    static async loginWithUsername(userName) {
        return this.fetchJson('/api/auth/username', {
            method: 'POST',
            body: JSON.stringify({ userName })
        });
    }

    static async logout() {
        return this.fetchJson('/api/auth/logout', { method: 'POST' });
    }

    static async fetchLevels() {
        const data = await this.fetchJson('/api/levels');
        return data.levels || [];
    }

    static async fetchMyLevels() {
        const data = await this.fetchJson('/api/levels/mine');
        return data.levels || [];
    }

    static async fetchLevel(levelId) {
        return this.fetchJson(`/api/levels/${encodeURIComponent(levelId)}`);
    }

    static async deleteLevel(levelId) {
        return this.fetchJson(`/api/levels/${encodeURIComponent(levelId)}`, { method: 'DELETE' });
    }

    static async publishLevel({ title, description, levelData, testPass }) {
        return this.fetchJson('/api/levels', {
            method: 'POST',
            body: JSON.stringify({ title, description, levelData, testPass })
        });
    }

    static exportForHash(level) {
        const out = JSON.parse(JSON.stringify(level));
        const mediaKeys = ['startVideoUrl', 'endVideoUrl', 'normalBgmUrl', 'bossBgmUrl', 'bgUrl', 'resultBgUrl'];
        mediaKeys.forEach(key => { out[key] = null; });

        const finish = out.finish != null && typeof out.finish?.x === 'number' && !Number.isNaN(out.finish.x);
        if (finish) {
            delete out.boss;
        } else {
            delete out.finish;
        }
        return out;
    }

    static async hashLevelJson(level) {
        const text = JSON.stringify(this.exportForHash(level));
        if (window.crypto && window.crypto.subtle) {
            const data = new TextEncoder().encode(text);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            return Array.from(new Uint8Array(hashBuffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
        }
        return this._fallbackHash(text);
    }

    static _fallbackHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return `fallback_${Math.abs(hash)}_${str.length}`;
    }
}

window.WorkshopApi = WorkshopApi;
