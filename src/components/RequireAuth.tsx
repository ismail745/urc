import {Navigate, Outlet, useLocation} from "react-router-dom";
import {useChatStore} from "../store/chatStore";

/** Redirige vers la page de connexion si l'utilisateur n'est pas connecté */
export function RequireAuth() {
    const session = useChatStore(state => state.session);
    const location = useLocation();
    if (!session) {
        return <Navigate to="/login" replace state={{from: location.pathname}}/>;
    }
    return <Outlet/>;
}
