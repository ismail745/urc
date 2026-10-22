import { Redis } from '@upstash/redis';
import {getConnecterUser, jsonResponse, unauthorizedResponse} from "../lib/session";
import {ONLINE_WINDOW, PRESENCE_KEY, USERS_REV_KEY} from "../lib/conversation";

export const config = {
    runtime: 'edge',
};

const redis = Redis.fromEnv();

/**
 * Heartbeat envoyé régulièrement par les onglets ouverts : POST /api/presence
 * body : {active: boolean} — active = onglet visible (l'utilisateur est alors "en ligne")
 *
 * Réponse :
 * - online : identifiants des utilisateurs en ligne
 * - lastSeen : date de dernière activité par utilisateur
 * - activity : pour chaque conversation, date de dernière modification et dernier message reçu
 * - usersRev : version de la liste des utilisateurs
 */
export default async function handler(request) {
    try {
        const user = await getConnecterUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        const {active} = await request.json().catch(() => ({active: true}));
        const now = Date.now();

        const pipeline = redis.pipeline();
        if (active) {
            pipeline.zadd(PRESENCE_KEY, {score: now, member: String(user.id)});
        }
        pipeline.zrange(PRESENCE_KEY, 0, -1, {withScores: true});
        pipeline.hgetall("inbox:" + user.id);
        pipeline.hgetall("inbox:rooms");
        pipeline.hgetall("rev:" + user.id);
        pipeline.hgetall("rev:rooms");
        pipeline.get(USERS_REV_KEY);
        const results = await pipeline.exec();
        const [presence, inbox, roomsInbox, rev, roomsRev, usersRev] = active ? results.slice(1) : results;

        const lastSeen = {};
        const online = [];
        for (let i = 0; i < presence.length; i += 2) {
            const id = Number(presence[i]);
            const score = Number(presence[i + 1]);
            lastSeen[id] = score;
            if (now - score < ONLINE_WINDOW) {
                online.push(id);
            }
        }

        const activity = {};
        Object.entries({...roomsRev, ...rev}).forEach(([key, value]) => {
            activity[key] = {rev: Number(value)};
        });
        Object.entries({...roomsInbox, ...inbox}).forEach(([key, last]) => {
            activity[key] = {rev: Math.max(activity[key]?.rev || 0, last.timestamp), last};
        });

        return jsonResponse({online, lastSeen, activity, usersRev: Number(usersRev || 0)});
    } catch (error) {
        console.log(error);
        return jsonResponse({code: "SERVER_ERROR", message: "Erreur lors de la synchronisation"}, 500);
    }
}
