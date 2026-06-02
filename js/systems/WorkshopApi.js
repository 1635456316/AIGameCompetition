/**
 * 创意工坊 API 封装（与 server 同域）
 */
class WorkshopApi {
    static TOKEN_KEY = 'aigc_session_token';

    static getStoredToken() {
        try {
            return localStorage.getItem(this.TOKEN_KEY) || '';
        } catch {
            return '';
        }
    }

    static saveToken(token) {
        try {
            if (token) localStorage.setItem(this.TOKEN_KEY, token);
        } catch {
            /* ignore */
        }
    }

    static clearToken() {
        try {
            localStorage.removeItem(this.TOKEN_KEY);
        } catch {
            /* ignore */
        }
    }

    static authHeaders(extra = {}) {
        const headers = { ...extra };
        const token = this.getStoredToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        return headers;
    }

    static async fetchJson(url, options = {}) {
        const res = await fetch(url, {
            credentials: 'include',
            ...options,
            headers: this.authHeaders({
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...(options.headers || {})
            })
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
        const data = await this.fetchJson('/api/auth/username', {
            method: 'POST',
            body: JSON.stringify({ userName })
        });
        if (data.token) this.saveToken(data.token);
        return data;
    }

    static async logout() {
        try {
            await this.fetchJson('/api/auth/logout', { method: 'POST' });
        } finally {
            this.clearToken();
        }
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

    static async likeLevel(levelId) {
        return this.fetchJson(`/api/levels/${encodeURIComponent(levelId)}/like`, { method: 'POST' });
    }

    static async importToEditor(levelId) {
        const data = await this.fetchLevel(levelId);
        const draftId = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : `draft_${Date.now()}`;
        const levelJson = data.level || {};

        await new Promise((resolve, reject) => {
            const req = indexedDB.open('workshop-editor', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('drafts');
            req.onsuccess = () => {
                const db = req.result;
                const tx = db.transaction('drafts', 'readwrite');
                tx.objectStore('drafts').put({
                    draftId,
                    levelJson,
                    updatedAt: Date.now()
                }, draftId);
                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => reject(tx.error);
            };
            req.onerror = () => reject(req.error);
        });

        sessionStorage.setItem('editor-draft-id', draftId);
        sessionStorage.removeItem('editor-test-pass');
        sessionStorage.setItem('boot-scene', 'WorkshopScene');
        window.location.href = '/ExtraTools/关卡编辑器/?mode=player';
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
