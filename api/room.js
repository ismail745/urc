import { neon } from "@neondatabase/serverless";
import { Redis } from '@upstash/redis';
import { del } from '@vercel/blob';
import {getConnecterUser, jsonResponse, unauthorizedResponse} from "../lib/session.js";
import {conversationKey, reactionsKey, ROOMS_REV_KEY} from "../lib/conversation.js";

const redis = Redis.fromEnv();
const sql = neon(process.env.POSTGRES_URL);

/**
 * Suppression d'un salon par son créateur : DELETE /api/room?id=xxx
 * Les messages du salon, leurs réactions et leurs fichiers (images, messages vocaux) sont supprimés.
 */
export async function DELETE(request) {
    try {
        const user = await getConnecterUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        const roomId = Number(new URL(request.url).searchParams.get("id"));
        if (!Number.isInteger(roomId) || roomId <= 0) {
            return jsonResponse({code: "BAD_REQUEST", message: "Salon invalide"}, 400);
        }
        const rooms = await sql`select created_by from rooms where room_id = ${roomId}`;
        if (rooms.length === 0) {
            return jsonResponse({code: "NOT_FOUND", message: "Salon introuvable"}, 404);
        }
        if (Number(rooms[0].created_by) !== Number(user.id)) {
            return jsonResponse({code: "FORBIDDEN", message: "Seul le créateur du salon peut le supprimer"}, 403);
        }

        const key = conversationKey("room", user.id, roomId);
        const messages = await redis.lrange(key, 0, -1);
        await sql`delete from rooms where room_id = ${roomId}`;
        await redis.pipeline()
            .del(key, reactionsKey("room", user.id, roomId))
            .hdel("inbox:rooms", "room:" + roomId)
            .hdel("rev:rooms", "room:" + roomId)
            .incr(ROOMS_REV_KEY)
            .exec();

        const files = messages.flatMap(message => [message.image, message.audio]).filter(Boolean);
        if (files.length > 0) {
            try {
                await del(files);
            } catch (error) {
                // Les fichiers orphelins ne doivent pas faire échouer la suppression
                console.log("Blob delete error", error);
            }
        }

        return jsonResponse({ok: true});
    } catch (error) {
        console.log(error);
        return jsonResponse({code: "SERVER_ERROR", message: "Erreur lors de la suppression du salon"}, 500);
    }
}
