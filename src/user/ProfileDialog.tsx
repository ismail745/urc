import {useRef, useState} from "react";
import type {ChangeEvent, FormEvent} from "react";
import {
    Alert, Box, Button, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Divider, TextField, Typography
} from "@mui/material";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import {deleteAccount, updateAvatar, uploadImage} from "../api/chatApi";
import {useChatStore} from "../store/chatStore";
import type {CustomError} from "../model/CustomError";
import {UserAvatar} from "../chat/UserAvatar";

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

interface ProfileDialogProps {
    open: boolean;
    onClose: () => void;
    /** Appelé une fois le compte supprimé */
    onDeleted: () => void;
}

/** Profil de l'utilisateur connecté : photo de profil et suppression du compte */
export function ProfileDialog({open, onClose, onDeleted}: ProfileDialogProps) {
    const session = useChatStore(state => state.session);
    const avatar = useChatStore(state => state.users.find(user => user.user_id === state.session?.id)?.avatar);
    const fileInput = useRef<HTMLInputElement>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [password, setPassword] = useState("");
    const [deleting, setDeleting] = useState(false);

    const close = () => {
        setError(null);
        setConfirmDelete(false);
        setPassword("");
        onClose();
    };

    const saveAvatar = async (file: File | null) => {
        if (session?.id === undefined) {
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const path = file ? (await uploadImage(file)).url : null;
            const result = await updateAvatar(path);
            useChatStore.getState().setAvatar(session.id, result.avatar);
        } catch (e) {
            setError((e as CustomError).message);
        } finally {
            setSaving(false);
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
            saveAvatar(selected);
        }
    };

    const handleDelete = async (event: FormEvent) => {
        event.preventDefault();
        setDeleting(true);
        setError(null);
        try {
            await deleteAccount(password);
            close();
            onDeleted();
        } catch (e) {
            setError((e as CustomError).message);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
            <DialogTitle>Mon profil</DialogTitle>
            <DialogContent>
                <Box sx={{display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, py: 1}}>
                    <UserAvatar username={session?.username || "?"} avatar={avatar} size={112}/>
                    <Typography variant="h6">{session?.username}</Typography>
                    <input ref={fileInput} type="file" accept="image/*" hidden onChange={handleFile}/>
                    <Box sx={{display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center"}}>
                        <Button variant="contained" startIcon={<PhotoCameraIcon/>} loading={saving}
                                onClick={() => fileInput.current?.click()}>
                            {avatar ? "Changer la photo" : "Ajouter une photo"}
                        </Button>
                        {avatar && (
                            <Button color="inherit" disabled={saving} onClick={() => saveAvatar(null)}>
                                Retirer
                            </Button>
                        )}
                    </Box>
                </Box>

                {error && <Alert severity="error" sx={{mt: 2}} onClose={() => setError(null)}>{error}</Alert>}

                <Divider sx={{my: 2}}/>
                <Typography variant="subtitle2" color="error">Zone de danger</Typography>
                <Collapse in={!confirmDelete}>
                    <Button color="error" startIcon={<DeleteForeverIcon/>} onClick={() => setConfirmDelete(true)} sx={{mt: 1}}>
                        Supprimer mon compte
                    </Button>
                </Collapse>
                <Collapse in={confirmDelete}>
                    <Box component="form" onSubmit={handleDelete} sx={{mt: 1}}>
                        <Typography variant="body2" color="text.secondary">
                            Votre compte, votre photo et vos conversations privées seront définitivement supprimés.
                            Saisissez votre mot de passe pour confirmer.
                        </Typography>
                        <TextField fullWidth size="small" type="password" label="Mot de passe" margin="dense"
                                   autoComplete="current-password" value={password}
                                   onChange={e => setPassword(e.target.value)}/>
                        <Box sx={{display: "flex", justifyContent: "flex-end", gap: 1, mt: 1}}>
                            <Button onClick={() => {
                                setConfirmDelete(false);
                                setPassword("");
                            }}>Annuler</Button>
                            <Button type="submit" variant="contained" color="error" loading={deleting} disabled={!password}>
                                Supprimer définitivement
                            </Button>
                        </Box>
                    </Box>
                </Collapse>
            </DialogContent>
            <DialogActions>
                <Button onClick={close}>Fermer</Button>
            </DialogActions>
        </Dialog>
    );
}
