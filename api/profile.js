import { neon } from "@neondatabase/serverless";
import { Redis } from '@upstash/redis';
import { del } from '@vercel/blob';
import {getConnecterUser, getToken, jsonResponse, revokeSessions, SESSION_TTL, unauthorizedResponse} from "../lib/session.js";
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

async function hashPassword(username, password) {
    const hash = await crypto.subtle.digest('SHA-256', stringToArrayBuffer(username + password));
    return arrayBufferToBase64(hash);
}

/**
 * Modification du nom d'utilisateur et / ou du mot de passe : PATCH /api/profile
 * body : {currentPassword: string, username?: string, newPassword?: string}
 * Le mot de passe est haché avec le nom d'utilisateur : changer le nom impose de recalculer le hash.
 * Un changement de mot de passe ferme les sessions ouvertes sur les autres appareils.
 */
export async function PATCH(request) {
    try {
        const user = await getConnecterUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        const {currentPassword, username, newPassword} = await request.json().catch(() => ({}));
        const rows = await sql`select username, password from users where user_id = ${user.id}`;
        if (rows.length === 0) {
            return unauthorizedResponse();
        }
        const current = rows[0];
        if (current.password !== await hashPassword(current.username, currentPassword || "")) {
            return jsonResponse({code: "UNAUTHORIZED_PASSWORD", message: "Mot de passe actuel incorrect"}, 403);
        }

        const newUsername = (username ?? current.username).trim();
        if (!newUsername || newUsername.length > 50) {
            return jsonResponse({code: "BAD_REQUEST", message: "Nom d'utilisateur invalide (50 caractères max)"}, 400);
        }
        if (newPassword && newPassword.length < 6) {
            return jsonResponse({code: "BAD_REQUEST", message: "Le mot de passe doit faire au moins 6 caractères"}, 400);
        }
        if (newUsername !== current.username) {
            const taken = await sql`select 1 from users where username = ${newUsername} and user_id <> ${user.id}`;
            if (taken.length > 0) {
                return jsonResponse({code: "CONFLICT", message: "Ce nom d'utilisateur est déjà utilisé"}, 409);
            }
        }

        const password = await hashPassword(newUsername, newPassword || currentPassword);
        await sql`update users set username = ${newUsername}, password = ${password} where user_id = ${user.id}`;

        // Mise à jour de la session courante, fermeture des autres si le mot de passe a changé
        const token = getToken(request);
        const updated = {...user, username: newUsername};
        await redis.set(token, updated, {ex: SESSION_TTL});
        await redis.hset("users", {[user.id]: updated});
        if (newPassword) {
            await revokeSessions(redis, user.id, token);
        }
        await redis.incr(USERS_REV_KEY);

        return jsonResponse({username: newUsername});
    } catch (error) {
        console.log(error);
        return jsonResponse({code: "SERVER_ERROR", message: "Erreur lors de la modification du profil"}, 500);
    }
}

/**
 * Suppression d'un compte : DELETE /api/profile
 * - body {password} : suppression de son propre compte, le mot de passe est redemandé pour confirmer
 * - ?id=xxx : suppression d'un utilisateur par un administrateur (impossible sur un autre administrateur)
 * Les messages privés et les réactions de l'utilisateur sont supprimés, ses messages dans les salons sont conservés.
 */
export async function DELETE(request) {
    try {
        const user = await getConnecterUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        const targetParam = new URL(request.url).searchParams.get("id");
        let target;
        if (targetParam !== null && Number(targetParam) !== Number(user.id)) {
            const admins = await sql`select 1 from users where user_id = ${user.id} and is_admin`;
            if (admins.length === 0) {
                return jsonResponse({code: "FORBIDDEN", message: "Réservé aux administrateurs"}, 403);
            }
            const rows = await sql`select user_id, avatar, external_id, is_admin from users where user_id = ${Number(targetParam)}`;
            if (rows.length === 0) {
                return jsonResponse({code: "NOT_FOUND", message: "Utilisateur introuvable"}, 404);
            }
            if (rows[0].is_admin) {
                return jsonResponse({code: "FORBIDDEN", message: "Impossible de supprimer un administrateur"}, 403);
            }
            target = rows[0];
        } else {
            const {password} = await request.json().catch(() => ({}));
            const rows = await sql`select user_id, username, password, avatar, external_id from users where user_id = ${user.id}`;
            if (rows.length !== 1 || rows[0].password !== await hashPassword(rows[0].username, password || "")) {
                return jsonResponse({code: "UNAUTHORIZED_PASSWORD", message: "Mot de passe incorrect"}, 403);
            }
            target = rows[0];
        }

        await deleteUser(target);
        return jsonResponse({ok: true});
    } catch (error) {
        console.log(error);
        return jsonResponse({code: "SERVER_ERROR", message: "Erreur lors de la suppression du compte"}, 500);
    }
}

/** Supprime un utilisateur, ses données et ferme toutes ses sessions */
async function deleteUser(target) {
    const userId = Number(target.user_id);
    const others = await sql`select user_id from users where user_id <> ${userId}`;
    await sql`delete from users where user_id = ${userId}`;

    // Conversations privées (dans les 2 sens, la clé est commune), boîte de réception et présence
    const keys = ["inbox:" + userId, "rev:" + userId, conversationKey("user", userId, userId)];
    others.forEach(other => {
        const key = conversationKey("user", userId, other.user_id);
        keys.push(key, key.replace("messages:", "reactions:"));
    });
    keys.push(conversationKey("user", userId, userId).replace("messages:", "reactions:"));
    const pipeline = redis.pipeline();
    for (let i = 0; i < keys.length; i += 500) {
        pipeline.del(...keys.slice(i, i + 500));
    }
    others.forEach(other => pipeline.hdel("inbox:" + other.user_id, "user:" + userId));
    others.forEach(other => pipeline.hdel("rev:" + other.user_id, "user:" + userId));
    pipeline.zrem(PRESENCE_KEY, String(userId));
    pipeline.hdel("users", String(userId));
    pipeline.incr(USERS_REV_KEY);
    await pipeline.exec();
    await revokeSessions(redis, userId);

    await deleteBlob(target.avatar);

    // Désinscription des notifications push sur tous les appareils de l'utilisateur
    if (process.env.PUSHER_INSTANCE_ID && process.env.PUSHER_SECRET_KEY) {
        try {
            const beamsClient = new PushNotifications({
                instanceId: process.env.PUSHER_INSTANCE_ID,
                secretKey: process.env.PUSHER_SECRET_KEY,
            });
            await beamsClient.deleteUser(target.external_id);
        } catch (error) {
            console.log("Beams delete error", error);
        }
    }
}
