import {apiFetch, apiFetchBlob} from "./http";
import type {Call, Conversation, Message, PublicUser, Reactions, Room, SyncState} from "../model/common";

export function fetchUsers() {
    return apiFetch<PublicUser[]>("/api/users");
}

export function fetchRooms() {
    return apiFetch<Room[]>("/api/rooms");
}

export function createRoom(name: string) {
    return apiFetch<Room>("/api/rooms", {method: "POST", body: JSON.stringify({name})});
}

export function fetchMessages(conversation: Conversation) {
    return apiFetch<Message[]>(`/api/messages?type=${conversation.type}&id=${conversation.id}`);
}

export interface Attachments {
    image?: string;
    audio?: string;
    duration?: number;
}

export function sendMessage(conversation: Conversation, content: string, attachments: Attachments = {}) {
    return apiFetch<Message>("/api/message", {
        method: "POST",
        body: JSON.stringify({type: conversation.type, targetId: conversation.id, content, ...attachments}),
    });
}

/** Upload d'une image ou d'un message vocal, renvoie le chemin du fichier */
export function uploadFile(file: Blob, name: string) {
    return apiFetch<{ url: string }>("/api/upload", {
        method: "POST",
        // Les headers HTTP n'acceptent que l'ASCII : le nom du fichier est encodé
        headers: {"Content-Type": file.type, "x-filename": encodeURIComponent(name)},
        body: file,
    });
}

export function uploadImage(file: File) {
    return uploadFile(file, file.name);
}

export function fetchImage(path: string) {
    return apiFetchBlob("/api/image?path=" + encodeURIComponent(path));
}

export function sendReaction(conversation: Conversation, messageId: string, emoji: string | null) {
    return apiFetch<Reactions>("/api/reaction", {
        method: "POST",
        body: JSON.stringify({type: conversation.type, targetId: conversation.id, messageId, emoji}),
    });
}

export function sync(active: boolean) {
    return apiFetch<SyncState>("/api/presence", {method: "POST", body: JSON.stringify({active})});
}

export function updateAvatar(avatar: string | null) {
    return apiFetch<{ avatar: string | null }>("/api/profile", {method: "PUT", body: JSON.stringify({avatar})});
}

export function deleteAccount(password: string) {
    return apiFetch<{ ok: boolean }>("/api/profile", {method: "DELETE", body: JSON.stringify({password})});
}

export function startCall(to: number, video: boolean, offer: string) {
    return apiFetch<Call>("/api/call", {method: "POST", body: JSON.stringify({action: "start", to, video, offer})});
}

export function answerCall(callId: string, answer: string) {
    return apiFetch<Call>("/api/call", {method: "POST", body: JSON.stringify({action: "answer", callId, answer})});
}

export function endCall(callId: string) {
    // keepalive : la requête aboutit même si l'onglet est en train de se fermer
    return apiFetch<Call>("/api/call", {method: "POST", body: JSON.stringify({action: "end", callId}), keepalive: true});
}

export function fetchCall(callId: string) {
    return apiFetch<Call>("/api/call?id=" + encodeURIComponent(callId));
}
