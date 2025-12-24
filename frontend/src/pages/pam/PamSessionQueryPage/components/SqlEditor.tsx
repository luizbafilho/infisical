import { useState } from "react";
import {
  faCircle,
  faCircleNotch,
  faExclamationTriangle,
  faPlay
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, TextArea } from "@app/components/v2";

import { ConnectionStatus, usePamWebSocket } from "../hooks/usePamWebSocket";
import { QueryResults } from "./QueryResults";

interface SqlEditorProps {
  sessionId: string;
}

const ConnectionStatusIndicator = ({ status }: { status: ConnectionStatus }) => {
  const statusConfig = {
    connected: {
      icon: faCircle,
      color: "text-green-500",
      label: "Connected",
      spin: false
    },
    connecting: {
      icon: faCircleNotch,
      color: "text-yellow-500",
      label: "Connecting...",
      spin: true
    },
    reconnecting: {
      icon: faCircleNotch,
      color: "text-yellow-500",
      label: "Reconnecting...",
      spin: true
    },
    disconnected: {
      icon: faExclamationTriangle,
      color: "text-red-500",
      label: "Disconnected",
      spin: false
    }
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <FontAwesomeIcon
        icon={config.icon}
        className={`${config.color} text-xs`}
        spin={config.spin}
      />
      <span className="text-sm text-mineshaft-300">{config.label}</span>
    </div>
  );
};

export const SqlEditor = ({ sessionId }: SqlEditorProps) => {
  const [query, setQuery] = useState("");
  const { connectionStatus, executeQuery, lastResult, lastError, isExecuting } =
    usePamWebSocket(sessionId);

  const handleExecute = () => {
    if (!query.trim()) return;
    executeQuery(query, { maxRows: 1000 });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Execute query on Cmd/Ctrl + Enter
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleExecute();
    }
  };

  const canExecute = connectionStatus === "connected" && !isExecuting && query.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* Query Input Section */}
      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-mineshaft-200">SQL Query</h3>
          <ConnectionStatusIndicator status={connectionStatus} />
        </div>
        <TextArea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter your SQL query here... (Cmd/Ctrl + Enter to execute)"
          className="font-mono"
          rows={8}
        />
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-mineshaft-400">
            Tip: Press <kbd className="rounded bg-mineshaft-700 px-1">Cmd</kbd> +{" "}
            <kbd className="rounded bg-mineshaft-700 px-1">Enter</kbd> to execute
          </div>
          <Button
            onClick={handleExecute}
            disabled={!canExecute}
            isLoading={isExecuting}
            leftIcon={<FontAwesomeIcon icon={faPlay} />}
            size="sm"
          >
            Execute Query
          </Button>
        </div>
      </div>

      {/* Results Section */}
      <QueryResults data={lastResult || null} error={lastError || null} />
    </div>
  );
};
