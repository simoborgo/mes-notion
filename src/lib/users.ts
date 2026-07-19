import type { Session, Role } from "./auth";

interface User {
  username: string;
  password: string;
  role: Role;
  name: string;
}

function getUsers(): User[] {
  const raw = process.env.USERS_JSON;
  if (!raw) {
    console.warn("[users] USERS_JSON non configurata — nessun utente disponibile");
    return [];
  }
  try {
    return JSON.parse(raw) as User[];
  } catch {
    console.error("[users] USERS_JSON non è JSON valido");
    return [];
  }
}

export async function validateCredentials(
  username: string,
  password: string
): Promise<Session | null> {
  const users = getUsers();
  const user = users.find((u) => u.username === username && u.password === password);
  if (!user) return null;
  return { username: user.username, name: user.name, role: user.role };
}
