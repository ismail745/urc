import * as PusherServer from "@pusher/push-notifications-server";

// Compatible ESM (vercel dev) et CommonJS (build Vercel)
const PushNotifications = PusherServer.default || PusherServer;

/** URL de base du site, pour les liens des notifications (requête Node.js) */
export function getBaseUrl(request) {
    const proto = request.headers["x-forwarded-proto"] || "https";
    return proto + "://" + request.headers.host;
}

/** Envoi d'une notification push Pusher Beams aux utilisateurs donnés (external_id) */
export async function sendPush(externalIds, notification, data) {
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
        // Une erreur de notification ne doit pas faire échouer la requête
        console.log("Push error", error);
    }
}
