import { Redis } from '@upstash/redis';
import {getToken, jsonResponse} from "../lib/session";
import {ONLINE_WINDOW, PRESENCE_KEY} from "../lib/conversation";

export const config = {
    runtime: 'edge',
};

const redis = Redis.fromEnv();

export default async function handler(request) {
    try {
        const token = getToken(request);
        if (token) {
            const user = await redis.get(token);
            if (user) {
                // Passe immédiatement l'utilisateur hors ligne, en conservant sa date de dernière connexion
                await redis.zadd(PRESENCE_KEY, {score: Date.now() - ONLINE_WINDOW, member: String(user.id)});
                await redis.srem("sessions:" + user.id, token);
            }
            await redis.del(token);
        }
        return jsonResponse({ok: true});
    } catch (error) {
        console.log(error);
        return jsonResponse({code: "SERVER_ERROR", message: "Erreur lors de la déconnexion"}, 500);
    }
}
