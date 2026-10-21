import {useState} from "react";
import type {FormEvent} from "react";
import {Link as RouterLink, Navigate, useLocation, useNavigate} from "react-router-dom";
import {Alert, Box, Button, Link, TextField, Typography} from "@mui/material";
import {loginUser} from "./loginApi";
import {useChatStore} from "../store/chatStore";
import {AuthLayout} from "../components/AuthLayout";
import type {CustomError} from "../model/CustomError";

export function Login() {
    const session = useChatStore(state => state.session);
    const setSession = useChatStore(state => state.setSession);
    const navigate = useNavigate();
    const location = useLocation();
    const from = (location.state as { from?: string } | null)?.from || "/messages";

    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    if (session) {
        return <Navigate to={from} replace/>;
    }

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setLoading(true);
        setError(null);
        loginUser(data.get("login") as string, data.get("password") as string)
            .then(result => {
                setSession(result);
                navigate(from, {replace: true});
            })
            .catch((loginError: CustomError) => setError(loginError.message))
            .finally(() => setLoading(false));
    };

    return (
        <AuthLayout title="Connexion">
            <Box component="form" onSubmit={handleSubmit} sx={{display: "flex", flexDirection: "column", gap: 2}}>
                <TextField name="login" label="Identifiant" required autoFocus autoComplete="username"/>
                <TextField name="password" label="Mot de passe" type="password" required autoComplete="current-password"/>
                {error && <Alert severity="error">{error}</Alert>}
                <Button type="submit" variant="contained" size="large" loading={loading}>Se connecter</Button>
                <Typography variant="body2" sx={{textAlign: "center"}}>
                    Pas encore de compte ? <Link component={RouterLink} to="/register">Créer un compte</Link>
                </Typography>
            </Box>
        </AuthLayout>
    );
}
