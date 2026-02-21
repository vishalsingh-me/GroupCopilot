"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ConnectCard from "@/components/integrations/ConnectCard";
import { useRoomStore } from "@/lib/store";

export default function SettingsPage() {
  const { settings, setSettings, messages, resetProfile, setKnowledgeItems } = useRoomStore();
  const [apiKey, setApiKey] = useState(settings.apiKey ?? "");
  const [mcpUrl, setMcpUrl] = useState(settings.mcpServerUrl ?? "");

  const exportConversation = () => {
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "group-copilot-conversation.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage model providers, tools, and privacy controls.</p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Model provider</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Provider</label>
              <select
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                value={settings.modelProvider}
                onChange={(event) => setSettings({ modelProvider: event.target.value as "gemini" | "openai" | "local" })}
              >
                <option value="gemini">Google Gemini (proxy)</option>
                <option value="openai">OpenAI (placeholder)</option>
                <option value="local">Local mock</option>
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">API key</label>
              <Input
                type="password"
                value={apiKey}
                placeholder="Stored server-side in production"
                onChange={(event) => setApiKey(event.target.value)}
              />
              <div className="flex items-center gap-2">
                <Switch
                  checked={settings.devModeStoreKeys}
                  onCheckedChange={(value) => setSettings({ devModeStoreKeys: value })}
                />
                <span className="text-xs text-muted-foreground">
                  Dev-only: store key in local state for demos.
                </span>
              </div>
              <Button
                variant="outline"
                onClick={() => setSettings({ apiKey: settings.devModeStoreKeys ? apiKey : undefined })}
              >
                Save key
              </Button>
              <p className="text-xs text-muted-foreground">
                In production, keys must be stored server-side and never persisted in localStorage.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tool integrations</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">MCP server base URL</label>
              <Input
                value={mcpUrl}
                placeholder="https://mcp.yourserver.dev"
                onChange={(event) => setMcpUrl(event.target.value)}
              />
              <Button variant="outline" onClick={() => setSettings({ mcpServerUrl: mcpUrl })}>
                Save MCP URL
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={settings.requireToolConfirmation}
                onCheckedChange={(value) => setSettings({ requireToolConfirmation: value })}
              />
              <span className="text-sm">Tool actions require confirmation</span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <ConnectCard
                name="Notion"
                status="mock"
                description="Create tickets from the assistant into a shared board."
              />
              <ConnectCard
                name="Google Calendar"
                status="mock"
                description="Schedule meetings from suggested slots."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Privacy controls</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button variant="outline" onClick={exportConversation}>
              Export conversation
            </Button>
            <Button variant="outline" onClick={resetProfile}>
              Clear my data
            </Button>
            <Button variant="destructive" onClick={() => setKnowledgeItems([])}>
              Delete personal knowledge
            </Button>
            <p className="text-xs text-muted-foreground">
              Personal knowledge uses retrieval (RAG) with explicit consent. Training is not performed.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
