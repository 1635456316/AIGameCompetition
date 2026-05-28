import {
    buildFeishuAuthorizeUrl,
    buildSafeRedirectUrl,
    consumeOAuthState,
    createOAuthState,
    exchangeCodeForUser,
    getCookieName,
    getCookieOptions,
    signSession
} from '../services/feishuAuth.js';
import { getSessionUser } from '../middleware/requireAuth.js';
import { config } from '../config.js';

export async function authRoutes(fastify) {
    fastify.get('/api/auth/me', async (request) => {
        const user = getSessionUser(request);
        if (!user) {
            return { loggedIn: false };
        }
        return {
            loggedIn: true,
            userId: user.userId,
            userName: user.userName
        };
    });

    fastify.get('/api/auth/feishu', async (request, reply) => {
        if (!config.feishu.appId || !config.feishu.appSecret) {
            reply.code(500).send({ error: '飞书 OAuth 未配置，请设置 FEISHU_APP_ID / FEISHU_APP_SECRET' });
            return;
        }

        const returnTo = request.query.returnTo || '/ExtraTools/关卡编辑器/?mode=player';
        const state = createOAuthState(returnTo);
        const url = buildFeishuAuthorizeUrl(state);
        reply.redirect(url);
    });

    fastify.get('/api/auth/feishu/callback', async (request, reply) => {
        const { code, state, error } = request.query;
        if (error) {
            reply.code(400).send({ error: `飞书授权失败: ${error}` });
            return;
        }
        if (!code || !state) {
            reply.code(400).send({ error: '缺少 code 或 state' });
            return;
        }

        const stateEntry = consumeOAuthState(String(state));
        if (!stateEntry) {
            reply.code(400).send({ error: '无效或已过期的 state' });
            return;
        }

        try {
            const user = await exchangeCodeForUser(String(code));
            if (!user.userId) {
                reply.code(500).send({ error: '未能获取飞书用户 ID' });
                return;
            }

            const token = signSession(user);
            reply.setCookie(getCookieName(), token, getCookieOptions());
            reply.redirect(buildSafeRedirectUrl(stateEntry.returnTo));
        } catch (err) {
            reply.code(500).send({ error: err.message || '飞书登录失败' });
        }
    });

    fastify.post('/api/auth/logout', async (_request, reply) => {
        reply.clearCookie(getCookieName(), { path: '/' });
        return { ok: true };
    });
}
