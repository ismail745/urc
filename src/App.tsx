import {BrowserRouter, Navigate, Route, Routes} from "react-router-dom";
import {CssBaseline, ThemeProvider} from "@mui/material";
import {theme} from "./theme";
import {Login} from "./user/Login";
import {Register} from "./user/Register";
import {RequireAuth} from "./components/RequireAuth";
import {MessagesPage} from "./chat/MessagesPage";

function App() {
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline/>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login/>}/>
                    <Route path="/register" element={<Register/>}/>
                    <Route element={<RequireAuth/>}>
                        <Route path="/messages" element={<MessagesPage/>}/>
                        <Route path="/messages/:type/:id" element={<MessagesPage/>}/>
                    </Route>
                    <Route path="*" element={<Navigate to="/messages" replace/>}/>
                </Routes>
            </BrowserRouter>
        </ThemeProvider>
    );
}

export default App;
