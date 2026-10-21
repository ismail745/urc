import {useRef, useState} from "react";
import type {ChangeEvent, FormEvent, KeyboardEvent} from "react";
import {Alert, Box, Chip, IconButton, TextField, Tooltip} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import ImageIcon from "@mui/icons-material/Image";
import {sendMessage, uploadImage} from "../api/chatApi";
import type {Conversation, Message} from "../model/common";
import type {CustomError} from "../model/CustomError";

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

export function MessageInput({conversation, onSent}: { conversation: Conversation, onSent: (message: Message) => void }) {
    const [content, setContent] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    const submit = async () => {
        if (sending || (!content.trim() && !file)) {
            return;
        }
        setSending(true);
        setError(null);
        try {
            const image = file ? (await uploadImage(file)).url : undefined;
            const message = await sendMessage(conversation, content, image);
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
                <IconButton type="submit" color="primary" loading={sending} disabled={!content.trim() && !file}
                            aria-label="Envoyer">
                    <SendIcon/>
                </IconButton>
            </Box>
        </Box>
    );
}
