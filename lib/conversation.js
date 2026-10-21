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
