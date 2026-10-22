import {useState} from "react";
import {useNavigate} from "react-router-dom";
import {
    Avatar, Badge, IconButton, List, ListItemAvatar, ListItemButton, ListItemText, ListSubheader, Tooltip
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import TagIcon from "@mui/icons-material/Tag";
import {useChatStore} from "../store/chatStore";
import {conversationKey} from "../model/common";
import type {Conversation} from "../model/common";
import {presenceLabel, UserAvatar} from "./UserAvatar";
import {NewRoomDialog} from "./NewRoomDialog";

/** Liste des salons et des utilisateurs auxquels envoyer des messages */
export function ConversationList() {
    const navigate = useNavigate();
    const session = useChatStore(state => state.session);
    const users = useChatStore(state => state.users);
    const rooms = useChatStore(state => state.rooms);
    const unread = useChatStore(state => state.unread);
    const selected = useChatStore(state => state.selected);
    const online = useChatStore(state => state.online);
    const lastSeen = useChatStore(state => state.lastSeen);
    const [dialogOpen, setDialogOpen] = useState(false);

    const isSelected = (conversation: Conversation) =>
        selected !== null && conversationKey(selected) === conversationKey(conversation);
    const unreadCount = (conversation: Conversation) => unread[conversationKey(conversation)] || 0;

    return (
        <>
            <List dense sx={{py: 0}}>
                <ListSubheader sx={{display: "flex", alignItems: "center", justifyContent: "space-between"}}>
                    Salons
                    <Tooltip title="Nouveau salon">
                        <IconButton size="small" edge="end" onClick={() => setDialogOpen(true)} aria-label="Nouveau salon">
                            <AddIcon fontSize="small"/>
                        </IconButton>
                    </Tooltip>
                </ListSubheader>
                {rooms.map(room => {
                    const conversation: Conversation = {type: "room", id: room.room_id};
                    return (
                        <ListItemButton key={"room" + room.room_id} selected={isSelected(conversation)}
                                        onClick={() => navigate(`/messages/room/${room.room_id}`)}>
                            <ListItemAvatar>
                                <Avatar sx={{bgcolor: "secondary.main"}}><TagIcon/></Avatar>
                            </ListItemAvatar>
                            <ListItemText primary={room.name}/>
                            <Badge badgeContent={unreadCount(conversation)} color="error" sx={{mr: 1}}/>
                        </ListItemButton>
                    );
                })}

                <ListSubheader>Utilisateurs</ListSubheader>
                {users.filter(user => user.user_id !== session?.id).map(user => {
                    const conversation: Conversation = {type: "user", id: user.user_id};
                    const isOnline = online.includes(user.user_id);
                    return (
                        <ListItemButton key={"user" + user.user_id} selected={isSelected(conversation)}
                                        onClick={() => navigate(`/messages/user/${user.user_id}`)}>
                            <ListItemAvatar>
                                <UserAvatar username={user.username} avatar={user.avatar} online={isOnline}/>
                            </ListItemAvatar>
                            <ListItemText primary={user.is_admin ? user.username + " · admin" : user.username}
                                          secondary={presenceLabel(isOnline, lastSeen[user.user_id], user.last_login)}
                                          slotProps={{secondary: {sx: isOnline ? {color: "success.main"} : undefined}}}/>
                            <Badge badgeContent={unreadCount(conversation)} color="error" sx={{mr: 1}}/>
                        </ListItemButton>
                    );
                })}
            </List>
            <NewRoomDialog open={dialogOpen} onClose={() => setDialogOpen(false)}/>
        </>
    );
}
