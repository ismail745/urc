import {useCallback, useEffect, useState} from "react";
import {Alert, Avatar, Box, CircularProgress, IconButton, Toolbar, Tooltip, Typography} from "@mui/material";
import CallIcon from "@mui/icons-material/Call";
import VideocamIcon from "@mui/icons-material/Videocam";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import TagIcon from "@mui/icons-material/Tag";
import {useNavigate} from "react-router-dom";
import {fetchMessages} from "../api/chatApi";
import {useChatStore} from "../store/chatStore";
import {conversationKey} from "../model/common";
import type {Conversation, Message} from "../model/common";
import type {CustomError} from "../model/CustomError";
import {presenceLabel, UserAvatar} from "./UserAvatar";
import {call} from "../call/callManager";
import {MessageList} from "./MessageList";
import {MessageInput} from "./MessageInput";

const EMPTY: Message[] = [];

/** Affiche la conversation sélectionnée : en-tête, messages et saisie */
export function ConversationView({conversation}: { conversation: Conversation }) {
    const navigate = useNavigate();
    const key = conversationKey(conversation);
    const session = useChatStore(state => state.session);
    const messages = useChatStore(state => state.messages[key] ?? EMPTY);
    const setMessages = useChatStore(state => state.setMessages);
    const addMessage = useChatStore(state => state.addMessage);
    const room = useChatStore(state => conversation.type === "room"
        ? state.rooms.find(r => r.room_id === conversation.id) : undefined);
    const user = useChatStore(state => conversation.type === "user"
        ? state.users.find(u => u.user_id === conversation.id) : undefined);
    const isOnline = useChatStore(state => conversation.type === "user" && state.online.includes(conversation.id));
    const lastSeen = useChatStore(state => state.lastSeen[conversation.id]);
    const name = room?.name ?? user?.username;

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        return fetchMessages(conversation)
            .then(result => {
                setMessages(key, result);
                setError(null);
            })
            .catch((e: CustomError) => setError(e.message));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, setMessages]);

    useEffect(() => {
        setLoading(true);
        load().finally(() => setLoading(false));
    }, [load]);

    // Les nouveaux messages et réactions sont ensuite récupérés par la synchronisation (useSync)

    return (
        <Box sx={{flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0}}>
            <Toolbar variant="dense" sx={{borderBottom: 1, borderColor: "divider", gap: 1.5}}>
                <IconButton edge="start" onClick={() => navigate("/messages")} sx={{display: {md: "none"}}}
                            aria-label="Retour">
                    <ArrowBackIcon/>
                </IconButton>
                {conversation.type === "room"
                    ? <Avatar sx={{width: 32, height: 32, bgcolor: "secondary.main"}}><TagIcon fontSize="small"/></Avatar>
                    : <UserAvatar username={name || "?"} avatar={user?.avatar} size={32} online={isOnline}/>}
                <Box sx={{minWidth: 0}}>
                    <Typography variant="subtitle1" noWrap sx={{fontWeight: 600, lineHeight: 1.3}}>{name || "…"}</Typography>
                    {user && (
                        <Typography variant="caption" noWrap component="div"
                                    color={isOnline ? "success.main" : "text.secondary"} sx={{lineHeight: 1.2}}>
                            {presenceLabel(isOnline, lastSeen, user.last_login)}
                        </Typography>
                    )}
                </Box>
                {user && user.user_id !== session?.id && (
                    <Box sx={{ml: "auto", display: "flex"}}>
                        <Tooltip title="Appel vidéo">
                            <IconButton onClick={() => call({id: user.user_id, name: user.username}, true)} aria-label="Appel vidéo">
                                <VideocamIcon/>
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Appel audio">
                            <IconButton onClick={() => call({id: user.user_id, name: user.username}, false)} aria-label="Appel audio">
                                <CallIcon/>
                            </IconButton>
                        </Tooltip>
                    </Box>
                )}
            </Toolbar>
            {error && <Alert severity="error" sx={{m: 1}}>{error}</Alert>}
            {loading && messages.length === 0
                ? <Box sx={{flex: 1, display: "flex", alignItems: "center", justifyContent: "center"}}><CircularProgress/></Box>
                : <MessageList messages={messages} conversation={conversation} currentUserId={session?.id}/>}
            <MessageInput conversation={conversation} onSent={message => addMessage(key, message)}/>
        </Box>
    );
}
