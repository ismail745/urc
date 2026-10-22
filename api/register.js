import { db } from '@vercel/postgres';
import { Redis } from '@upstash/redis';
import {arrayBufferToBase64, stringToArrayBuffer} from "../lib/base64";
import {jsonResponse, SESSION_TTL, trackSession} from "../lib/session";
import {USERS_REV_KEY} from "../lib/conversation";

export const config = {
    runtime: 'edge',
};

const redis = Redis.fromEnv();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(request) {
    try {
        const {username, email, password} = await request.json();

        // Contrôle des champs
        if (!username?.trim() || !email?.trim() || !password) {
            return jsonResponse({code: "BAD_REQUEST", message: "Tous les champs sont obligatoires"}, 400);
        }
        if (username.length > 50 || !EMAIL_REGEX.test(email)) {
            return jsonResponse({code: "BAD_REQUEST", message: "Identifiant ou email invalide"}, 400);
        }
        if (password.length < 6) {
            return jsonResponse({code: "BAD_REQUEST", message: "Le mot de passe doit faire au moins 6 caractères"}, 400);
        }

        const client = await db.connect();
        try {
            // Unicité du username et de l'email
            const {rowCount} = await client.sql`select 1 from users where username = ${username} or email = ${email}`;
            if (rowCount > 0) {
                return jsonResponse({code: "CONFLICT", message: "Cet identifiant ou cet email est déjà utilisé"}, 409);
            }

            const hash = await crypto.subtle.digest('SHA-256', stringToArrayBuffer(username + password));
            const hashed64 = arrayBufferToBase64(hash);
            const externalId = crypto.randomUUID().toString();

            const {rows} = await client.sql`insert into users (username, password, email, created_on, last_login, external_id)
                values (${username}, ${hashed64}, ${email}, now(), now(), ${externalId})
                returning user_id`;

            // Connexion automatique : même logique que le service login
            const token = crypto.randomUUID().toString();
            const user = {id: rows[0].user_id, username: username, email: email, externalId: externalId};
            await redis.set(token, user, { ex: SESSION_TTL });
            await trackSession(redis, user.id, token);
            const userInfo = {};
            userInfo[user.id] = user;
            await redis.hset("users", userInfo);
            await redis.incr(USERS_REV_KEY);

            return jsonResponse({token: token, username: username, externalId: externalId, id: user.id});
        } finally {
            client.release();
        }
    } catch (error) {
        console.log(error);
        return jsonResponse({code: "SERVER_ERROR", message: "Erreur lors de l'inscription"}, 500);
    }
}
