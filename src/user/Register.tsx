import {useState} from "react";
import type {FormEvent} from "react";
import {Link as RouterLink, Navigate, useNavigate} from "react-router-dom";
import {Alert, Box, Button, Link, TextField, Typography} from "@mui/material";
import {registerUser} from "./loginApi";
import {useChatStore} from "../store/chatStore";
import {AuthLayout} from "../components/AuthLayout";
import type {CustomError} from "../model/CustomError";

export function Register() {
    const session = useChatStore(state => state.session);
    const setSession = useChatStore(state => state.setSession);
    const navigate = useNavigate();

    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    if (session) {
        return <Navigate to="/messages" replace/>;
    }

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const password = data.get("password") as string;
        if (password !== data.get("confirm")) {
            setError("Les mots de passe ne correspondent pas");
            return;
        }
        setLoading(true);
        setError(null);
        registerUser(data.get("login") as string, data.get("email") as string, password)
            .then(result => {
                // Connexion automatique après l'inscription
                setSession(result);
                navigate("/messages", {replace: true});
            })
            .catch((registerError: CustomError) => setError(registerError.message))
            .finally(() => setLoading(false));
    };

    return (
        <AuthLayout title="Créer un compte">
            <Box component="form" onSubmit={handleSubmit} sx={{display: "flex", flexDirection: "column", gap: 2}}>
                <TextField name="login" label="Identifiant" required autoFocus autoComplete="username"
                           slotProps={{htmlInput: {maxLength: 50}}}/>
                <TextField name="email" label="Email" type="email" required autoComplete="email"/>
                <TextField name="password" label="Mot de passe" type="password" required autoComplete="new-password"
                           helperText="6 caractères minimum" slotProps={{htmlInput: {minLength: 6}}}/>
                <TextField name="confirm" label="Confirmer le mot de passe" type="password" required
                           autoComplete="new-password"/>
                {error && <Alert severity="error">{error}</Alert>}
                <Button type="submit" variant="contained" size="large" loading={loading}>S'inscrire</Button>
                <Typography variant="body2" sx={{textAlign: "center"}}>
                    Déjà inscrit ? <Link component={RouterLink} to="/login">Se connecter</Link>
                </Typography>
            </Box>
        </AuthLayout>
    );
}
