/** Durée de conservation des messages en cache : 24h */
export const MESSAGE_TTL = 24 * 3600;

/**
 * Clé Redis d'une conversation.
 * Pour une conversation privée, la clé est construite à partir des 2 identifiants triés,
 * afin que A -> B et B -> A pointent sur la même liste.
 */
export function conversationKey(type, currentUserId, targetId) {
    if (type === "room") {
        return "messages:room:" + targetId;
    }
    const ids = [Number(currentUserId), Number(targetId)].sort((a, b) => a - b);
    return "messages:user:" + ids[0] + ":" + ids[1];
}

export function isValidType(type) {
    return type === "user" || type === "room";
}

/** Emojis autorisés pour les réactions (comme WhatsApp) */
export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/** Un utilisateur est "en ligne" si son dernier heartbeat date de moins de 30s */
export const ONLINE_WINDOW = 30 * 1000;

/** Sorted set : membre = user_id, score = date du dernier heartbeat (dernière connexion) */
export const PRESENCE_KEY = "presence";

/** Compteur incrémenté à chaque modification de la liste des utilisateurs (inscription, photo, suppression) */
export const USERS_REV_KEY = "users:rev";

/** Clé Redis des réactions d'une conversation (hash : "messageId:userId" -> emoji) */
export function reactionsKey(type, currentUserId, targetId) {
    return conversationKey(type, currentUserId, targetId).replace("messages:", "reactions:");
}

/**
 * Boîte de réception d'un destinataire, utilisée pour les notifications "onglet ouvert" et le rafraîchissement :
 * - inbox:<userId> / inbox:rooms : dernier message reçu par conversation
 * - rev:<userId> / rev:rooms : date de dernière modification par conversation (message ou réaction)
 * Les champs sont les clés de conversation vues par le destinataire ("user:<émetteur>", "room:<id>").
 */
export function activityTarget(type, currentUserId, targetId) {
    if (type === "room") {
        return {suffix: "rooms", field: "room:" + targetId};
    }
    return {suffix: String(targetId), field: "user:" + currentUserId};
}

/** Regroupe le hash des réactions par message : {messageId: {emoji: [userId, ...]}} */
export function groupReactions(hash) {
    const result = {};
    Object.entries(hash || {}).forEach(([field, emoji]) => {
        const separator = field.lastIndexOf(":");
        const messageId = field.substring(0, separator);
        const userId = Number(field.substring(separator + 1));
        const byEmoji = result[messageId] = result[messageId] || {};
        (byEmoji[emoji] = byEmoji[emoji] || []).push(userId);
    });
    return result;
}
