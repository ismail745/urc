import {create} from "zustand";
import {answerCall, endCall, fetchCall, startCall} from "../api/chatApi";
import type {CallParty, IncomingCall} from "../model/common";
import type {CustomError} from "../model/CustomError";
import {startTone, stopTone} from "./tones";

export type CallPhase = "outgoing" | "incoming" | "connecting" | "connected" | "ended";

export interface ActiveCall {
    /** null tant que l'appel sortant n'est pas enregistré côté serveur */
    id: string | null;
    peer: CallParty;
    video: boolean;
    direction: "outgoing" | "incoming";
    phase: CallPhase;
    /** Message affiché à la fin de l'appel */
    endReason?: string;
    connectedAt?: number;
}

interface CallState {
    call: ActiveCall | null;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    muted: boolean;
    cameraOff: boolean;
}

export const useCallStore = create<CallState>()(() => ({
    call: null,
    localStream: null,
    remoteStream: null,
    muted: false,
    cameraOff: false,
}));

/** Durée de sonnerie avant abandon */
const RING_TIMEOUT = 45000;
/** Délai maximal de collecte des candidats ICE (adresses réseau) avant l'envoi de l'offre / la réponse */
const ICE_GATHERING_TIMEOUT = 3000;
const RINGING_POLL = 1000;
const CALL_POLL = 3000;

/**
 * Serveurs STUN publics (découverte de l'adresse publique) et TURN optionnel (relais quand la connexion
 * directe est impossible, ex : réseaux d'entreprise), configurable via les variables VITE_TURN_*.
 */
function iceServers(): RTCIceServer[] {
    const servers: RTCIceServer[] = [{urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]}];
    const turnUrls = import.meta.env.VITE_TURN_URLS as string | undefined;
    if (turnUrls) {
        servers.push({
            urls: turnUrls.split(",").map(url => url.trim()),
            username: import.meta.env.VITE_TURN_USERNAME as string | undefined,
            credential: import.meta.env.VITE_TURN_CREDENTIAL as string | undefined,
        });
    }
    return servers;
}

let peerConnection: RTCPeerConnection | null = null;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let ringTimer: ReturnType<typeof setTimeout> | undefined;
let disconnectTimer: ReturnType<typeof setTimeout> | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
/** Appels déjà traités (refusés, terminés) : la synchronisation ne doit pas les refaire sonner */
const handledCalls = new Set<string>();

function update(partial: Partial<ActiveCall>) {
    useCallStore.setState(state => ({call: state.call ? {...state.call, ...partial} : null}));
}

function currentCall() {
    return useCallStore.getState().call;
}

function isCurrent(id: string | null) {
    const call = currentCall();
    return call !== null && call.phase !== "ended" && call.id === id;
}

async function getMedia(video: boolean) {
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Ce navigateur ne permet pas les appels (connexion HTTPS requise)");
    }
    try {
        return await navigator.mediaDevices.getUserMedia({
            audio: {echoCancellation: true, noiseSuppression: true},
            video: video ? {width: {ideal: 1280}, height: {ideal: 720}, facingMode: "user"} : false,
        });
    } catch (error) {
        const name = (error as DOMException).name;
        if (name === "NotAllowedError") {
            throw new Error(video ? "Accès à la caméra / au micro refusé" : "Accès au micro refusé");
        }
        if (name === "NotFoundError") {
            throw new Error(video ? "Aucune caméra ou micro détecté" : "Aucun micro détecté");
        }
        throw error;
    }
}

function createPeer(stream: MediaStream) {
    const pc = new RTCPeerConnection({iceServers: iceServers()});
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    pc.ontrack = event => {
        useCallStore.setState({remoteStream: event.streams[0] ?? new MediaStream([event.track])});
    };
    pc.onconnectionstatechange = () => {
        if (pc !== peerConnection) {
            return;
        }
        clearTimeout(disconnectTimer);
        if (pc.connectionState === "connected") {
            stopTone();
            update({phase: "connected", connectedAt: currentCall()?.connectedAt ?? Date.now()});
        } else if (pc.connectionState === "failed") {
            hangUp("Connexion impossible avec votre correspondant");
        } else if (pc.connectionState === "disconnected") {
            // Coupure réseau : on laisse quelques secondes à la connexion pour se rétablir
            disconnectTimer = setTimeout(() => hangUp("Connexion perdue"), 8000);
        }
    };
    peerConnection = pc;
    return pc;
}

/** Attend la fin de la collecte des candidats ICE : ils sont alors inclus dans la description SDP envoyée */
function waitIceGathering(pc: RTCPeerConnection) {
    return new Promise<void>(resolve => {
        if (pc.iceGatheringState === "complete") {
            resolve();
            return;
        }
        const timeout = setTimeout(done, ICE_GATHERING_TIMEOUT);
        function done() {
            clearTimeout(timeout);
            pc.removeEventListener("icegatheringstatechange", onChange);
            resolve();
        }
        function onChange() {
            if (pc.iceGatheringState === "complete") {
                done();
            }
        }
        pc.addEventListener("icegatheringstatechange", onChange);
    });
}

/** Suivi de l'état de l'appel côté serveur : décroché, refusé, raccroché par l'autre */
function poll(id: string) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
        if (!isCurrent(id)) {
            return;
        }
        try {
            const call = await fetchCall(id);
            if (!isCurrent(id)) {
                return;
            }
            if (call.status === "accepted" && currentCall()?.direction === "outgoing"
                && call.answer && peerConnection && !peerConnection.remoteDescription) {
                clearTimeout(ringTimer);
                stopTone();
                update({phase: "connecting"});
                await peerConnection.setRemoteDescription({type: "answer", sdp: call.answer});
            } else if (call.status === "rejected") {
                finish(currentCall()?.direction === "outgoing" ? call.to.name + " a refusé l'appel" : "Appel refusé");
                return;
            } else if (call.status === "missed") {
                finish("Appel manqué");
                return;
            } else if (call.status === "ended") {
                finish("Appel terminé");
                return;
            }
        } catch (error) {
            if ((error as CustomError).httpStatus === 404) {
                finish("Appel terminé");
                return;
            }
            console.error(error);
        }
        poll(id);
    }, currentCall()?.phase === "connected" ? CALL_POLL : RINGING_POLL);
}

/** Libère la caméra, le micro et la connexion, puis affiche brièvement la raison de fin d'appel */
function finish(reason?: string) {
    const call = currentCall();
    if (call?.id) {
        handledCalls.add(call.id);
    }
    clearTimeout(pollTimer);
    clearTimeout(ringTimer);
    clearTimeout(disconnectTimer);
    clearTimeout(closeTimer);
    stopTone();
    peerConnection?.close();
    peerConnection = null;
    useCallStore.getState().localStream?.getTracks().forEach(track => track.stop());
    useCallStore.setState({localStream: null, remoteStream: null, muted: false, cameraOff: false});
    if (!call) {
        return;
    }
    update({phase: "ended", endReason: reason || "Appel terminé"});
    closeTimer = setTimeout(() => useCallStore.setState({call: null}), 2500);
}

/** Appelle un utilisateur */
export async function call(peer: CallParty, video: boolean) {
    if (currentCall() && currentCall()?.phase !== "ended") {
        return;
    }
    clearTimeout(closeTimer);
    useCallStore.setState({call: {id: null, peer, video, direction: "outgoing", phase: "outgoing"}});
    try {
        const stream = await getMedia(video);
        if (!currentCall() || currentCall()?.phase === "ended") {
            stream.getTracks().forEach(track => track.stop());
            return; // annulé pendant la demande d'accès
        }
        useCallStore.setState({localStream: stream});
        const pc = createPeer(stream);
        await pc.setLocalDescription(await pc.createOffer());
        await waitIceGathering(pc);
        if (pc !== peerConnection) {
            return;
        }
        const created = await startCall(peer.id, video, pc.localDescription!.sdp);
        if (pc !== peerConnection) {
            // Raccroché pendant l'enregistrement de l'appel
            endCall(created.id).catch(console.error);
            return;
        }
        update({id: created.id});
        startTone("ringback");
        ringTimer = setTimeout(() => hangUp("Pas de réponse"), RING_TIMEOUT);
        poll(created.id);
    } catch (error) {
        console.error(error);
        finish((error as Error).message || "Appel impossible");
    }
}

/** Appel entrant détecté par la synchronisation */
export function receive(incoming: IncomingCall) {
    if (handledCalls.has(incoming.id) || Date.now() - incoming.createdAt > RING_TIMEOUT) {
        return;
    }
    const call = currentCall();
    if (call && call.phase !== "ended") {
        return; // déjà en communication
    }
    clearTimeout(closeTimer);
    useCallStore.setState({
        call: {id: incoming.id, peer: incoming.from, video: incoming.video, direction: "incoming", phase: "incoming"},
    });
    startTone("ring");
    ringTimer = setTimeout(() => finish("Appel manqué"), RING_TIMEOUT);
    poll(incoming.id);
}

/** Décroche l'appel entrant */
export async function accept() {
    const call = currentCall();
    if (!call || call.phase !== "incoming" || !call.id) {
        return;
    }
    const id = call.id;
    clearTimeout(ringTimer);
    stopTone();
    update({phase: "connecting"});
    try {
        const [stream, details] = await Promise.all([getMedia(call.video), fetchCall(id)]);
        if (!isCurrent(id)) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }
        if (details.status !== "ringing" || !details.offer) {
            stream.getTracks().forEach(track => track.stop());
            finish("Appel terminé");
            return;
        }
        useCallStore.setState({localStream: stream});
        const pc = createPeer(stream);
        await pc.setRemoteDescription({type: "offer", sdp: details.offer});
        await pc.setLocalDescription(await pc.createAnswer());
        await waitIceGathering(pc);
        if (pc !== peerConnection) {
            return;
        }
        await answerCall(id, pc.localDescription!.sdp);
        poll(id);
    } catch (error) {
        console.error(error);
        hangUp((error as Error).message || "Appel impossible");
    }
}

/** Refuse, annule ou raccroche */
export function hangUp(reason?: string) {
    const call = currentCall();
    if (call?.id && call.phase !== "ended") {
        endCall(call.id).catch(console.error);
    }
    finish(reason ?? (call?.phase === "incoming" ? "Appel refusé" : "Appel terminé"));
}

export function toggleMute() {
    const {localStream, muted} = useCallStore.getState();
    localStream?.getAudioTracks().forEach(track => track.enabled = muted);
    useCallStore.setState({muted: !muted});
}

export function toggleCamera() {
    const {localStream, cameraOff} = useCallStore.getState();
    localStream?.getVideoTracks().forEach(track => track.enabled = cameraOff);
    useCallStore.setState({cameraOff: !cameraOff});
}

// Fermeture de l'onglet pendant un appel : prévient l'autre participant
window.addEventListener("pagehide", () => {
    const call = currentCall();
    if (call?.id && call.phase !== "ended") {
        hangUp();
    }
});
