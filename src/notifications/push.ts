import {Client, TokenProvider} from "@pusher/push-notifications-web";
import {AUTHENT_HEADER, BEARER} from "../model/common";
import type {Session} from "../model/common";

let beamsClient: Client | null = null;

/**
 * Active les notifications push Pusher Beams pour l'utilisateur connecté.
 * Renvoie false si les notifications ne sont pas disponibles (pas de config, permission refusée, navigateur non supporté).
 */
export async function startPush(session: Session): Promise<boolean> {
    const instanceId = import.meta.env.VITE_PUSHER_INSTANCE_ID as string | undefined;
    if (!instanceId || !("serviceWorker" in navigator) || !("Notification" in window)) {
        console.log("Push notifications indisponibles");
        return false;
    }

    const permission = await window.Notification.requestPermission();
    if (permission !== "granted") {
        console.log("Permission de notification refusée");
        return false;
    }

    try {
        beamsClient = beamsClient || new Client({instanceId});
        const tokenProvider = new TokenProvider({
            url: "/api/beams",
            headers: {[AUTHENT_HEADER]: BEARER + session.token},
        });

        await beamsClient.start();
        await beamsClient.addDeviceInterest("global");
        const currentUserId = await beamsClient.getUserId();
        if (currentUserId && currentUserId !== session.externalId) {
            // Le navigateur était associé à un autre utilisateur
            await beamsClient.clearAllState();
            await beamsClient.addDeviceInterest("global");
        }
        await beamsClient.setUserId(session.externalId, tokenProvider);
        console.log("Push id : " + await beamsClient.getDeviceId());
        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
}

export async function stopPush() {
    if (beamsClient) {
        try {
            await beamsClient.stop();
        } catch (error) {
            console.error(error);
        }
    }
}
