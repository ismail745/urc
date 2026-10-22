import {useState} from "react";
import {useNavigate} from "react-router-dom";
import {Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle} from "@mui/material";
import {deleteUser, fetchUsers} from "../api/chatApi";
import {useChatStore} from "../store/chatStore";
import type {PublicUser} from "../model/common";
import type {CustomError} from "../model/CustomError";

/** Confirmation de la suppression d'un utilisateur par un administrateur */
export function DeleteUserDialog({user, open, onClose}: { user: PublicUser, open: boolean, onClose: () => void }) {
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
        deleteUser(user.user_id)
            .then(() => {
                close();
                navigate("/messages", {replace: true});
                fetchUsers().then(useChatStore.getState().setUsers).catch(console.error);
            })
            .catch((e: CustomError) => setError(e.message))
            .finally(() => setLoading(false));
    };

    return (
        <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
            <DialogTitle>Supprimer l'utilisateur « {user.username} » ?</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    Son compte, sa photo et ses conversations privées seront définitivement supprimés,
                    et il sera déconnecté de tous ses appareils. Ses messages dans les salons sont conservés.
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
