import {useEffect, useRef, useState} from "react";
import {Box, CircularProgress, IconButton, Slider, Typography} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import {fetchImage} from "../api/chatApi";

export function formatSeconds(seconds: number) {
    const total = Math.max(0, Math.round(seconds));
    return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
}

/**
 * Lecteur de message vocal. Le fichier (store Blob privé) n'est téléchargé qu'au premier clic sur lecture.
 * La durée est fournie par le message : les fichiers webm enregistrés par Chrome ne l'indiquent pas.
 */
export function AudioMessage({path, duration, mine}: { path: string, duration?: number | null, mine: boolean }) {
    const audio = useRef<HTMLAudioElement | null>(null);
    const [loading, setLoading] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [position, setPosition] = useState(0);
    const [error, setError] = useState(false);
    const [total, setTotal] = useState(duration || 0);

    useEffect(() => () => {
        if (audio.current) {
            audio.current.pause();
            URL.revokeObjectURL(audio.current.src);
        }
    }, []);

    const load = async () => {
        const blob = await fetchImage(path);
        const element = new Audio(URL.createObjectURL(blob));
        element.ontimeupdate = () => setPosition(element.currentTime);
        element.onplay = () => setPlaying(true);
        element.onpause = () => setPlaying(false);
        element.onended = () => {
            setPlaying(false);
            setPosition(0);
        };
        element.onloadedmetadata = () => Number.isFinite(element.duration) && setTotal(element.duration);
        audio.current = element;
        return element;
    };

    const toggle = async () => {
        try {
            let element = audio.current;
            if (!element) {
                setLoading(true);
                element = await load();
                setLoading(false);
            }
            if (element.paused) {
                await element.play();
            } else {
                element.pause();
            }
        } catch (e) {
            console.error(e);
            setLoading(false);
            setError(true);
        }
    };

    const seek = (value: number) => {
        if (audio.current) {
            audio.current.currentTime = value;
            setPosition(value);
        }
    };

    if (error) {
        return <Typography variant="body2" sx={{fontStyle: "italic"}}>Message vocal indisponible</Typography>;
    }
    const color = mine ? "inherit" : "primary";
    return (
        <Box sx={{display: "flex", alignItems: "center", gap: 1, width: {xs: 200, sm: 260}, maxWidth: "100%"}}>
            <IconButton onClick={toggle} size="small" color={color} aria-label={playing ? "Pause" : "Écouter"}>
                {loading ? <CircularProgress size={20} color="inherit"/> : playing ? <PauseIcon/> : <PlayArrowIcon/>}
            </IconButton>
            <Slider size="small" color={mine ? "secondary" : "primary"} min={0} max={total || 1} step={0.1}
                    value={Math.min(position, total || 1)} disabled={!audio.current}
                    onChange={(_, value) => seek(value as number)} aria-label="Position"
                    sx={{flex: 1, color: mine ? "inherit" : undefined}}/>
            <Typography variant="caption" sx={{minWidth: 32, textAlign: "right"}}>
                {formatSeconds(playing || position > 0 ? position : total)}
            </Typography>
        </Box>
    );
}
