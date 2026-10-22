import {create} from "zustand";
import type {Conversation, Message, PublicUser, Reactions, Room, Session} from "../model/common";
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
    /** true si les notifications push (Pusher Beams) sont actives */
    pushEnabled: boolean;
    /** Raison pour laquelle les notifications push n'ont pas pu être activées */
    pushError: string | null;
    /** Identifiants des utilisateurs en ligne */
    online: number[];
    /** Date de dernière activité (ms) par utilisateur */
    lastSeen: Record<number, number>;

    setSession: (session: Session) => void;
    clearSession: () => void;
    setUsers: (users: PublicUser[]) => void;
    setRooms: (rooms: Room[]) => void;
    addRoom: (room: Room) => void;
    removeRoom: (roomId: number) => void;
    setMessages: (key: string, messages: Message[]) => void;
    addMessage: (key: string, message: Message) => void;
    select: (conversation: Conversation | null) => void;
    incrementUnread: (key: string) => void;
    setPushEnabled: (enabled: boolean, error?: string | null) => void;
    setPresence: (online: number[], lastSeen: Record<number, number>) => void;
    setReactions: (key: string, messageId: string, reactions: Reactions) => void;
    setAvatar: (userId: number, avatar: string | null) => void;
    setUsername: (username: string) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
    session: loadSession(),
    users: [],
    rooms: [],
    messages: {},
    unread: {},
    selected: null,
    pushEnabled: false,
    pushError: null,
    online: [],
    lastSeen: {},

    setSession: (session) => {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        set({session});
    },
    clearSession: () => {
        sessionStorage.removeItem(SESSION_KEY);
        set({session: null, users: [], rooms: [], messages: {}, unread: {}, selected: null, pushEnabled: false, pushError: null, online: [], lastSeen: {}});
    },
    setUsers: (users) => set({users}),
    setRooms: (rooms) => set({rooms}),
    addRoom: (room) => set((state) => ({
        rooms: [...state.rooms, room].sort((a, b) => a.name.localeCompare(b.name)),
    })),
    removeRoom: (roomId) => set((state) => {
        const key = "room:" + roomId;
        const messages = {...state.messages};
        const unread = {...state.unread};
        delete messages[key];
        delete unread[key];
        return {rooms: state.rooms.filter(room => room.room_id !== roomId), messages, unread};
    }),
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
    setPushEnabled: (pushEnabled, pushError = null) => set({pushEnabled, pushError}),
    setPresence: (online, lastSeen) => set({online, lastSeen}),
    setReactions: (key, messageId, reactions) => set((state) => ({
        messages: {
            ...state.messages,
            [key]: (state.messages[key] || []).map(m => m.id === messageId ? {...m, reactions} : m),
        },
    })),
    setUsername: (username) => set((state) => {
        if (!state.session) {
            return {};
        }
        const session = {...state.session, username};
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return {
            session,
            users: state.users.map(user => user.user_id === session.id ? {...user, username} : user),
        };
    }),
    setAvatar: (userId, avatar) => set((state) => ({
        users: state.users.map(user => user.user_id === userId ? {...user, avatar} : user),
    })),
}));
