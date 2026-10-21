import {create} from "zustand";
import type {Conversation, Message, PublicUser, Room, Session} from "../model/common";
import {conversationKey} from "../model/common";

const SESSION_KEY = "session";

function loadSession(): Session | null {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) as Session : null;
    } catch {
        return null;
    }
}

interface ChatState {
    session: Session | null;
    users: PublicUser[];
    rooms: Room[];
    /** Messages indexés par clé de conversation ("user:3", "room:1") */
    messages: Record<string, Message[]>;
    /** Nombre de messages non lus par clé de conversation */
    unread: Record<string, number>;
    selected: Conversation | null;
    /** true si les notifications push sont actives (sinon on rafraîchit périodiquement) */
    pushEnabled: boolean;

    setSession: (session: Session) => void;
    clearSession: () => void;
    setUsers: (users: PublicUser[]) => void;
    setRooms: (rooms: Room[]) => void;
    addRoom: (room: Room) => void;
    setMessages: (key: string, messages: Message[]) => void;
    addMessage: (key: string, message: Message) => void;
    select: (conversation: Conversation | null) => void;
    incrementUnread: (key: string) => void;
    setPushEnabled: (enabled: boolean) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
    session: loadSession(),
    users: [],
    rooms: [],
    messages: {},
    unread: {},
    selected: null,
    pushEnabled: false,

    setSession: (session) => {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        set({session});
    },
    clearSession: () => {
        sessionStorage.removeItem(SESSION_KEY);
        set({session: null, users: [], rooms: [], messages: {}, unread: {}, selected: null, pushEnabled: false});
    },
    setUsers: (users) => set({users}),
    setRooms: (rooms) => set({rooms}),
    addRoom: (room) => set((state) => ({
        rooms: [...state.rooms, room].sort((a, b) => a.name.localeCompare(b.name)),
    })),
    setMessages: (key, messages) => set((state) => ({messages: {...state.messages, [key]: messages}})),
    addMessage: (key, message) => set((state) => {
        const current = state.messages[key] || [];
        if (current.some(m => m.id === message.id)) {
            return {};
        }
        return {messages: {...state.messages, [key]: [...current, message]}};
    }),
    select: (conversation) => set((state) => {
        if (!conversation) {
            return {selected: null};
        }
        const key = conversationKey(conversation);
        const unread = {...state.unread};
        delete unread[key];
        return {selected: conversation, unread};
    }),
    incrementUnread: (key) => set((state) => ({
        unread: {...state.unread, [key]: (state.unread[key] || 0) + 1},
    })),
    setPushEnabled: (pushEnabled) => set({pushEnabled}),
}));
