import { neon } from "@neondatabase/serverless";
import { Redis } from '@upstash/redis';
import {getConnecterUser, triggerNotConnected} from "../lib/session.js";
import {conversationKey, isValidType, MESSAGE_TTL} from "../lib/conversation.js";

import * as PusherServer from "@pusher/push-notifications-server";

// Compatible ESM (vercel dev) et CommonJS (build Vercel)
const PushNotifications = PusherServer.default || PusherServer;

const redis = Redis.fromEnv();
const sql = neon(process.env.POSTGRES_URL);

function getBaseUrl(request) {
    const proto = request.headers["x-forwarded-proto"] || "https";
    return proto + "://" + request.headers.host;
}

async function sendPush(externalIds, notification, data) {
    if (!process.env.PUSHER_INSTANCE_ID || !process.env.PUSHER_SECRET_KEY || externalIds.length === 0) {
        return;
    }
    const beamsClient = new PushNotifications({
        instanceId: process.env.PUSHER_INSTANCE_ID,
        secretKey: process.env.PUSHER_SECRET_KEY,
    });
    try {
        // publishToUsers est limité à 1000 utilisateurs par appel
        for (let i = 0; i < externalIds.length; i += 1000) {
            await beamsClient.publishToUsers(externalIds.slice(i, i + 1000), {
                web: {
                    notification: notification,
                    data: data,
                },
            });
        }
    } catch (error) {
        // Une erreur de notification ne doit pas faire échouer l'envoi du message
        console.log("Push error", error);
    }
}

/**
 * Envoi d'un message : POST /api/message
 * body : {type: "user"|"room", targetId: number, content: string, image?: string}
 */
export default async (request, response) => {
    try {
        const user = await getConnecterUser(request);
        if (user === undefined || user === null) {
            console.log("Not connected");
            triggerNotConnected(response);
            return;
        }

        const {type, targetId, content, image} = await request.body;
        const text = (content || "").trim();
        if (!isValidType(type) || !targetId || (!text && !image)) {
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
            timestamp: Date.now(),
        };

        const key = conversationKey(type, user.id, targetId);
        await redis.lpush(key, message);
        await redis.expire(key, MESSAGE_TTL);

        await sendPush(recipients, {
            title: title,
            body: text || "📷 Image",
            ico: "https://www.univ-brest.fr/themes/custom/ubo_parent/favicon.ico",
            deep_link: getBaseUrl(request) + deepLinkPath,
        }, {
            type: type,
            // identifiant de la conversation vu par le destinataire
            conversationId: type === "user" ? String(user.id) : String(targetId),
            senderId: String(user.id),
        });

        response.status(200).json(message);
    } catch (error) {
        console.log(error);
        response.status(500).json({code: "SERVER_ERROR", message: "Erreur lors de l'envoi du message"});
    }
};
