import { verifySession, getCookieName, extractBearerToken } from '../services/feishuAuth.js';

export function getSessionUser(request) {
    const bearer = extractBearerToken(request);
    if (bearer) {
        const user = verifySession(bearer);
        if (user) return user;
    }
    const token = request.cookies[getCookieName()];
    return verifySession(token);
}

export async function requireAuth(request, reply) {
    const user = getSessionUser(request);
    if (!user) {
        reply.code(401).send({ error: '未登录' });
        return false;
    }
    request.user = user;
    return true;
}
