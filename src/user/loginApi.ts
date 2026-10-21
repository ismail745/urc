import type {Session} from "../model/common";
import {apiFetch} from "../api/http";

export function loginUser(username: string, password: string) {
    return apiFetch<Session>("/api/login", {
        method: "POST",
        body: JSON.stringify({username, password}),
    });
}

export function registerUser(username: string, email: string, password: string) {
    return apiFetch<Session>("/api/register", {
        method: "POST",
        body: JSON.stringify({username, email, password}),
    });
}

export function logoutUser() {
    return apiFetch<{ ok: boolean }>("/api/logout", {method: "POST"});
}
