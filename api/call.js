import { neon } from "@neondatabase/serverless";
import { Redis } from '@upstash/redis';
import {getConnecterUser, triggerNotConnected} from "../lib/session.js";
import {getBaseUrl, sendPush} from "../lib/push.js";

const redis = Redis.fromEnv();
const sql = neon(process.env.POSTGRES_URL);

/** Durée de sonnerie maximale, et durée de conservation d'un appel */
const RING_TTL = 60;
const CALL_TTL = 4 * 3600;
/** Après la fin d'un appel, l'état reste lisible quelques instants pour que l'autre participant le voie */
const ENDED_TTL = 120;

const MAX_SDP_LENGTH = 20000;

/**
 * Signalisation des appels audio / vidéo WebRTC.
 * Un appel est stocké dans Redis (call:<id>), l'appel en cours de chaque participant dans calls:user:<userId>.
 * La connexion audio / vidéo est ensuite directe entre les 2 navigateurs (pair à pair).
 *
 * GET /api/call?id=xxx : état de l'appel (avec offre et réponse SDP)
 * POST /api/call body :
 *  - {action: "start", to: number, video: boolean, offer: string} : appelle un utilisateur
 *  - {action: "answer", callId: string, answer: string} : décroche
 *  - {action: "end", callId: string} : refuse, annule ou raccroche
 */
export default async (request, response) => {
    try {
        const user = await getConnecterUser(request);
        if (!user) {
            triggerNotConnected(response);
            return;
        }

        if (request.method === "GET") {
            const call = await redis.get("call:" + request.query.id);
            if (!call || !isParticipant(call, user)) {
                response.status(404).json({code: "NOT_FOUND", message: "Appel introuvable"});
                return;
            }
            response.status(200).json(call);
            return;
        }

        const body = await request.body;
        switch (body?.action) {
            case "start":
                return await start(request, response, user, body);
            case "answer":
                return await answer(response, user, body);
            case "end":
                return await end(response, user, body);
            default:
                response.status(400).json({code: "BAD_REQUEST", message: "Action inconnue"});
        }
    } catch (error) {
        console.log(error);
        response.status(500).json({code: "SERVER_ERROR", message: "Erreur lors de l'appel"});
    }
};

function isParticipant(call, user) {
    return call.from.id === Number(user.id) || call.to.id === Number(user.id);
}

function publicCall(call) {
    const {offer, answer, ...rest} = call;
    return rest;
}

async function start(request, response, user, {to, video, offer}) {
    const targetId = Number(to);
    if (!Number.isInteger(targetId) || targetId === Number(user.id) || typeof offer !== "string" || offer.length > MAX_SDP_LENGTH) {
        response.status(400).json({code: "BAD_REQUEST", message: "Appel invalide"});
        return;
    }
    const rows = await sql`select username, external_id from users where user_id = ${targetId}`;
    if (rows.length === 0) {
        response.status(404).json({code: "NOT_FOUND", message: "Utilisateur inconnu"});
        return;
    }

    // L'utilisateur appelé est déjà en communication
    const busy = await redis.get("calls:user:" + targetId);
    if (busy) {
        const current = await redis.get("call:" + busy);
        if (current && (current.status === "ringing" || current.status === "accepted")) {
            response.status(409).json({code: "BUSY", message: rows[0].username + " est déjà en communication"});
            return;
        }
    }

    const call = {
        id: crypto.randomUUID().toString(),
        from: {id: Number(user.id), name: user.username},
        to: {id: targetId, name: rows[0].username},
        video: !!video,
        status: "ringing",
        offer: offer,
        answer: null,
        createdAt: Date.now(),
    };
    await redis.pipeline()
        .set("call:" + call.id, call, {ex: CALL_TTL})
        .set("calls:user:" + targetId, call.id, {ex: RING_TTL})
        .set("calls:user:" + user.id, call.id, {ex: RING_TTL})
        .exec();

    await sendPush([rows[0].external_id], {
        title: (call.video ? "📹 Appel vidéo" : "📞 Appel audio") + " de " + user.username,
        body: "Ouvrez la conversation pour répondre",
        icon: getBaseUrl(request) + "/logo192.png",
        deep_link: getBaseUrl(request) + "/messages/user/" + user.id,
    }, {
        kind: "call",
        callId: call.id,
        // utilisé comme tag de la notification
        messageId: call.id,
    });

    response.status(200).json(publicCall(call));
}

async function answer(response, user, {callId, answer}) {
    const call = await redis.get("call:" + callId);
    if (!call || call.to.id !== Number(user.id)) {
        response.status(404).json({code: "NOT_FOUND", message: "Appel introuvable"});
        return;
    }
    if (call.status !== "ringing" || typeof answer !== "string" || answer.length > MAX_SDP_LENGTH) {
        response.status(409).json({code: "CONFLICT", message: "Cet appel est terminé"});
        return;
    }
    const updated = {...call, status: "accepted", answer, answeredAt: Date.now()};
    await redis.pipeline()
        .set("call:" + callId, updated, {ex: CALL_TTL})
        .set("calls:user:" + call.from.id, callId, {ex: CALL_TTL})
        .set("calls:user:" + call.to.id, callId, {ex: CALL_TTL})
        .exec();
    response.status(200).json(publicCall(updated));
}

async function end(response, user, {callId}) {
    const call = await redis.get("call:" + callId);
    if (!call || !isParticipant(call, user)) {
        response.status(404).json({code: "NOT_FOUND", message: "Appel introuvable"});
        return;
    }
    if (call.status === "ringing" || call.status === "accepted") {
        // Refus par l'appelé, annulation par l'appelant, ou fin de communication
        const status = call.status === "accepted" ? "ended" : call.to.id === Number(user.id) ? "rejected" : "missed";
        const updated = {...call, status, endedAt: Date.now()};
        const pipeline = redis.pipeline().set("call:" + callId, updated, {ex: ENDED_TTL});
        [call.from.id, call.to.id].forEach(id => pipeline.eval(
            // Ne supprime l'appel en cours du participant que s'il s'agit bien de celui-ci
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
            ["calls:user:" + id], [callId]));
        await pipeline.exec();
        response.status(200).json(publicCall(updated));
        return;
    }
    response.status(200).json(publicCall(call));
}
