import {useState} from "react";
import {useNavigate} from "react-router-dom";
import {Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle} from "@mui/material";
import {deleteRoom} from "../api/chatApi";
import {useChatStore} from "../store/chatStore";
import type {Room} from "../model/common";
import type {CustomError} from "../model/CustomError";

/** Confirmation de la suppression d'un salon par son créateur */
export function DeleteRoomDialog({room, open, onClose}: { room: Room, open: boolean, onClose: () => void }) {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const close = () => {
        setError(null);
        onClose();
    };

    const confirm = () => {
        setLoading(true);
        setError(null);
        deleteRoom(room.room_id)
            .then(() => {
                close();
                navigate("/messages", {replace: true});
                useChatStore.getState().removeRoom(room.room_id);
            })
            .catch((e: CustomError) => setError(e.message))
            .finally(() => setLoading(false));
    };

    return (
        <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
            <DialogTitle>Supprimer le salon « {room.name} » ?</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    Le salon et tous ses messages seront définitivement supprimés pour tous les participants.
                </DialogContentText>
                {error && <Alert severity="error" sx={{mt: 2}}>{error}</Alert>}
            </DialogContent>
            <DialogActions>
                <Button onClick={close}>Annuler</Button>
                <Button color="error" variant="contained" loading={loading} onClick={confirm}>Supprimer</Button>
            </DialogActions>
        </Dialog>
    );
}
