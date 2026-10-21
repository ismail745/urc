import {useState} from "react";
import type {FormEvent} from "react";
import {useNavigate} from "react-router-dom";
import {Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField} from "@mui/material";
import {createRoom} from "../api/chatApi";
import {useChatStore} from "../store/chatStore";
import type {CustomError} from "../model/CustomError";

export function NewRoomDialog({open, onClose}: { open: boolean, onClose: () => void }) {
    const addRoom = useChatStore(state => state.addRoom);
    const navigate = useNavigate();
    const [name, setName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const close = () => {
        setName("");
        setError(null);
        onClose();
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        createRoom(name)
            .then(room => {
                addRoom(room);
                close();
                navigate(`/messages/room/${room.room_id}`);
            })
            .catch((createError: CustomError) => setError(createError.message))
            .finally(() => setLoading(false));
    };

    return (
        <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
            <form onSubmit={handleSubmit}>
                <DialogTitle>Nouveau salon</DialogTitle>
                <DialogContent>
                    <TextField autoFocus fullWidth margin="dense" label="Nom du salon" required value={name}
                               onChange={e => setName(e.target.value)} slotProps={{htmlInput: {maxLength: 50}}}/>
                    {error && <Alert severity="error" sx={{mt: 1}}>{error}</Alert>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={close}>Annuler</Button>
                    <Button type="submit" variant="contained" loading={loading}>Créer</Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}
