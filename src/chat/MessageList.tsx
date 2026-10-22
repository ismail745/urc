import {useEffect, useRef, useState} from "react";
import {Box, ButtonBase, IconButton, Paper, Popover, Tooltip, Typography} from "@mui/material";
import AddReactionOutlinedIcon from "@mui/icons-material/AddReactionOutlined";
import {sendReaction} from "../api/chatApi";
import {useChatStore} from "../store/chatStore";
import {conversationKey, REACTIONS} from "../model/common";
import type {Conversation, Message, Reactions} from "../model/common";
import {AuthImage} from "./AuthImage";
import {UserAvatar} from "./UserAvatar";

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

/** Réactions après le choix de l'emoji par l'utilisateur (un seul emoji par utilisateur, re-cliquer le retire) */
function toggleReaction(reactions: Reactions, userId: number, emoji: string): { reactions: Reactions, emoji: string | null } {
    const current = Object.keys(reactions).find(e => reactions[e].includes(userId));
    const next: Reactions = {};
    Object.entries(reactions).forEach(([e, users]) => {
        const others = users.filter(id => id !== userId);
        if (others.length > 0) {
            next[e] = others;
        }
    });
    if (current === emoji) {
        return {reactions: next, emoji: null};
    }
    next[emoji] = [...(next[emoji] || []), userId];
    return {reactions: next, emoji};
}

interface MessageListProps {
    messages: Message[];
    conversation: Conversation;
    currentUserId?: number;
}

/** Liste des messages d'une conversation : reçus à gauche, envoyés à droite */
export function MessageList({messages, conversation, currentUserId}: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const users = useChatStore(state => state.users);
    const [picker, setPicker] = useState<{ anchor: HTMLElement, message: Message } | null>(null);
    const lastMessageId = messages[messages.length - 1]?.id;

    // Auto-scroll sur le dernier message (pas lors d'une simple réaction)
    useEffect(() => {
        bottomRef.current?.scrollIntoView({behavior: "smooth"});
    }, [lastMessageId]);

    const react = (message: Message, emoji: string) => {
        setPicker(null);
        if (currentUserId === undefined) {
            return;
        }
        const key = conversationKey(conversation);
        const {setReactions} = useChatStore.getState();
        const previous = message.reactions || {};
        const result = toggleReaction(previous, currentUserId, emoji);
        // Mise à jour immédiate de l'affichage, puis état renvoyé par le serveur
        setReactions(key, message.id, result.reactions);
        sendReaction(conversation, message.id, result.emoji)
            .then(reactions => setReactions(key, message.id, reactions))
            .catch(error => {
                console.error(error);
                setReactions(key, message.id, previous);
            });
    };

    const usernames = (ids: number[]) => ids
        .map(id => id === currentUserId ? "Moi" : users.find(user => user.user_id === id)?.username || "Utilisateur supprimé")
        .join(", ");

    if (messages.length === 0) {
        return (
            <Box sx={{flex: 1, display: "flex", alignItems: "center", justifyContent: "center"}}>
                <Typography color="text.secondary">Aucun message pour le moment. Dites bonjour 👋</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{flex: 1, overflowY: "auto", p: 2, display: "flex", flexDirection: "column", gap: 1.5}}>
            {messages.map(message => {
                const mine = message.senderId === currentUserId;
                const reactions = Object.entries(message.reactions || {}).filter(([, ids]) => ids.length > 0);
                return (
                    <Box key={message.id} sx={{
                        display: "flex",
                        flexDirection: mine ? "row-reverse" : "row",
                        alignItems: "flex-end",
                        gap: 1,
                        // Le bouton de réaction apparaît au survol (toujours visible sur écran tactile)
                        "& .reaction-button": {opacity: {xs: 0.6, md: 0}, transition: "opacity 0.15s"},
                        "&:hover .reaction-button, & .reaction-button:focus-visible": {opacity: 1},
                    }}>
                        {!mine && (
                            <UserAvatar username={message.senderName} size={32}
                                        avatar={users.find(user => user.user_id === message.senderId)?.avatar}/>
                        )}
                        <Box sx={{maxWidth: "70%", display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start"}}>
                            <Typography variant="caption" color="text.secondary" sx={{px: 1}}>
                                {mine ? "Moi" : message.senderName} · {dateFormat.format(new Date(message.timestamp))}
                            </Typography>
                            <Paper elevation={0} sx={{
                                px: 1.5, py: 1,
                                borderRadius: 3,
                                borderBottomRightRadius: mine ? 4 : undefined,
                                borderBottomLeftRadius: mine ? undefined : 4,
                                bgcolor: mine ? "primary.main" : "action.selected",
                                color: mine ? "primary.contrastText" : "text.primary",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                            }}>
                                {message.image && <AuthImage path={message.image} spaced={!!message.content}/>}
                                {message.content}
                            </Paper>
                            {reactions.length > 0 && (
                                <Box sx={{display: "flex", flexWrap: "wrap", gap: 0.5, mt: -0.75, px: 1, zIndex: 1}}>
                                    {reactions.map(([emoji, ids]) => {
                                        const reacted = currentUserId !== undefined && ids.includes(currentUserId);
                                        return (
                                            <Tooltip key={emoji} title={usernames(ids)}>
                                                <ButtonBase onClick={() => react(message, emoji)} sx={{
                                                    px: 0.75, py: 0.25, borderRadius: 4, fontSize: 13, gap: 0.5,
                                                    bgcolor: "background.paper", boxShadow: 1,
                                                    border: 1, borderColor: reacted ? "primary.main" : "transparent",
                                                }}>
                                                    <span>{emoji}</span>
                                                    {ids.length > 1 && <Typography variant="caption">{ids.length}</Typography>}
                                                </ButtonBase>
                                            </Tooltip>
                                        );
                                    })}
                                </Box>
                            )}
                        </Box>
                        <IconButton className="reaction-button" size="small" aria-label="Réagir"
                                    onClick={event => setPicker({anchor: event.currentTarget, message})}
                                    sx={{alignSelf: "center"}}>
                            <AddReactionOutlinedIcon fontSize="small"/>
                        </IconButton>
                    </Box>
                );
            })}
            <div ref={bottomRef}/>

            <Popover open={picker !== null} anchorEl={picker?.anchor} onClose={() => setPicker(null)}
                     anchorOrigin={{vertical: "top", horizontal: "center"}}
                     transformOrigin={{vertical: "bottom", horizontal: "center"}}
                     slotProps={{paper: {sx: {borderRadius: 6, px: 0.5}}}}>
                <Box sx={{display: "flex"}}>
                    {REACTIONS.map(emoji => {
                        const reacted = currentUserId !== undefined && !!picker?.message.reactions?.[emoji]?.includes(currentUserId);
                        return (
                            <IconButton key={emoji} onClick={() => picker && react(picker.message, emoji)}
                                        aria-label={"Réagir " + emoji}
                                        sx={{fontSize: 22, width: 44, height: 44, bgcolor: reacted ? "action.selected" : undefined}}>
                                {emoji}
                            </IconButton>
                        );
                    })}
                </Box>
            </Popover>
        </Box>
    );
}
