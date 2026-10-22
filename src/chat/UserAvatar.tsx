import {useEffect, useState} from "react";
import {Avatar, Badge} from "@mui/material";
import {fetchImage} from "../api/chatApi";
import {colorFromName} from "../theme";

/** Photos de profil déjà téléchargées (partagées par tous les avatars de la page) */
const cache = new Map<string, Promise<string>>();

function loadAvatar(path: string): Promise<string> {
    let url = cache.get(path);
    if (!url) {
        url = fetchImage(path).then(blob => URL.createObjectURL(blob));
        url.catch(() => cache.delete(path));
        cache.set(path, url);
    }
    return url;
}

interface UserAvatarProps {
    username: string;
    avatar?: string | null;
    size?: number;
    /** Affiche une pastille verte si true */
    online?: boolean;
}

/** Avatar d'un utilisateur : sa photo de profil (store Blob privé), sinon l'initiale de son nom */
export function UserAvatar({username, avatar, size = 40, online}: UserAvatarProps) {
    const [loaded, setLoaded] = useState<{ path: string, src: string } | null>(null);

    useEffect(() => {
        if (!avatar) {
            return;
        }
        let cancelled = false;
        loadAvatar(avatar)
            .then(src => !cancelled && setLoaded({path: avatar, src}))
            .catch(console.error);
        return () => {
            cancelled = true;
        };
    }, [avatar]);

    const src = avatar && loaded?.path === avatar ? loaded.src : undefined;
    const content = (
        <Avatar src={src} alt={username}
                sx={{width: size, height: size, fontSize: size * 0.45, bgcolor: colorFromName(username)}}>
            {username.charAt(0).toUpperCase()}
        </Avatar>
    );
    if (!online) {
        return content;
    }
    return (
        <Badge overlap="circular" variant="dot" anchorOrigin={{vertical: "bottom", horizontal: "right"}}
               sx={{
                   "& .MuiBadge-badge": {
                       bgcolor: "#25d366",
                       width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28), borderRadius: "50%",
                       border: 2, borderColor: "background.paper",
                   },
               }}>
            {content}
        </Badge>
    );
}

/** "En ligne", ou date de dernière connexion */
export function presenceLabel(online: boolean, lastSeen?: number, lastLogin?: string | null): string {
    if (online) {
        return "En ligne";
    }
    if (lastSeen) {
        const date = new Date(lastSeen);
        const time = date.toLocaleTimeString("fr-FR", {hour: "2-digit", minute: "2-digit"});
        if (date.toDateString() === new Date().toDateString()) {
            return "Vu aujourd'hui à " + time;
        }
        return "Vu le " + date.toLocaleDateString("fr-FR", {day: "2-digit", month: "2-digit"}) + " à " + time;
    }
    return lastLogin ? "Vu le " + lastLogin : "Jamais connecté";
}
