import { get } from '@vercel/blob';
import {getConnecterUser, jsonResponse, unauthorizedResponse} from "../lib/session.js";

/**
 * Lecture d'une image du store Blob privé : GET /api/image?path=images/xxx
 * Seuls les utilisateurs connectés peuvent y accéder.
 */
export async function GET(request) {
    try {
        const user = await getConnecterUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        const path = new URL(request.url).searchParams.get("path");
        if (!path || !path.startsWith("images/") || path.includes("..")) {
            return jsonResponse({code: "BAD_REQUEST", message: "Chemin invalide"}, 400);
        }

        const result = await get(path, {access: 'private'});
        if (!result || result.statusCode !== 200) {
            return jsonResponse({code: "NOT_FOUND", message: "Image introuvable"}, 404);
        }
        return new Response(result.stream, {
            status: 200,
            headers: {
                'content-type': result.blob.contentType,
                'cache-control': 'private, max-age=86400',
            },
        });
    } catch (error) {
        console.log(error);
        return jsonResponse({code: "SERVER_ERROR", message: "Erreur lors de la lecture de l'image"}, 500);
    }
}
