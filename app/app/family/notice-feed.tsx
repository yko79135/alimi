"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { nowIso } from "@/lib/utils/dates";

interface Ack {
  read_at: string | null;
  confirmed_at: string | null;
  parent_reply: string | null;
  replied_at: string | null;
}

export interface FeedNotice {
  id: string;
  school_id: string;
  title: string;
  body: string;
  published_at: string;
  requires_confirmation: boolean;
  notice_type: { label: string; color: string | null; is_positive: boolean } | null;
  acknowledgement: Ack[] | null;
}

export function NoticeFeed({ initialNotices }: { initialNotices: FeedNotice[] }) {
  const [notices, setNotices] = useState(initialNotices);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const supabase = createClient();

  function ackFor(n: FeedNotice): Ack | null {
    return n.acknowledgement?.[0] ?? null;
  }

  async function markRead(notice: FeedNotice) {
    if (ackFor(notice)?.read_at) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("acknowledgements")
      .upsert(
        { notice_id: notice.id, guardian_id: user.id, school_id: notice.school_id, read_at: nowIso() },
        { onConflict: "notice_id,guardian_id" }
      );
    setNotices((prev) =>
      prev.map((n) => (n.id === notice.id ? { ...n, acknowledgement: [{ ...ackFor(n), read_at: nowIso() } as Ack] } : n))
    );
  }

  async function confirm(notice: FeedNotice) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("acknowledgements")
      .upsert(
        {
          notice_id: notice.id,
          guardian_id: user.id,
          school_id: notice.school_id,
          confirmed_at: nowIso(),
          read_at: ackFor(notice)?.read_at ?? nowIso(),
        },
        { onConflict: "notice_id,guardian_id" }
      );
    setNotices((prev) =>
      prev.map((n) => (n.id === notice.id ? { ...n, acknowledgement: [{ ...ackFor(n), confirmed_at: nowIso() } as Ack] } : n))
    );
  }

  async function sendReply(notice: FeedNotice) {
    const text = (replyDrafts[notice.id] ?? "").trim();
    if (!text) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("acknowledgements")
      .upsert(
        { notice_id: notice.id, guardian_id: user.id, school_id: notice.school_id, parent_reply: text, replied_at: nowIso() },
        { onConflict: "notice_id,guardian_id" }
      );
    setNotices((prev) =>
      prev.map((n) => (n.id === notice.id ? { ...n, acknowledgement: [{ ...ackFor(n), parent_reply: text, replied_at: nowIso() } as Ack] } : n))
    );
    setReplyDrafts((prev) => ({ ...prev, [notice.id]: "" }));
  }

  return (
    <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-surface">
      {notices.map((n) => {
        const ack = ackFor(n);
        const isOpen = expanded === n.id;
        return (
          <li key={n.id} className="p-4">
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 text-left"
              onClick={() => {
                setExpanded(isOpen ? null : n.id);
                if (!isOpen) markRead(n);
              }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: n.notice_type?.color ?? "#4b8792" }}
                  >
                    {n.notice_type?.label ?? "Notice"}
                  </span>
                  {!ack?.read_at ? <span className="h-2 w-2 rounded-full bg-accent" aria-label="Unread" /> : null}
                </div>
                <p className="mt-1 font-medium text-ink">{n.title}</p>
                <p className="text-xs text-muted">{new Date(n.published_at).toLocaleString()}</p>
              </div>
            </button>

            {isOpen ? (
              <div className="mt-3 space-y-3">
                <p className="whitespace-pre-wrap text-sm text-ink">{n.body}</p>

                {n.requires_confirmation ? (
                  ack?.confirmed_at ? (
                    <p className="text-sm text-success">Confirmed</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => confirm(n)}
                      className="rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-strong"
                    >
                      I&apos;ve read this
                    </button>
                  )
                ) : null}

                <div>
                  {ack?.parent_reply ? (
                    <p className="text-sm text-muted">Your reply: {ack.parent_reply}</p>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        value={replyDrafts[n.id] ?? ""}
                        onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [n.id]: e.target.value }))}
                        placeholder="Reply to the school"
                        className="flex-1 rounded-md border border-line px-3 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => sendReply(n)}
                        className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-canvas"
                      >
                        Send
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
      {notices.length === 0 ? <li className="p-8 text-center text-muted">No notices yet.</li> : null}
    </ul>
  );
}
