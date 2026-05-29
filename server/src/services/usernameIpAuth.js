import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';

/** 可配置：2–16 位，中文/英文/数字/下划线 */
export const USERNAME_PATTERN = /^[\u4e00-\u9fa5A-Za-z0-9_]{2,16}$/;

const EMPTY_BINDINGS = { byIp: {}, byUsername: {} };

async function ensureAuthDataDir() {
    await fs.mkdir(path.dirname(config.authBindingsPath), { recursive: true });
}

export function normalizeUsername(raw) {
    if (raw == null || typeof raw !== 'string') {
        throw new Error('请输入用户名');
    }
    const trimmed = raw.trim();
    if (!USERNAME_PATTERN.test(trimmed)) {
        throw new Error('用户名为 2–16 个字符，仅支持中文、英文、数字、下划线');
    }
    return trimmed;
}

export function getClientIp(request) {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
        const first = String(forwarded).split(',')[0].trim();
        if (first) return first;
    }
    return request.ip || 'unknown';
}

export async function loadBindings() {
    await ensureAuthDataDir();
    try {
        const raw = await fs.readFile(config.authBindingsPath, 'utf8');
        const data = JSON.parse(raw);
        return {
            byIp: data?.byIp && typeof data.byIp === 'object' ? data.byIp : {},
            byUsername: data?.byUsername && typeof data.byUsername === 'object' ? data.byUsername : {}
        };
    } catch (err) {
        if (err.code === 'ENOENT') return { ...EMPTY_BINDINGS };
        throw err;
    }
}

export async function saveBindings(bindings) {
    await ensureAuthDataDir();
    const payload = {
        byIp: bindings.byIp || {},
        byUsername: bindings.byUsername || {}
    };
    const dir = path.dirname(config.authBindingsPath);
    const tmpPath = path.join(dir, `.ip-bindings.${Date.now()}.tmp`);
    await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
    await fs.rename(tmpPath, config.authBindingsPath);
}

export async function resolveUsernameLogin(ip, userName) {
    const normalized = normalizeUsername(userName);
    const bindings = await loadBindings();
    const ipUser = bindings.byIp[ip];
    const userIp = bindings.byUsername[normalized];

    if (!ipUser && !userIp) {
        bindings.byIp[ip] = normalized;
        bindings.byUsername[normalized] = ip;
        await saveBindings(bindings);
    } else {
        if (ipUser && ipUser !== normalized) {
            throw new Error(`此 IP 已绑定用户「${ipUser}」，请使用该用户名登录`);
        }
        if (userIp && userIp !== ip) {
            throw new Error('该用户名已绑定其他设备/IP，请从原设备登录');
        }
        if (!ipUser && userIp === ip) {
            bindings.byIp[ip] = normalized;
            await saveBindings(bindings);
        } else if (ipUser === normalized && !userIp) {
            bindings.byUsername[normalized] = ip;
            await saveBindings(bindings);
        }
    }

    return {
        userId: `local:${normalized}`,
        userName: normalized,
        avatarUrl: ''
    };
}

export async function loginWithUsername(request) {
    let body = request.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch {
            throw new Error('请求体必须是 JSON');
        }
    }
    const ip = getClientIp(request);
    return resolveUsernameLogin(ip, body?.userName);
}
