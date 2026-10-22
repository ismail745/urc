import {Client, TokenProvider} from "@pusher/push-notifications-web";
import {AUTHENT_HEADER, BEARER} from "../model/common";
import type {Session} from "../model/common";

let beamsClient: Client | null = null;

export interface PushResult {
    enabled: boolean;
    error: string | null;
}

/**
 * Active les notifications push Pusher Beams pour l'utilisateur connecté.
 * askPermission : demande l'autorisation à l'utilisateur. Chrome bloque (ou affiche discrètement) les demandes
 * faites sans action de l'utilisateur : on ne la demande donc qu'au clic sur la cloche.
 */
export async function startPush(session: Session, askPermission: boolean): Promise<PushResult> {
    if (!("serviceWorker" in navigator) || !("Notification" in window)) {
        return {enabled: false, error: "Ce navigateur ne gère pas les notifications"};
    }

    const permission = askPermission ? await window.Notification.requestPermission() : window.Notification.permission;
    if (permission !== "granted") {
        return {enabled: false, error: permission === "denied" ? "Notifications bloquées pour ce site" : null};
    }

    const instanceId = import.meta.env.VITE_PUSHER_INSTANCE_ID as string | undefined;
    if (!instanceId) {
        return {enabled: false, error: "Push non configuré (VITE_PUSHER_INSTANCE_ID)"};
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
        return {enabled: true, error: null};
    } catch (error) {
        // Ex. sous Chrome : "Registration failed - push service error" si le service push de Google
        // est inaccessible (réseau filtré, Chromium sans clés Google...)
        console.error(error);
        return {enabled: false, error: error instanceof Error ? error.message : String(error)};
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
