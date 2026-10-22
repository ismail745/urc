import {useEffect, useRef, useState} from "react";

/** Durée maximale d'un message vocal (secondes) : l'enregistrement s'arrête et est envoyé automatiquement */
export const MAX_RECORDING = 120;

/** Formats audio par ordre de préférence (Safari ne gère que le mp4) */
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];

export interface Recording {
    blob: Blob;
    duration: number;
    extension: string;
}

/** Enregistrement d'un message vocal avec le micro (MediaRecorder) */
export function useRecorder(onLimit: (recording: Recording) => void) {
    const [recording, setRecording] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const recorder = useRef<MediaRecorder | null>(null);
    const chunks = useRef<Blob[]>([]);
    const startedAt = useRef(0);
    const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
    const onLimitRef = useRef(onLimit);
    onLimitRef.current = onLimit;

    const release = () => {
        clearInterval(timer.current);
        recorder.current?.stream.getTracks().forEach(track => track.stop());
        recorder.current = null;
        setRecording(false);
        setElapsed(0);
    };

    // Libère le micro si le composant disparaît pendant un enregistrement
    useEffect(() => release, []);

    /** Arrête l'enregistrement et renvoie le fichier audio (null si annulé ou trop court) */
    const stop = (keep: boolean) => new Promise<Recording | null>(resolve => {
        const current = recorder.current;
        if (!current) {
            resolve(null);
            return;
        }
        const duration = (Date.now() - startedAt.current) / 1000;
        current.onstop = () => {
            const type = current.mimeType || "audio/webm";
            const blob = new Blob(chunks.current, {type: type.split(";")[0]});
            const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
            resolve(keep && duration >= 0.5 && blob.size > 0 ? {blob, duration, extension} : null);
        };
        current.stop();
        release();
    });

    const start = async () => {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
            throw new Error("L'enregistrement audio n'est pas disponible sur ce navigateur");
        }
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}});
        } catch {
            throw new Error("Accès au micro refusé");
        }
        const mimeType = MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type));
        const mediaRecorder = new MediaRecorder(stream, {mimeType, audioBitsPerSecond: 32000});
        chunks.current = [];
        mediaRecorder.ondataavailable = event => event.data.size > 0 && chunks.current.push(event.data);
        mediaRecorder.start(250);
        recorder.current = mediaRecorder;
        startedAt.current = Date.now();
        setRecording(true);
        setElapsed(0);
        timer.current = setInterval(() => {
            const seconds = (Date.now() - startedAt.current) / 1000;
            setElapsed(seconds);
            if (seconds >= MAX_RECORDING) {
                stop(true).then(result => result && onLimitRef.current(result));
            }
        }, 200);
    };

    return {recording, elapsed, start, stop};
}
