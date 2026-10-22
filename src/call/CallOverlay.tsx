import {useEffect, useRef, useState} from "react";
import {Box, Dialog, Fab, Tooltip, Typography, useMediaQuery, useTheme} from "@mui/material";
import CallIcon from "@mui/icons-material/Call";
import CallEndIcon from "@mui/icons-material/CallEnd";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import {useChatStore} from "../store/chatStore";
import {UserAvatar} from "../chat/UserAvatar";
import {accept, hangUp, toggleCamera, toggleMute, useCallStore} from "./callManager";
import type {CallPhase} from "./callManager";

function formatDuration(ms: number) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return minutes + ":" + String(seconds % 60).padStart(2, "0");
}

function CallTimer({since}: { since: number }) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);
    return <>{formatDuration(now - since)}</>;
}

/** Vidéo d'un flux local ou distant */
function StreamVideo({stream, muted, mirrored, sx}: { stream: MediaStream | null, muted?: boolean, mirrored?: boolean, sx?: object }) {
    const ref = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        if (ref.current) {
            ref.current.srcObject = stream;
        }
    }, [stream]);
    return (
        <Box component="video" ref={ref} autoPlay playsInline muted={muted}
             sx={{objectFit: "cover", bgcolor: "black", transform: mirrored ? "scaleX(-1)" : undefined, ...sx}}/>
    );
}

const PHASE_LABELS: Record<CallPhase, string> = {
    outgoing: "Appel en cours…",
    incoming: "",
    connecting: "Connexion…",
    connected: "",
    ended: "",
};

/** Fenêtre d'appel audio / vidéo : sonnerie, communication et fin d'appel */
export function CallOverlay() {
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
    const call = useCallStore(state => state.call);
    const localStream = useCallStore(state => state.localStream);
    const remoteStream = useCallStore(state => state.remoteStream);
    const muted = useCallStore(state => state.muted);
    const cameraOff = useCallStore(state => state.cameraOff);
    const avatar = useChatStore(state => state.users.find(user => user.user_id === call?.peer.id)?.avatar);

    if (!call) {
        return null;
    }

    const showRemoteVideo = call.video && remoteStream !== null && call.phase === "connected";
    const status = call.phase === "incoming"
        ? (call.video ? "Appel vidéo entrant" : "Appel audio entrant")
        : call.phase === "connected" && call.connectedAt
            ? <CallTimer since={call.connectedAt}/>
            : call.phase === "ended" ? call.endReason : PHASE_LABELS[call.phase];

    return (
        <Dialog open fullScreen={fullScreen} maxWidth="md" fullWidth
                onClose={(_, reason) => reason !== "backdropClick" && hangUp()}
                slotProps={{paper: {sx: {bgcolor: "#0b141a", color: "white", overflow: "hidden"}}}}>
            <Box sx={{position: "relative", height: fullScreen ? "100%" : 560, display: "flex", flexDirection: "column"}}>
                {/* Le flux distant est toujours lu (son de l'appel audio), mais affiché seulement en vidéo */}
                <StreamVideo stream={remoteStream}
                             sx={showRemoteVideo
                                 ? {position: "absolute", inset: 0, width: "100%", height: "100%"}
                                 : {position: "absolute", width: 1, height: 1, opacity: 0}}/>

                <Box sx={{
                    position: "relative", flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: showRemoteVideo ? "flex-start" : "center", gap: 1.5, pt: 4, textAlign: "center",
                    background: showRemoteVideo ? "linear-gradient(rgba(0,0,0,0.55), transparent 30%)" : undefined,
                }}>
                    {!showRemoteVideo && <UserAvatar username={call.peer.name} avatar={avatar} size={120}/>}
                    <Typography variant="h5" sx={{fontWeight: 600}}>{call.peer.name}</Typography>
                    <Typography sx={{opacity: 0.8}} aria-live="polite">{status}</Typography>
                </Box>

                {call.video && localStream && call.phase !== "ended" && (
                    <StreamVideo stream={localStream} muted mirrored sx={{
                        position: "absolute", right: 16, bottom: 110, width: {xs: 110, sm: 180}, aspectRatio: "3 / 4",
                        borderRadius: 2, boxShadow: 4, opacity: cameraOff ? 0.3 : 1,
                    }}/>
                )}

                <Box sx={{position: "relative", display: "flex", justifyContent: "center", gap: 3, py: 3,
                    background: showRemoteVideo ? "linear-gradient(transparent, rgba(0,0,0,0.55))" : undefined}}>
                    {call.phase === "incoming" ? (
                        <>
                            <Tooltip title="Refuser">
                                <Fab color="error" onClick={() => hangUp()} aria-label="Refuser"><CallEndIcon/></Fab>
                            </Tooltip>
                            <Tooltip title="Décrocher">
                                <Fab onClick={accept} aria-label="Décrocher"
                                     sx={{bgcolor: "#25d366", color: "white", "&:hover": {bgcolor: "#1da851"}}}>
                                    {call.video ? <VideocamIcon/> : <CallIcon/>}
                                </Fab>
                            </Tooltip>
                        </>
                    ) : call.phase !== "ended" && (
                        <>
                            <Tooltip title={muted ? "Réactiver le micro" : "Couper le micro"}>
                                <Fab onClick={toggleMute} aria-label="Micro"
                                     sx={{bgcolor: muted ? "white" : "rgba(255,255,255,0.15)", color: muted ? "black" : "white"}}>
                                    {muted ? <MicOffIcon/> : <MicIcon/>}
                                </Fab>
                            </Tooltip>
                            {call.video && (
                                <Tooltip title={cameraOff ? "Activer la caméra" : "Couper la caméra"}>
                                    <Fab onClick={toggleCamera} aria-label="Caméra"
                                         sx={{bgcolor: cameraOff ? "white" : "rgba(255,255,255,0.15)", color: cameraOff ? "black" : "white"}}>
                                        {cameraOff ? <VideocamOffIcon/> : <VideocamIcon/>}
                                    </Fab>
                                </Tooltip>
                            )}
                            <Tooltip title="Raccrocher">
                                <Fab color="error" onClick={() => hangUp()} aria-label="Raccrocher"><CallEndIcon/></Fab>
                            </Tooltip>
                        </>
                    )}
                </Box>
            </Box>
        </Dialog>
    );
}
