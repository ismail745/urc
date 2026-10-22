import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function getConnecterUser(request) {
    let token = new Headers(request.headers).get('Authorization');
    if (token === undefined || token === null || token === "") {
        return null;
    } else {
        token = token.replace("Bearer ", "");
    }
    console.log("checking " + token);
    const user = await redis.get(token);
    console.log("Got user : " + user?.username);
    return user;
}

export async function checkSession(request) {
    const user = await getConnecterUser(request);
    // console.log(user);
    return (user !== undefined && user !== null && user);
}

export function getToken(request) {
    const token = new Headers(request.headers).get('Authorization');
    return token ? token.replace("Bearer ", "") : null;
}

export function unauthorizedResponse() {
    const error = {code: "UNAUTHORIZED", message: "Session expired"};
    return new Response(JSON.stringify(error), {
        status: 401,
        headers: {'content-type': 'application/json'},
    });
}

export function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status: status,
        headers: {'content-type': 'application/json'},
    });
}

export function triggerNotConnected(res) {
    res.status(401).json({code: "UNAUTHORIZED", message: "Session expired"});
}

/** Durée d'une session (secondes) */
export const SESSION_TTL = 3600;

/** Enregistre le token dans la liste des sessions de l'utilisateur (pour pouvoir toutes les fermer) */
export async function trackSession(redis, userId, token) {
    await redis.pipeline()
        .sadd("sessions:" + userId, token)
        .expire("sessions:" + userId, SESSION_TTL)
        .exec();
}

/** Ferme toutes les sessions de l'utilisateur, sauf éventuellement celle passée en paramètre */
export async function revokeSessions(redis, userId, exceptToken = null) {
    const tokens = (await redis.smembers("sessions:" + userId)).filter(token => token !== exceptToken);
    const pipeline = redis.pipeline();
    if (tokens.length > 0) {
        pipeline.del(...tokens);
    }
    pipeline.del("sessions:" + userId);
    if (exceptToken) {
        pipeline.sadd("sessions:" + userId, exceptToken).expire("sessions:" + userId, SESSION_TTL);
    }
    await pipeline.exec();
}
