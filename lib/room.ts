import type { Profile, Room } from "@/lib/types";
import { nanoid } from "@/lib/uuid";

export function createRoom(profile: Profile): Room {
  return {
    id: nanoid(),
    name: `${profile.name}'s Room`,
    code: nanoid().toUpperCase(),
    members: [{ id: nanoid(), name: profile.name, role: profile.role }]
  };
}

export function joinRoom(profile: Profile, code: string): Room {
  return {
    id: nanoid(),
    name: "Shared Room",
    code: code.toUpperCase(),
    members: [{ id: nanoid(), name: profile.name, role: profile.role }]
  };
}
