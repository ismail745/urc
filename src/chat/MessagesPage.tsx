import {useEffect, useMemo} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {
    AppBar, Avatar, Box, IconButton, Paper, Toolbar, Tooltip, Typography
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import ForumIcon from "@mui/icons-material/Forum";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import NotificationsOffIcon from "@mui/icons-material/NotificationsOff";
import {useChatStore} from "../store/chatStore";
import {fetchMessages, fetchRooms, fetchUsers} from "../api/chatApi";
import {logoutUser} from "../user/loginApi";
import {startPush, stopPush} from "../notifications/push";
import {conversationKey} from "../model/common";
import type {Conversation} from "../model/common";
import {colorFromName} from "../theme";
import {ConversationList} from "./ConversationList";
import {ConversationView} from "./ConversationView";

interface PushData {
    type?: string;
    conversationId?: string;
}

function parseConversation(type?: string, id?: string): Conversation | null {
    const numericId = Number(id);
    if ((type === "user" || type === "room") && Number.isInteger(numericId) && numericId > 0) {
        return {type, id: numericId};
    }
    return null;
}

/** Etat global de la messagerie : chargement des listes, notifications et conversation sélectionnée */
export function MessagesPage() {
    const navigate = useNavigate();
    const params = useParams();
    const session = useChatStore(state => state.session);
    const pushEnabled = useChatStore(state => state.pushEnabled);
    const select = useChatStore(state => state.select);

    const conversation = useMemo(() => parseConversation(params.type, params.id), [params.type, params.id]);

    // La conversation sélectionnée est portée par l'URL, et recopiée dans le store
    useEffect(() => {
        select(conversation);
    }, [conversation, select]);

    // Chargement des utilisateurs et des salons
    useEffect(() => {
        const {setUsers, setRooms} = useChatStore.getState();
        fetchUsers().then(setUsers).catch(console.error);
        fetchRooms().then(setRooms).catch(console.error);
    }, []);

    // Notifications push
    useEffect(() => {
        if (!session) {
            return;
        }
        startPush(session).then(enabled => useChatStore.getState().setPushEnabled(enabled));
    }, [session]);

    // Ecoute du service worker : rafraîchit la conversation affichée ou incrémente les non-lus
    useEffect(() => {
        const sw = navigator.serviceWorker;
        if (!sw) {
            return;
        }
        const onMessage = (event: MessageEvent<PushData>) => {
            const data = event.data;
            console.log("Got event from sw : " + JSON.stringify(data));
            const target = parseConversation(data?.type, data?.conversationId);
            if (!target) {
                return;
            }
            const state = useChatStore.getState();
            const key = conversationKey(target);
            if (state.selected && conversationKey(state.selected) === key && document.visibilityState === "visible") {
                fetchMessages(target).then(messages => state.setMessages(key, messages)).catch(console.error);
            } else {
                state.incrementUnread(key);
                // Message d'un utilisateur inscrit depuis le chargement de la liste
                if (target.type === "user" && !state.users.some(user => user.user_id === target.id)) {
                    fetchUsers().then(state.setUsers).catch(console.error);
                }
                // Recharge la conversation en cache pour l'afficher à jour lors de sa sélection
                if (state.messages[key]) {
                    fetchMessages(target).then(messages => state.setMessages(key, messages)).catch(console.error);
                }
            }
        };
        sw.addEventListener("message", onMessage);
        return () => sw.removeEventListener("message", onMessage);
    }, []);

    const logout = async () => {
        try {
            await logoutUser();
        } catch (error) {
            console.error(error);
        }
        await stopPush();
        useChatStore.getState().clearSession();
        navigate("/login", {replace: true});
    };

    return (
        <Box sx={{height: "100vh", display: "flex", flexDirection: "column", bgcolor: "background.default"}}>
            <AppBar position="static" elevation={0}>
                <Toolbar variant="dense" sx={{gap: 1}}>
                    <ForumIcon/>
                    <Typography variant="h6" sx={{flex: 1}} noWrap>UBO Relay Chat</Typography>
                    <Tooltip title={pushEnabled ? "Notifications activées" : "Notifications désactivées (rafraîchissement automatique)"}>
                        {pushEnabled ? <NotificationsActiveIcon/> : <NotificationsOffIcon sx={{opacity: 0.7}}/>}
                    </Tooltip>
                    <Avatar sx={{width: 30, height: 30, fontSize: 14, bgcolor: colorFromName(session?.username || "?")}}>
                        {(session?.username || "?").charAt(0).toUpperCase()}
                    </Avatar>
                    <Typography sx={{display: {xs: "none", sm: "block"}}}>{session?.username}</Typography>
                    <Tooltip title="Déconnexion">
                        <IconButton color="inherit" onClick={logout} aria-label="Déconnexion"><LogoutIcon/></IconButton>
                    </Tooltip>
                </Toolbar>
            </AppBar>

            <Box sx={{flex: 1, display: "flex", minHeight: 0, p: {xs: 0, md: 2}, gap: 2}}>
                <Paper sx={{
                    width: {xs: "100%", md: 320},
                    flexShrink: 0,
                    overflowY: "auto",
                    display: {xs: conversation ? "none" : "block", md: "block"},
                }}>
                    <ConversationList/>
                </Paper>
                <Paper sx={{
                    flex: 1,
                    minWidth: 0,
                    display: {xs: conversation ? "flex" : "none", md: "flex"},
                }}>
                    {conversation
                        ? <ConversationView key={conversationKey(conversation)} conversation={conversation}/>
                        : (
                            <Box sx={{flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "text.secondary", gap: 1}}>
                                <ForumIcon sx={{fontSize: 64, opacity: 0.4}}/>
                                <Typography>Sélectionnez un salon ou un utilisateur pour démarrer une discussion</Typography>
                            </Box>
                        )}
                </Paper>
            </Box>
        </Box>
    );
}
