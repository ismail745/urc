import type {ReactNode} from "react";
import {Avatar, Box, Card, CardContent, Typography} from "@mui/material";
import ForumIcon from "@mui/icons-material/Forum";

export function AuthLayout({title, children}: { title: string, children: ReactNode }) {
    return (
        <Box sx={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 2,
            background: "linear-gradient(135deg, #0b5cad 0%, #00a19a 100%)",
        }}>
            <Card sx={{width: "100%", maxWidth: 420}} elevation={8}>
                <CardContent sx={{p: 4}}>
                    <Box sx={{display: "flex", flexDirection: "column", alignItems: "center", mb: 3}}>
                        <Avatar sx={{bgcolor: "primary.main", width: 56, height: 56, mb: 1}}>
                            <ForumIcon/>
                        </Avatar>
                        <Typography variant="h5" component="h1" sx={{fontWeight: 700}}>UBO Relay Chat</Typography>
                        <Typography variant="body2" color="text.secondary">{title}</Typography>
                    </Box>
                    {children}
                </CardContent>
            </Card>
        </Box>
    );
}
