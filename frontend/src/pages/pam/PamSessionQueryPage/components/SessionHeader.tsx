import { useMemo } from "react";
import { faClock, faDatabase, faUser } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TPamSession } from "@app/hooks/api/pam/types";

interface SessionHeaderProps {
  session: TPamSession;
}

export const SessionHeader = ({ session }: SessionHeaderProps) => {
  const timeRemaining = useMemo(() => {
    if (!session.expiresAt) return "No expiration";

    const now = new Date();
    const expiresAt = new Date(session.expiresAt);
    const diffMs = expiresAt.getTime() - now.getTime();

    if (diffMs <= 0) return "Expired";

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    }
    return `${minutes}m remaining`;
  }, [session.expiresAt]);

  return (
    <div className="mb-4 rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faDatabase} className="text-mineshaft-400" />
          <div>
            <div className="text-xs text-mineshaft-400">Resource</div>
            <div className="text-sm font-medium">{session.resourceName}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faUser} className="text-mineshaft-400" />
          <div>
            <div className="text-xs text-mineshaft-400">Account</div>
            <div className="text-sm font-medium">{session.accountName}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faClock} className="text-mineshaft-400" />
          <div>
            <div className="text-xs text-mineshaft-400">Session</div>
            <div className="text-sm font-medium">{timeRemaining}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
