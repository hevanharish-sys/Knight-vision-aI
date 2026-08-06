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

export type AccessibilityProfile =
  | "blind"
  | "deaf"
  | "speech"
  | "low-vision"
  | "senior"
  | "autism"
  | "none";

export type MedicalProfile = {
  name: string;
  bloodType: string;
  allergies: string;
  conditions: string;
  emergencyContact: string;
  emergencyPhone: string;
};

type ProfileContextValue = {
  profile: AccessibilityProfile | null;
  setProfile: (profile: AccessibilityProfile) => void;
  medical: MedicalProfile;
  setMedical: (medical: MedicalProfile) => void;
  ready: boolean;
};

const PROFILE_KEY = "knight-vision-profile";
const MEDICAL_KEY = "knight-vision-medical";

const defaultMedical: MedicalProfile = {
  name: "Demo User",
  bloodType: "O+",
  allergies: "None recorded",
  conditions: "None recorded",
  emergencyContact: "Family Contact",
  emergencyPhone: "+91 98765 43210",
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export const PROFILE_OPTIONS: {
  id: AccessibilityProfile;
  label: string;
  description: string;
}[] = [
  {
    id: "blind",
    label: "Voice Guide",
    description: "Listen and speak — the app talks you through each step",
  },
  {
    id: "deaf",
    label: "Captions & Sign",
    description: "Large captions, visual alerts, and sign language tools",
  },
  {
    id: "speech",
    label: "Type & Sign",
    description: "Type or use sign — optional spoken replies for others",
  },
  {
    id: "low-vision",
    label: "Large & Clear",
    description: "Bigger text, high contrast, and simpler screens",
  },
  {
    id: "senior",
    label: "Simple Steps",
    description: "One clear step at a time with calm, large buttons",
  },
  {
    id: "autism",
    label: "Calm Focus",
    description: "Quiet motion, steady layout, and short clear labels",
  },
  {
    id: "none",
    label: "Standard",
    description: "Full multimodal experience — speech, sign, vision, and more",
  },
];

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<AccessibilityProfile | null>(
    null
  );
  const [medical, setMedicalState] = useState<MedicalProfile>(defaultMedical);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(PROFILE_KEY) as AccessibilityProfile | null;
    const savedMedical = localStorage.getItem(MEDICAL_KEY);
    let nextMedical = defaultMedical;
    if (savedMedical) {
      try {
        nextMedical = JSON.parse(savedMedical) as MedicalProfile;
      } catch {
        /* keep default */
      }
    }
    // Hydrate from localStorage after mount (client-only persistence).
    queueMicrotask(() => {
      if (saved) setProfileState(saved);
      setMedicalState(nextMedical);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    root.dataset.profile = profile ?? "none";
  }, [profile, ready]);

  const setProfile = useCallback((next: AccessibilityProfile) => {
    setProfileState(next);
    localStorage.setItem(PROFILE_KEY, next);
  }, []);

  const setMedical = useCallback((next: MedicalProfile) => {
    setMedicalState(next);
    localStorage.setItem(MEDICAL_KEY, JSON.stringify(next));
  }, []);

  const value = useMemo(
    () => ({ profile, setProfile, medical, setMedical, ready }),
    [profile, setProfile, medical, setMedical, ready]
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}

export function profilePrefersTTS(profile: AccessibilityProfile | null) {
  return profile === "blind" || profile === "low-vision" || profile === "senior";
}

export function profilePrefersCaptions(profile: AccessibilityProfile | null) {
  return profile === "deaf" || profile === "speech" || profile === "none";
}
