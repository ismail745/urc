import { neon } from "@neondatabase/serverless";
import { Redis } from '@upstash/redis';
import { del } from '@vercel/blob';
import {getConnecterUser, getToken, jsonResponse, unauthorizedResponse} from "../lib/session.js";
import {arrayBufferToBase64, stringToArrayBuffer} from "../lib/base64.js";
import {conversationKey, isValidBlobPath, PRESENCE_KEY, USERS_REV_KEY} from "../lib/conversation.js";

import * as PusherServer from "@pusher/push-notifications-server";

// Compatible ESM (vercel dev) et CommonJS (build Vercel)
const PushNotifications = PusherServer.default || PusherServer;

const redis = Redis.fromEnv();
const sql = neon(process.env.POSTGRES_URL);

/** Supprime une image du store Blob, sans faire échouer la requête en cas d'erreur */
async function deleteBlob(path) {
    if (!path) {
        return;
    }
    try {
        await del(path);
    } catch (error) {
        console.log("Blob delete error", error);
    }
}

/**
 * Modification de la photo de profil : PUT /api/profile
 * body : {avatar: string|null} — chemin renvoyé par /api/upload, ou null pour retirer la photo
 */
export async function PUT(request) {
    try {
        const user = await getConnecterUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        const {avatar} = await request.json();
        if (avatar !== null && !isValidBlobPath(avatar, "images/")) {
            return jsonResponse({code: "BAD_REQUEST", message: "Image invalide"}, 400);
        }

        const rows = await sql`select avatar from users where user_id = ${user.id}`;
        if (rows.length === 0) {
            return jsonResponse({code: "NOT_FOUND", message: "Utilisateur inconnu"}, 404);
        }
        await sql`update users set avatar = ${avatar} where user_id = ${user.id}`;
        if (rows[0].avatar && rows[0].avatar !== avatar) {
            await deleteBlob(rows[0].avatar);
        }
        await redis.incr(USERS_REV_KEY);

        return jsonResponse({avatar});
    } catch (error) {
        console.log(error);
        return jsonResponse({code: "SERVER_ERROR", message: "Erreur lors de la modification du profil"}, 500);
    }
}

/**
 * Suppression du compte de l'utilisateur connecté : DELETE /api/profile
 * body : {password: string} — le mot de passe est redemandé pour confirmer
 * Les messages privés et les réactions de l'utilisateur sont supprimés, ses messages dans les salons sont conservés.
 */
export async function DELETE(request) {
    try {
        const user = await getConnecterUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        const {password} = await request.json().catch(() => ({}));
        const hash = await crypto.subtle.digest('SHA-256', stringToArrayBuffer(user.username + (password || "")));
        const rows = await sql`select avatar from users where user_id = ${user.id} and password = ${arrayBufferToBase64(hash)}`;
        if (rows.length !== 1) {
            return jsonResponse({code: "UNAUTHORIZED_PASSWORD", message: "Mot de passe incorrect"}, 403);
        }

        const others = await sql`select user_id from users where user_id <> ${user.id}`;
        await sql`delete from users where user_id = ${user.id}`;

        // Conversations privées (dans les 2 sens, la clé est commune), boîte de réception, présence et session
        const keys = ["inbox:" + user.id, "rev:" + user.id, conversationKey("user", user.id, user.id)];
        others.forEach(other => {
            const key = conversationKey("user", user.id, other.user_id);
            keys.push(key, key.replace("messages:", "reactions:"));
        });
        keys.push(conversationKey("user", user.id, user.id).replace("messages:", "reactions:"));
        const pipeline = redis.pipeline();
        for (let i = 0; i < keys.length; i += 500) {
            pipeline.del(...keys.slice(i, i + 500));
        }
        others.forEach(other => pipeline.hdel("inbox:" + other.user_id, "user:" + user.id));
        others.forEach(other => pipeline.hdel("rev:" + other.user_id, "user:" + user.id));
        pipeline.zrem(PRESENCE_KEY, String(user.id));
        pipeline.hdel("users", String(user.id));
        pipeline.del(getToken(request));
        pipeline.incr(USERS_REV_KEY);
        await pipeline.exec();

        await deleteBlob(rows[0].avatar);

        // Désinscription des notifications push sur tous les appareils de l'utilisateur
        if (process.env.PUSHER_INSTANCE_ID && process.env.PUSHER_SECRET_KEY) {
            try {
                const beamsClient = new PushNotifications({
                    instanceId: process.env.PUSHER_INSTANCE_ID,
                    secretKey: process.env.PUSHER_SECRET_KEY,
                });
                await beamsClient.deleteUser(user.externalId);
            } catch (error) {
                console.log("Beams delete error", error);
            }
        }

        return jsonResponse({ok: true});
    } catch (error) {
        console.log(error);
        return jsonResponse({code: "SERVER_ERROR", message: "Erreur lors de la suppression du compte"}, 500);
    }
}
