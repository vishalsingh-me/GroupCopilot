"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { nanoid } from "@/lib/uuid";

type KnowledgeItem = { id: string; title: string; content: string; createdAt: string };

export default function KnowledgePage() {
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [consent, setConsent] = useState(false);

  const addItem = () => {
    if (!title.trim() || !content.trim() || !consent) return;
    const item = {
      id: nanoid(),
      title: title.trim(),
      content: content.trim(),
      createdAt: new Date().toISOString()
    };
    setKnowledgeItems([item, ...knowledgeItems]);
    setTitle("");
    setContent("");
    setConsent(false);
  };

  const removeItem = (id: string) => {
    setKnowledgeItems(knowledgeItems.filter((item) => item.id !== id));
  };

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold">Personal knowledge vault</h1>
          <p className="text-sm text-muted-foreground">
            Upload notes or paste text to help the assistant personalize responses. This uses retrieval only.
          </p>
        </header>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="grid gap-3">
            <label className="text-sm font-medium">Title</label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            <label className="text-sm font-medium">Notes or pasted text</label>
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-[180px]"
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              I consent to using this data for retrieval-based personalization. No training is performed.
            </label>
            <Button onClick={addItem} disabled={!consent || !title.trim() || !content.trim()}>
              Add to vault
            </Button>
          </div>
        </div>

        <div className="grid gap-3">
          {knowledgeItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No personal knowledge yet.</p>
          ) : (
            knowledgeItems.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <Button variant="ghost" size="sm" onClick={() => removeItem(item.id)}>
                    Delete
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{item.content}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
