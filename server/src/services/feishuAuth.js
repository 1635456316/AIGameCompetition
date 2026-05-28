import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const COOKIE_NAME = 'aigc_session';
const STATE_TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map();

export function signSession(user) {
    return jwt.sign(
        {
            userId: user.userId,
            userName: user.userName
        },
        config.jwtSecret,
        { expiresIn: '7d' }
    );
}

export function verifySession(token) {
    if (!token) return null;
    try {
        return jwt.verify(token, config.jwtSecret);
    } catch {
        return null;
    }
}

export function getCookieName() {
    return COOKIE_NAME;
}

export function getCookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60
    };
}

export function createOAuthState(returnTo) {
    const state = cryptoRandom();
    pendingStates.set(state, {
        returnTo: sanitizeReturnTo(returnTo),
        createdAt: Date.now()
    });
    return state;
}

export function consumeOAuthState(state) {
    const entry = pendingStates.get(state);
    pendingStates.delete(state);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > STATE_TTL_MS) return null;
    return entry;
}

function sanitizeReturnTo(returnTo) {
    if (!returnTo || typeof returnTo !== 'string') {
        return '/ExtraTools/关卡编辑器/?mode=player';
    }
    if (!returnTo.startsWith('/')) {
        return '/ExtraTools/关卡编辑器/?mode=player';
    }
    return returnTo;
}

/** HTTP Location 头不能含中文等未编码字符，需 percent-encode 路径段 */
export function buildSafeRedirectUrl(path) {
    const safe = sanitizeReturnTo(path);
    const qIndex = safe.indexOf('?');
    const hashIndex = safe.indexOf('#', qIndex >= 0 ? qIndex : 0);

    let pathname = safe;
    let search = '';
    let hash = '';

    if (qIndex >= 0) {
        pathname = safe.slice(0, qIndex);
        if (hashIndex >= 0) {
            search = safe.slice(qIndex, hashIndex);
            hash = safe.slice(hashIndex);
        } else {
            search = safe.slice(qIndex);
        }
    } else if (hashIndex >= 0) {
        pathname = safe.slice(0, hashIndex);
        hash = safe.slice(hashIndex);
    }

    const encodedPath = pathname
        .split('/')
        .map(segment => {
            if (!segment) return segment;
            try {
                return encodeURIComponent(decodeURIComponent(segment));
            } catch {
                return encodeURIComponent(segment);
            }
        })
        .join('/');

    return encodedPath + search + hash;
}

function cryptoRandom() {
    return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('hex');
}

export function buildFeishuAuthorizeUrl(state) {
    const params = new URLSearchParams({
        client_id: config.feishu.appId,
        response_type: 'code',
        redirect_uri: config.feishu.redirectUri,
        state
    });
    return `https://accounts.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`;
}

function formatFeishuError(prefix, json) {
    const detail = json?.error_description || json?.error || json?.msg;
    const code = json?.code != null ? ` (${json.code})` : '';
    return detail ? `${prefix}: ${detail}${code}` : prefix;
}

export async function exchangeCodeForUser(code) {
    const tokenRes = await fetch('https://open.feishu.cn/open-apis/authen/v2/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: config.feishu.appId,
            client_secret: config.feishu.appSecret,
            code,
            redirect_uri: config.feishu.redirectUri
        })
    });

    const tokenJson = await tokenRes.json();
    if (tokenJson.code !== 0) {
        throw new Error(formatFeishuError('飞书 token 交换失败', tokenJson));
    }

    const accessToken = tokenJson.access_token;
    if (!accessToken) {
        throw new Error('飞书未返回 access_token');
    }

    const userRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
    const userJson = await userRes.json();
    if (userJson.code !== 0) {
        throw new Error(formatFeishuError('飞书用户信息获取失败', userJson));
    }

    const data = userJson.data || {};
    return {
        userId: data.user_id || data.open_id || data.union_id || '',
        userName: data.name || data.en_name || '飞书用户'
    };
}
