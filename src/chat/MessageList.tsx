import {useEffect, useRef} from "react";
import {Avatar, Box, Paper, Typography} from "@mui/material";
import type {Message} from "../model/common";
import {colorFromName} from "../theme";
import {AuthImage} from "./AuthImage";

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

/** Liste des messages d'une conversation : reçus à gauche, envoyés à droite */
export function MessageList({messages, currentUserId}: { messages: Message[], currentUserId?: number }) {
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll sur le dernier message
    useEffect(() => {
        bottomRef.current?.scrollIntoView({behavior: "smooth"});
    }, [messages]);

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
                return (
                    <Box key={message.id} sx={{
                        display: "flex",
                        flexDirection: mine ? "row-reverse" : "row",
                        alignItems: "flex-end",
                        gap: 1,
                    }}>
                        {!mine && (
                            <Avatar sx={{width: 32, height: 32, fontSize: 14, bgcolor: colorFromName(message.senderName)}}>
                                {message.senderName.charAt(0).toUpperCase()}
                            </Avatar>
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
                        </Box>
                    </Box>
                );
            })}
            <div ref={bottomRef}/>
        </Box>
    );
}
