import {useEffect, useMemo, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {
    AppBar, Box, ButtonBase, IconButton, Paper, Toolbar, Tooltip, Typography
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import ForumIcon from "@mui/icons-material/Forum";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import NotificationsOffIcon from "@mui/icons-material/NotificationsOff";
import {useChatStore} from "../store/chatStore";
import {fetchRooms, fetchUsers} from "../api/chatApi";
import {logoutUser} from "../user/loginApi";
import {startPush, stopPush} from "../notifications/push";
import {conversationKey} from "../model/common";
import type {Conversation} from "../model/common";
import {ProfileDialog} from "../user/ProfileDialog";
import {ConversationList} from "./ConversationList";
import {ConversationView} from "./ConversationView";
import {UserAvatar} from "./UserAvatar";
import {useSync} from "./useSync";

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
    const pushError = useChatStore(state => state.pushError);
    const avatar = useChatStore(state => state.users.find(user => user.user_id === state.session?.id)?.avatar);
    const select = useChatStore(state => state.select);
    const [profileOpen, setProfileOpen] = useState(false);
    // Permission de notification accordée : les notifications fonctionnent au moins quand un onglet est ouvert
    const [permission, setPermission] = useState(() => "Notification" in window ? window.Notification.permission : "denied");

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

    // Notifications push : la permission n'est demandée qu'au clic sur la cloche
    useEffect(() => {
        if (!session) {
            return;
        }
        startPush(session, false).then(result => useChatStore.getState().setPushEnabled(result.enabled, result.error));
    }, [session]);

    // Présence, nouveaux messages, réactions et notifications quand l'onglet est ouvert
    useSync();

    const enablePush = async () => {
        if (!session) {
            return;
        }
        if ("Notification" in window && window.Notification.permission === "denied") {
            alert("Les notifications sont bloquées pour ce site : autorisez-les dans les paramètres du navigateur (icône à gauche de l'adresse), puis rechargez la page.");
            return;
        }
        const result = await startPush(session, true);
        setPermission("Notification" in window ? window.Notification.permission : "denied");
        useChatStore.getState().setPushEnabled(result.enabled, result.error);
    };

    const leave = async () => {
        await stopPush();
        useChatStore.getState().clearSession();
        navigate("/login", {replace: true});
    };

    const logout = async () => {
        try {
            await logoutUser();
        } catch (error) {
            console.error(error);
        }
        await leave();
    };

    const notificationsOn = permission === "granted";
    const notificationTitle = pushEnabled
        ? "Notifications activées"
        : notificationsOn
            ? "Notifications actives tant qu'un onglet est ouvert" + (pushError ? " (push indisponible : " + pushError + ")" : "")
            : "Activer les notifications";

    return (
        <Box sx={{height: "100vh", display: "flex", flexDirection: "column", bgcolor: "background.default"}}>
            <AppBar position="static" elevation={0}>
                <Toolbar variant="dense" sx={{gap: 1}}>
                    <ForumIcon/>
                    <Typography variant="h6" sx={{flex: 1}} noWrap>UBO Relay Chat</Typography>
                    <Tooltip title={notificationTitle}>
                        {/* Le clic fournit le geste utilisateur exigé par les navigateurs pour demander l'autorisation */}
                        <IconButton color="inherit" onClick={enablePush} aria-label="Notifications">
                            {notificationsOn ? <NotificationsActiveIcon sx={{opacity: pushEnabled ? 1 : 0.85}}/> : <NotificationsOffIcon sx={{opacity: 0.7}}/>}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Mon profil">
                        <ButtonBase onClick={() => setProfileOpen(true)} aria-label="Mon profil"
                                    sx={{borderRadius: 5, gap: 1, px: 0.5, py: 0.25}}>
                            <UserAvatar username={session?.username || "?"} avatar={avatar} size={30}/>
                            <Typography sx={{display: {xs: "none", sm: "block"}}}>{session?.username}</Typography>
                        </ButtonBase>
                    </Tooltip>
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
            <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} onDeleted={leave}/>
        </Box>
    );
}
