import {useRef, useState} from "react";
import type {ChangeEvent, FormEvent, KeyboardEvent} from "react";
import {Alert, Box, Chip, IconButton, TextField, Tooltip, Typography} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import ImageIcon from "@mui/icons-material/Image";
import MicIcon from "@mui/icons-material/Mic";
import DeleteIcon from "@mui/icons-material/Delete";
import {sendMessage, uploadFile, uploadImage} from "../api/chatApi";
import {MAX_RECORDING, useRecorder} from "./useRecorder";
import type {Recording} from "./useRecorder";
import {formatSeconds} from "./AudioMessage";
import type {Conversation, Message} from "../model/common";
import type {CustomError} from "../model/CustomError";

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

export function MessageInput({conversation, onSent}: { conversation: Conversation, onSent: (message: Message) => void }) {
    const [content, setContent] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    const sendRecording = async (recording: Recording) => {
        setSending(true);
        setError(null);
        try {
            const audio = (await uploadFile(recording.blob, "vocal." + recording.extension)).url;
            onSent(await sendMessage(conversation, "", {audio, duration: recording.duration}));
        } catch (e) {
            setError((e as CustomError).message);
        } finally {
            setSending(false);
        }
    };
    const recorder = useRecorder(sendRecording);

    const startRecording = () => {
        setError(null);
        recorder.start().catch((e: Error) => setError(e.message));
    };

    const stopRecording = async (keep: boolean) => {
        const recording = await recorder.stop(keep);
        if (recording) {
            await sendRecording(recording);
        }
    };

    const submit = async () => {
        if (sending || (!content.trim() && !file)) {
            return;
        }
        setSending(true);
        setError(null);
        try {
            const image = file ? (await uploadImage(file)).url : undefined;
            const message = await sendMessage(conversation, content, {image});
            onSent(message);
            setContent("");
            setFile(null);
        } catch (e) {
            setError((e as CustomError).message);
        } finally {
            setSending(false);
        }
    };

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        submit();
    };

    // Entrée envoie le message, Maj+Entrée fait un retour à la ligne
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
        }
    };

    const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
        const selected = event.target.files?.[0];
        event.target.value = "";
        if (!selected) {
            return;
        }
        if (!selected.type.startsWith("image/")) {
            setError("Seules les images sont acceptées");
        } else if (selected.size > MAX_IMAGE_SIZE) {
            setError("Image trop volumineuse (4 Mo max)");
        } else {
            setError(null);
            setFile(selected);
        }
    };

    return (
        <Box component="form" onSubmit={handleSubmit} sx={{p: 1.5, borderTop: 1, borderColor: "divider"}}>
            {error && <Alert severity="error" onClose={() => setError(null)} sx={{mb: 1}}>{error}</Alert>}
            {file && <Chip label={file.name} icon={<ImageIcon/>} onDelete={() => setFile(null)} sx={{mb: 1}}/>}
            {recorder.recording ? (
                <Box sx={{display: "flex", alignItems: "center", gap: 1}}>
                    <Tooltip title="Annuler">
                        <IconButton onClick={() => stopRecording(false)} aria-label="Annuler l'enregistrement">
                            <DeleteIcon/>
                        </IconButton>
                    </Tooltip>
                    <Box sx={{flex: 1, display: "flex", alignItems: "center", gap: 1}} aria-live="polite">
                        <Box sx={{
                            width: 10, height: 10, borderRadius: "50%", bgcolor: "error.main",
                            animation: "pulse 1s ease-in-out infinite",
                            "@keyframes pulse": {"50%": {opacity: 0.3}},
                        }}/>
                        <Typography variant="body2">
                            Enregistrement… {formatSeconds(recorder.elapsed)} / {formatSeconds(MAX_RECORDING)}
                        </Typography>
                    </Box>
                    <Tooltip title="Envoyer le message vocal">
                        <IconButton color="primary" onClick={() => stopRecording(true)} aria-label="Envoyer le message vocal">
                            <SendIcon/>
                        </IconButton>
                    </Tooltip>
                </Box>
            ) : (
                <Box sx={{display: "flex", alignItems: "flex-end", gap: 1}}>
                    <input ref={fileInput} type="file" accept="image/*" hidden onChange={handleFile}/>
                    <Tooltip title="Envoyer une image">
                        <IconButton onClick={() => fileInput.current?.click()} disabled={sending} aria-label="Envoyer une image">
                            <ImageIcon/>
                        </IconButton>
                    </Tooltip>
                    <TextField fullWidth multiline maxRows={5} size="small" placeholder="Écrire un message…"
                               value={content} onChange={e => setContent(e.target.value)} onKeyDown={handleKeyDown}
                               slotProps={{htmlInput: {maxLength: 2000}}}/>
                    {/* Comme sur WhatsApp : micro quand le champ est vide, envoi sinon */}
                    {!content.trim() && !file ? (
                        <Tooltip title="Message vocal">
                            <IconButton color="primary" loading={sending} onClick={startRecording} aria-label="Enregistrer un message vocal">
                                <MicIcon/>
                            </IconButton>
                        </Tooltip>
                    ) : (
                        <IconButton type="submit" color="primary" loading={sending} aria-label="Envoyer">
                            <SendIcon/>
                        </IconButton>
                    )}
                </Box>
            )}
        </Box>
    );
}
