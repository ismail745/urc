import {useCallback, useEffect, useState} from "react";
import {Alert, Avatar, Box, CircularProgress, IconButton, Toolbar, Typography} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import TagIcon from "@mui/icons-material/Tag";
import {useNavigate} from "react-router-dom";
import {fetchMessages} from "../api/chatApi";
import {useChatStore} from "../store/chatStore";
import {conversationKey} from "../model/common";
import type {Conversation, Message} from "../model/common";
import type {CustomError} from "../model/CustomError";
import {colorFromName} from "../theme";
import {MessageList} from "./MessageList";
import {MessageInput} from "./MessageInput";

const POLLING_INTERVAL = 5000;
const EMPTY: Message[] = [];

/** Affiche la conversation sélectionnée : en-tête, messages et saisie */
export function ConversationView({conversation}: { conversation: Conversation }) {
    const navigate = useNavigate();
    const key = conversationKey(conversation);
    const session = useChatStore(state => state.session);
    const messages = useChatStore(state => state.messages[key] ?? EMPTY);
    const setMessages = useChatStore(state => state.setMessages);
    const addMessage = useChatStore(state => state.addMessage);
    const pushEnabled = useChatStore(state => state.pushEnabled);
    const name = useChatStore(state => conversation.type === "room"
        ? state.rooms.find(room => room.room_id === conversation.id)?.name
        : state.users.find(user => user.user_id === conversation.id)?.username);

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

    // Sans notifications push, on rafraîchit la conversation périodiquement
    useEffect(() => {
        if (pushEnabled) {
            return;
        }
        const interval = setInterval(load, POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, [pushEnabled, load]);

    return (
        <Box sx={{flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0}}>
            <Toolbar variant="dense" sx={{borderBottom: 1, borderColor: "divider", gap: 1.5}}>
                <IconButton edge="start" onClick={() => navigate("/messages")} sx={{display: {md: "none"}}}
                            aria-label="Retour">
                    <ArrowBackIcon/>
                </IconButton>
                <Avatar sx={{
                    width: 32, height: 32,
                    bgcolor: conversation.type === "room" ? "secondary.main" : colorFromName(name || "?"),
                }}>
                    {conversation.type === "room" ? <TagIcon fontSize="small"/> : (name || "?").charAt(0).toUpperCase()}
                </Avatar>
                <Typography variant="subtitle1" noWrap sx={{fontWeight: 600}}>{name || "…"}</Typography>
            </Toolbar>
            {error && <Alert severity="error" sx={{m: 1}}>{error}</Alert>}
            {loading && messages.length === 0
                ? <Box sx={{flex: 1, display: "flex", alignItems: "center", justifyContent: "center"}}><CircularProgress/></Box>
                : <MessageList messages={messages} currentUserId={session?.id}/>}
            <MessageInput conversation={conversation} onSent={message => addMessage(key, message)}/>
        </Box>
    );
}
