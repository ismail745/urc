import { put } from '@vercel/blob';
import {getConnecterUser, jsonResponse, unauthorizedResponse} from "../lib/session";

export const config = {
    runtime: 'edge',
};

const MAX_SIZE = 4 * 1024 * 1024;

/**
 * Upload d'une image sur Vercel Blob : POST /api/upload
 * Le corps de la requête contient directement le fichier, le nom est passé dans le header x-filename.
 * Le store est privé : on renvoie le chemin du blob, l'image est ensuite servie par /api/image.
 */
export default async function handler(request) {
    try {
        const user = await getConnecterUser(request);
        if (!user) {
            return unauthorizedResponse();
        }

        const contentType = request.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) {
            return jsonResponse({code: "BAD_REQUEST", message: "Seules les images sont acceptées"}, 400);
        }
        const length = Number(request.headers.get("content-length") || 0);
        if (length > MAX_SIZE) {
            return jsonResponse({code: "BAD_REQUEST", message: "Image trop volumineuse (4 Mo max)"}, 413);
        }

        const filename = (request.headers.get("x-filename") || "image").replace(/[^a-zA-Z0-9._-]/g, "_");
        const blob = await put("images/" + crypto.randomUUID() + "-" + filename, request.body, {
            access: 'private',
            contentType: contentType,
        });
        return jsonResponse({url: blob.pathname});
    } catch (error) {
        console.log(error);
        return jsonResponse({code: "SERVER_ERROR", message: "Erreur lors de l'upload"}, 500);
    }
}
