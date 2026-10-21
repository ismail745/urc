import { Redis } from '@upstash/redis';
import {getToken, jsonResponse} from "../lib/session";

export const config = {
    runtime: 'edge',
};

const redis = Redis.fromEnv();

export default async function handler(request) {
    try {
        const token = getToken(request);
        if (token) {
            await redis.del(token);
        }
        return jsonResponse({ok: true});
    } catch (error) {
        console.log(error);
        return jsonResponse({code: "SERVER_ERROR", message: "Erreur lors de la déconnexion"}, 500);
    }
}
