import { Redis } from '@upstash/redis';
import {getConnecterUser, jsonResponse, unauthorizedResponse} from "../lib/session";
import {activityTarget, groupReactions, isValidType, MESSAGE_TTL, REACTIONS, reactionsKey} from "../lib/conversation";

export const config = {
    runtime: 'edge',
};

const redis = Redis.fromEnv();

const UUID_REGEX = /^[0-9a-f-]{36}$/i;

/**
 * Réaction à un message : POST /api/reaction
 * body : {type: "user"|"room", targetId: number, messageId: string, emoji: string|null}
 * Comme sur WhatsApp, un utilisateur a au plus une réaction par message : emoji null la retire.
 * Renvoie les réactions à jour du message : {emoji: [userId, ...]}
 */
export default async function handler(request) {
    try {
        const user = await getConnecterUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        const {type, targetId, messageId, emoji} = await request.json();
        if (!isValidType(type) || !targetId || !UUID_REGEX.test(messageId || "") || (emoji && !REACTIONS.includes(emoji))) {
            return jsonResponse({code: "BAD_REQUEST", message: "Réaction invalide"}, 400);
        }

        // La clé est calculée avec l'utilisateur connecté : impossible de réagir dans une conversation privée d'autrui
        const key = reactionsKey(type, user.id, targetId);
        const field = messageId + ":" + user.id;
        if (emoji) {
            await redis.hset(key, {[field]: emoji});
            await redis.expire(key, MESSAGE_TTL);
        } else {
            await redis.hdel(key, field);
        }

        // Signale la modification aux autres participants pour qu'ils rafraîchissent la conversation
        if (!(type === "user" && Number(targetId) === Number(user.id))) {
            const target = activityTarget(type, user.id, targetId);
            await redis.hset("rev:" + target.suffix, {[target.field]: Date.now()});
        }

        const reactions = groupReactions(await redis.hgetall(key));
        return jsonResponse(reactions[messageId] || {});
    } catch (error) {
        console.log(error);
        return jsonResponse({code: "SERVER_ERROR", message: "Erreur lors de l'ajout de la réaction"}, 500);
    }
}
