"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase, type KvUserRow } from "@/lib/supabase";

export type AuthUser = {
  id: string;
  name: string;
  /** Never returned from Supabase after login — kept optional for local UI only. */
  pin?: string;
  createdAt: string;
};

type AuthResult = { ok: true } | { ok: false; error: string };

type AuthContextValue = {
  ready: boolean;
  user: AuthUser | null;
  users: AuthUser[];
  register: (name: string, pin: string) => Promise<AuthResult>;
  login: (name: string, pin: string) => Promise<AuthResult>;
  logout: () => void;
  findUserByName: (name: string) => AuthUser | undefined;
};

const SESSION_KEY = "knight-vision-auth-session";

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

async function hashPin(pin: string, nameNormalized: string) {
  const payload = `${nameNormalized}:${pin}:knight-vision-ai`;
  const data = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function rowToUser(row: KvUserRow): AuthUser {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

function loadSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function saveSession(user: AuthUser | null) {
  if (!user) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      id: user.id,
      name: user.name,
      createdAt: user.createdAt,
    })
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const session = loadSession();
    queueMicrotask(() => {
      setUser(session);
      setReady(true);
    });
  }, []);

  const findUserByName = useCallback((_name: string) => undefined, []);

  const register = useCallback(async (name: string, pin: string): Promise<AuthResult> => {
    const cleanName = name.trim().replace(/\s+/g, " ");
    const cleanPin = pin.replace(/\D/g, "").slice(0, 4);
    const nameNormalized = normalizeName(cleanName);

    if (cleanName.length < 2) {
      return { ok: false, error: "Please say a longer name." };
    }
    if (cleanPin.length !== 4) {
      return { ok: false, error: "PIN must be 4 digits." };
    }

    const { data: existing, error: lookupError } = await supabase
      .from("kv_users")
      .select("id")
      .eq("name_normalized", nameNormalized)
      .maybeSingle();

    if (lookupError) {
      console.error("[auth] register lookup", lookupError);
      return {
        ok: false,
        error:
          "Could not reach Supabase. Check your connection and that the kv_users table exists.",
      };
    }
    if (existing) {
      return {
        ok: false,
        error: "That name is already registered. Please sign in instead.",
      };
    }

    const pinHash = await hashPin(cleanPin, nameNormalized);
    const { data, error } = await supabase
      .from("kv_users")
      .insert({
        name: cleanName,
        name_normalized: nameNormalized,
        pin_hash: pinHash,
      })
      .select("id, name, name_normalized, pin_hash, created_at")
      .single();

    if (error || !data) {
      console.error("[auth] register insert", error);
      return {
        ok: false,
        error: error?.message?.includes("relation")
          ? "Supabase table missing. Run supabase/schema.sql in the SQL Editor."
          : "Could not create account. Please try again.",
      };
    }

    const next = rowToUser(data as KvUserRow);
    saveSession(next);
    setUser(next);
    return { ok: true };
  }, []);

  const login = useCallback(async (name: string, pin: string): Promise<AuthResult> => {
    const cleanPin = pin.replace(/\D/g, "").slice(0, 4);
    const nameNormalized = normalizeName(name);

    if (cleanPin.length !== 4) {
      return { ok: false, error: "PIN must be 4 digits." };
    }

    const { data, error } = await supabase
      .from("kv_users")
      .select("id, name, name_normalized, pin_hash, created_at")
      .eq("name_normalized", nameNormalized)
      .maybeSingle();

    if (error) {
      console.error("[auth] login", error);
      return {
        ok: false,
        error:
          "Could not reach Supabase. Check your connection and that the kv_users table exists.",
      };
    }
    if (!data) {
      return { ok: false, error: "No account found with that name." };
    }

    const pinHash = await hashPin(cleanPin, nameNormalized);
    if (pinHash !== (data as KvUserRow).pin_hash) {
      return { ok: false, error: "Incorrect PIN. Try again." };
    }

    const next = rowToUser(data as KvUserRow);
    saveSession(next);
    setUser(next);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    saveSession(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      user,
      users: user ? [user] : [],
      register,
      login,
      logout,
      findUserByName,
    }),
    [ready, user, register, login, logout, findUserByName]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
