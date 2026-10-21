import {AUTHENT_HEADER, BEARER} from "../model/common";
import {CustomError} from "../model/CustomError";
import {useChatStore} from "../store/chatStore";

async function toError(response: Response): Promise<CustomError> {
    let message = "Erreur " + response.status;
    let code: string | undefined;
    try {
        const body = await response.json();
        message = body.message || message;
        code = body.code;
    } catch {
        // corps non JSON
    }
    const error = new CustomError(message);
    error.code = code;
    error.httpStatus = response.status;
    return error;
}

/**
 * Appel d'un service API avec le token de session en header Authorization.
 * En cas de 401, la session est expirée : on la supprime, ce qui renvoie vers la page de connexion.
 */
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const session = useChatStore.getState().session;
    const headers = new Headers(options.headers);
    if (session) {
        headers.set(AUTHENT_HEADER, BEARER + session.token);
    }
    if (options.body && typeof options.body === "string" && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, {...options, headers});
    if (response.status === 401 && session) {
        useChatStore.getState().clearSession();
    }
    if (!response.ok) {
        throw await toError(response);
    }
    return response;
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
    return await (await authFetch(url, options)).json() as T;
}

/** Téléchargement d'un fichier (ex : image privée) avec le token de session */
export async function apiFetchBlob(url: string): Promise<Blob> {
    return await (await authFetch(url)).blob();
}
