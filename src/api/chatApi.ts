import {apiFetch, apiFetchBlob} from "./http";
import type {Conversation, Message, PublicUser, Room} from "../model/common";

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

export function sendMessage(conversation: Conversation, content: string, image?: string) {
    return apiFetch<Message>("/api/message", {
        method: "POST",
        body: JSON.stringify({type: conversation.type, targetId: conversation.id, content, image}),
    });
}

export function uploadImage(file: File) {
    return apiFetch<{ url: string }>("/api/upload", {
        method: "POST",
        headers: {"Content-Type": file.type, "x-filename": file.name},
        body: file,
    });
}

export function fetchImage(path: string) {
    return apiFetchBlob("/api/image?path=" + encodeURIComponent(path));
}
