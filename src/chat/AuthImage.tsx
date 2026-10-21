import {useEffect, useState} from "react";
import {Box, CircularProgress, Link, Typography} from "@mui/material";
import {fetchImage} from "../api/chatApi";

/**
 * Image stockée dans le store Blob privé : elle est téléchargée avec le token de session,
 * puis affichée via une URL locale (une balise <img> ne peut pas envoyer de header Authorization).
 */
export function AuthImage({path, spaced}: { path: string, spaced: boolean }) {
    const [src, setSrc] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let objectUrl: string | null = null;
        let cancelled = false;
        fetchImage(path)
            .then(blob => {
                if (!cancelled) {
                    objectUrl = URL.createObjectURL(blob);
                    setSrc(objectUrl);
                }
            })
            .catch(() => !cancelled && setFailed(true));
        return () => {
            cancelled = true;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [path]);

    if (failed) {
        return <Typography variant="body2" sx={{fontStyle: "italic", mb: spaced ? 1 : 0}}>Image indisponible</Typography>;
    }
    if (!src) {
        return <Box sx={{p: 2, mb: spaced ? 1 : 0}}><CircularProgress size={24} color="inherit"/></Box>;
    }
    return (
        <Link href={src} target="_blank" rel="noopener noreferrer">
            <Box component="img" src={src} alt="image"
                 sx={{display: "block", maxWidth: "100%", maxHeight: 260, borderRadius: 2, mb: spaced ? 1 : 0}}/>
        </Link>
    );
}
