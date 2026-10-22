import { sql } from "@vercel/postgres";
import { Redis } from '@upstash/redis';
import {getConnecterUser, jsonResponse, unauthorizedResponse} from "../lib/session";
import {ROOMS_REV_KEY} from "../lib/conversation";

export const config = {
    runtime: 'edge',
};

const redis = Redis.fromEnv();

export default async function handler(request) {
    try {
        const user = await getConnecterUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        if (request.method === "POST") {
            // Création dynamique d'un salon
            const {name} = await request.json();
            const roomName = name?.trim();
            if (!roomName || roomName.length > 50) {
                return jsonResponse({code: "BAD_REQUEST", message: "Nom de salon invalide"}, 400);
            }
            const {rowCount} = await sql`select 1 from rooms where lower(name) = lower(${roomName})`;
            if (rowCount > 0) {
                return jsonResponse({code: "CONFLICT", message: "Ce salon existe déjà"}, 409);
            }
            const {rows} = await sql`insert into rooms (name, created_on, created_by) values (${roomName}, now(), ${user.id})
                returning room_id, name, created_by, TO_CHAR(created_on, 'DD/MM/YYYY HH24:MI') as created_on`;
            await redis.incr(ROOMS_REV_KEY);
            return jsonResponse(rows[0]);
        }

        const {rows} = await sql`select room_id, name, created_by, TO_CHAR(created_on, 'DD/MM/YYYY HH24:MI') as created_on from rooms order by name`;
        return jsonResponse(rows);
    } catch (error) {
        console.log(error);
        return jsonResponse({code: "SERVER_ERROR", message: "Erreur lors de la récupération des salons"}, 500);
    }
}
