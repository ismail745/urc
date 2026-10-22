import { neon } from "@neondatabase/serverless";
import { Redis } from '@upstash/redis';
import {getConnecterUser, triggerNotConnected} from "../lib/session.js";
import {activityTarget, conversationKey, isValidBlobPath, isValidType, MESSAGE_TTL} from "../lib/conversation.js";

import {getBaseUrl, sendPush} from "../lib/push.js";

const redis = Redis.fromEnv();
const sql = neon(process.env.POSTGRES_URL);

/**
 * Envoi d'un message : POST /api/message
 * body : {type: "user"|"room", targetId: number, content: string, image?: string, audio?: string, duration?: number}
 */
export default async (request, response) => {
    try {
        const user = await getConnecterUser(request);
        if (user === undefined || user === null) {
            console.log("Not connected");
            triggerNotConnected(response);
            return;
        }

        const {type, targetId, content, image, audio, duration} = await request.body;
        const text = (content || "").trim();
        if (!isValidType(type) || !targetId || (!text && !image && !audio)
            || (image && !isValidBlobPath(image, "images/")) || (audio && !isValidBlobPath(audio, "audio/"))) {
            response.status(400).json({code: "BAD_REQUEST", message: "Message invalide"});
            return;
        }
        if (text.length > 2000) {
            response.status(400).json({code: "BAD_REQUEST", message: "Message trop long"});
            return;
        }

        // Vérification de l'existence du destinataire et récupération des utilisateurs à notifier
        let recipients;
        let title;
        let deepLinkPath;
        if (type === "user") {
            const rows = await sql`select external_id from users where user_id = ${targetId}`;
            if (rows.length === 0) {
                response.status(404).json({code: "NOT_FOUND", message: "Utilisateur inconnu"});
                return;
            }
            recipients = Number(targetId) === Number(user.id) ? [] : [rows[0].external_id];
            title = user.username;
            // Côté destinataire, la conversation est celle avec l'émetteur
            deepLinkPath = "/messages/user/" + user.id;
        } else {
            const rooms = await sql`select name from rooms where room_id = ${targetId}`;
            if (rooms.length === 0) {
                response.status(404).json({code: "NOT_FOUND", message: "Salon inconnu"});
                return;
            }
            const rows = await sql`select external_id from users where user_id <> ${user.id}`;
            recipients = rows.map(row => row.external_id);
            title = user.username + " @ " + rooms[0].name;
            deepLinkPath = "/messages/room/" + targetId;
        }

        const message = {
            id: crypto.randomUUID().toString(),
            senderId: user.id,
            senderName: user.username,
            content: text,
            image: image || null,
            audio: audio || null,
            duration: audio && Number.isFinite(duration) ? Math.round(duration) : null,
            timestamp: Date.now(),
        };

        const key = conversationKey(type, user.id, targetId);
        await redis.lpush(key, message);
        await redis.expire(key, MESSAGE_TTL);

        const body = text || (audio ? "🎤 Message vocal" : "📷 Image");
        // Boîte de réception du destinataire : permet aux onglets ouverts de détecter le message
        // même si la notification push n'arrive pas (navigateur sans Web Push, réseau filtré...)
        if (recipients.length > 0) {
            const target = activityTarget(type, user.id, targetId);
            await redis.pipeline()
                .hset("inbox:" + target.suffix, {[target.field]: {id: message.id, senderId: user.id, title, body, timestamp: message.timestamp}})
                .hset("rev:" + target.suffix, {[target.field]: message.timestamp})
                .exec();
        }

        await sendPush(recipients, {
            title: title,
            body: body,
            icon: getBaseUrl(request) + "/logo192.png",
            deep_link: getBaseUrl(request) + deepLinkPath,
        }, {
            type: type,
            // identifiant de la conversation vu par le destinataire
            conversationId: type === "user" ? String(user.id) : String(targetId),
            senderId: String(user.id),
            messageId: message.id,
        });

        response.status(200).json(message);
    } catch (error) {
        console.log(error);
        response.status(500).json({code: "SERVER_ERROR", message: "Erreur lors de l'envoi du message"});
    }
};
