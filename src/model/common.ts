import {CustomError} from "./CustomError";

export const AUTHENT_HEADER = "Authorization";
export const BEARER = "Bearer ";

export interface User {
    user_id: number;
    username: string;
    email?: string;
    password: string;
    last_login?: string;
    external_id?: string;
}

/** Données publiques d'un utilisateur, renvoyées par /api/users */
export interface PublicUser {
    user_id: number;
    username: string;
    avatar: string | null;
    /** Administrateur : peut supprimer tous les utilisateurs et tous les salons */
    is_admin: boolean;
    last_login: string | null;
}

export interface Room {
    room_id: number;
    name: string;
    created_on: string;
    /** Identifiant du créateur, seul autorisé à supprimer le salon */
    created_by: number;
}

export interface Message {
    id: string;
    senderId: number;
    senderName: string;
    content: string;
    image: string | null;
    /** Message vocal : chemin du fichier et durée en secondes */
    audio?: string | null;
    duration?: number | null;
    timestamp: number;
    /** Réactions : emoji -> identifiants des utilisateurs */
    reactions?: Reactions;
}

export type Reactions = Record<string, number[]>;

export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/** Dernier message reçu dans une conversation (boîte de réception côté serveur) */
export interface InboxEntry {
    id: string;
    senderId: number;
    title: string;
    body: string;
    timestamp: number;
}

/** Réponse du heartbeat /api/presence */
export interface SyncState {
    online: number[];
    lastSeen: Record<number, number>;
    /** Clé de conversation ("user:3", "room:1") -> dernière modification et dernier message reçu */
    activity: Record<string, { rev: number, last?: InboxEntry }>;
    usersRev: number;
    roomsRev: number;
    incomingCall: IncomingCall | null;
}

export interface CallParty {
    id: number;
    name: string;
}

export type CallStatus = "ringing" | "accepted" | "rejected" | "missed" | "ended";

/** Appel audio / vidéo, tel que stocké par /api/call */
export interface Call {
    id: string;
    from: CallParty;
    to: CallParty;
    video: boolean;
    status: CallStatus;
    offer?: string;
    answer?: string | null;
    createdAt: number;
}

export interface IncomingCall {
    id: string;
    from: CallParty;
    video: boolean;
    createdAt: number;
}

export type ConversationType = "user" | "room";

export interface Conversation {
    type: ConversationType;
    id: number;
}

export interface Session {
    token: string;
    username?: string;
    id?: number;
    externalId: string;
}


export interface EmptyCallback {
    (): void;
}

export interface SessionCallback {
    (session: Session): void;
}


export interface ErrorCallback {
    (error: CustomError): void;
}

export function conversationKey(conversation: Conversation): string {
    return conversation.type + ":" + conversation.id;
}
