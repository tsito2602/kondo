import { useState } from "react";
import { UserRound } from "lucide-react";
import { assignedMember, assigneeName } from "@/data/assignee";
import type { TripMember } from "@/data/types";

export function AssigneeAvatar({
  value,
  members,
}: {
  value: string;
  members: TripMember[];
}) {
  const member = assignedMember(value, members);
  const name = assigneeName(value, members);
  const photo = member?.avatarUrl;
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const initial = (
    member?.name ||
    member?.email ||
    (!value.startsWith("member:") ? value : "")
  )
    .trim()
    .slice(0, 1);
  return (
    <span className="assignee-avatar" role="img" aria-label={name} title={name}>
      {photo && failedPhoto !== photo ? (
        <img
          src={photo}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailedPhoto(photo)}
        />
      ) : initial ? (
        <span aria-hidden="true">{initial}</span>
      ) : (
        <UserRound size={14} aria-hidden="true" />
      )}
    </span>
  );
}
