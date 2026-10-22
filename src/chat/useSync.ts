import {useEffect} from "react";
import {useNavigate} from "react-router-dom";
import {fetchMessages, fetchUsers, sync} from "../api/chatApi";
import {useChatStore} from "../store/chatStore";
import {conversationKey} from "../model/common";
import type {Conversation, InboxEntry, SyncState} from "../model/common";

const VISIBLE_INTERVAL = 5000;
const HIDDEN_INTERVAL = 15000;

interface WorkerMessage {
    kind?: string;
    messageId?: string;
    path?: string;
}

function parseKey(key: string): Conversation | null {
    const [type, id] = key.split(":");
    const numericId = Number(id);
    if ((type === "user" || type === "room") && Number.isInteger(numericId)) {
        return {type, id: numericId};
    }
    return null;
}

function conversationPath(conversation: Conversation) {
    return `/messages/${conversation.type}/${conversation.id}`;
}

/**
 * Notification affichée par l'onglet lui-même : fonctionne dès que la permission est accordée,
 * même si l'abonnement Web Push a échoué (cas fréquent sous Chrome).
 */
async function showLocalNotification(entry: InboxEntry, path: string, navigate: (path: string) => void) {
    if (!("Notification" in window) || window.Notification.permission !== "granted") {
        return;
    }
    const options = {body: entry.body, icon: "/logo192.png", tag: entry.id, data: {url: path}};
    try {
        const registration = await navigator.serviceWorker?.getRegistration();
        if (registration) {
            await registration.showNotification(entry.title, options);
            return;
        }
        const notification = new window.Notification(entry.title, options);
        notification.onclick = () => {
            window.focus();
            navigate(path);
            notification.close();
        };
    } catch (error) {
        console.error(error);
    }
}

/**
 * Synchronisation périodique avec le serveur (heartbeat) :
 * - statut en ligne de l'utilisateur et des autres
 * - détection des nouveaux messages et réactions : rafraîchissement, non-lus et notifications
 * Une notification push reçue par le service worker déclenche une synchronisation immédiate.
 */
export function useSync() {
    const navigate = useNavigate();
    const session = useChatStore(state => state.session);

    useEffect(() => {
        if (!session) {
            return;
        }
        let known: SyncState["activity"] | null = null;
        let usersRev: number | null = null;
        // Messages déjà notifiés par le push : pas de seconde notification
        const notified = new Set<string>();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let stopped = false;

        const apply = (result: SyncState) => {
            const state = useChatStore.getState();
            state.setPresence(result.online, result.lastSeen);

            if (usersRev !== null && result.usersRev !== usersRev) {
                fetchUsers().then(state.setUsers).catch(console.error);
            }
            usersRev = result.usersRev;

            const previous = known;
            known = result.activity;
            if (!previous) {
                return; // premier appel : sert de référence
            }
            const visible = document.visibilityState === "visible";
            Object.entries(result.activity).forEach(([key, entry]) => {
                const conversation = parseKey(key);
                const before = previous[key];
                if (!conversation || (before && before.rev >= entry.rev && before.last?.id === entry.last?.id)) {
                    return;
                }
                const viewing = state.selected !== null && conversationKey(state.selected) === key && visible;
                if (viewing || state.messages[key]) {
                    fetchMessages(conversation).then(messages => state.setMessages(key, messages)).catch(console.error);
                }

                const last = entry.last;
                if (!last || last.id === before?.last?.id || last.senderId === session.id) {
                    return; // pas de nouveau message reçu (réaction, ou message envoyé par soi-même)
                }
                if (!viewing) {
                    state.incrementUnread(key);
                }
                if (conversation.type === "user" && !state.users.some(user => user.user_id === conversation.id)) {
                    fetchUsers().then(state.setUsers).catch(console.error);
                }
                if (!(viewing && document.hasFocus()) && !notified.has(last.id)) {
                    showLocalNotification(last, conversationPath(conversation), navigate);
                }
            });
        };

        // Une seule synchronisation à la fois : une demande pendant un appel en cours est rejouée ensuite
        let running = false;
        let again = false;
        const run = async () => {
            if (running) {
                again = true;
                return;
            }
            running = true;
            clearTimeout(timer);
            try {
                const result = await sync(document.visibilityState === "visible");
                if (!stopped) {
                    apply(result);
                }
            } catch (error) {
                console.error(error);
            }
            running = false;
            if (stopped) {
                return;
            }
            if (again) {
                again = false;
                run();
            } else {
                timer = setTimeout(run, document.visibilityState === "visible" ? VISIBLE_INTERVAL : HIDDEN_INTERVAL);
            }
        };
        run();

        // Retour sur l'onglet : on repasse en ligne immédiatement
        const onVisibility = () => run();
        document.addEventListener("visibilitychange", onVisibility);

        const sw = navigator.serviceWorker;
        const onWorkerMessage = (event: MessageEvent<WorkerMessage>) => {
            const data = event.data;
            if (data?.kind === "navigate" && data.path) {
                navigate(data.path);
            } else if (data?.kind === "push") {
                if (data.messageId) {
                    notified.add(data.messageId);
                }
                run();
            }
        };
        sw?.addEventListener("message", onWorkerMessage);

        return () => {
            stopped = true;
            clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisibility);
            sw?.removeEventListener("message", onWorkerMessage);
        };
    }, [session, navigate]);
}
