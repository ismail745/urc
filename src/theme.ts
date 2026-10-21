import {createTheme} from "@mui/material/styles";

export const theme = createTheme({
    colorSchemes: {
        light: {
            palette: {
                primary: {main: "#0b5cad"},
                secondary: {main: "#00a19a"},
                background: {default: "#eef2f7"},
            },
        },
        dark: {
            palette: {
                primary: {main: "#6aa9f0"},
                secondary: {main: "#3fd0c7"},
            },
        },
    },
    shape: {borderRadius: 10},
    typography: {
        fontFamily: "'Inter', 'Roboto', 'Segoe UI', sans-serif",
    },
});

/** Couleur stable dérivée d'un nom, pour les avatars */
export function colorFromName(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `hsl(${Math.abs(hash) % 360}, 55%, 45%)`;
}
