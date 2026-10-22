import { Redis } from '@upstash/redis';
import {getConnecterUser, jsonResponse, unauthorizedResponse} from "../lib/session";
import {conversationKey, groupReactions, isValidType, reactionsKey} from "../lib/conversation";

export const config = {
    runtime: 'edge',
};

const redis = Redis.fromEnv();

/**
 * Liste des messages d'une conversation : GET /api/messages?type=user|room&id=xxx
 */
export default async function handler(request) {
    try {
        const user = await getConnecterUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        const params = new URL(request.url).searchParams;
        const type = params.get("type");
        const id = params.get("id");
        if (!isValidType(type) || !id) {
            return jsonResponse({code: "BAD_REQUEST", message: "Conversation invalide"}, 400);
        }

        // LPUSH ajoute en tête de liste : on inverse pour avoir l'ordre chronologique
        const [messages, reactions] = await Promise.all([
            redis.lrange(conversationKey(type, user.id, id), 0, 199),
            redis.hgetall(reactionsKey(type, user.id, id)),
        ]);
        const byMessage = groupReactions(reactions);
        return jsonResponse(messages.reverse().map(message => ({...message, reactions: byMessage[message.id] || {}})));
    } catch (error) {
        console.log(error);
        return jsonResponse({code: "SERVER_ERROR", message: "Erreur lors de la récupération des messages"}, 500);
    }
}
