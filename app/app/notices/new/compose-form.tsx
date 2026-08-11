"use client";

import { useActionState, useMemo, useState } from "react";
import { createNotice, createAttachmentUploadUrl, type ComposeState } from "../actions";
import type { GradeLevel, Homeroom, NoticeType, TargetScope } from "@/types/database";

const initialState: ComposeState = { error: null };

interface UploadedFile {
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export function ComposeForm({
  schoolId,
  noticeTypes,
  gradeLevels,
  homerooms,
  students,
}: {
  schoolId: string;
  noticeTypes: NoticeType[];
  gradeLevels: GradeLevel[];
  homerooms: Homeroom[];
  students: { id: string; name: string }[];
}) {
  const noticeId = useMemo(() => crypto.randomUUID(), []);
  const [state, formAction, pending] = useActionState(createNotice.bind(null, schoolId), initialState);
  const [scope, setScope] = useState<TargetScope>("school");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (file.type !== "application/pdf") {
      setUploadError("Only PDF attachments are supported.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setUploadError("File must be 20MB or smaller.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const { path, token, signedUrl } = await createAttachmentUploadUrl(schoolId, noticeId, file.name);
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type, "x-upsert": "false" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("upload failed");
      void token;
      setAttachments((prev) => [...prev, { path, fileName: file.name, mimeType: file.type, sizeBytes: file.size }]);
    } catch {
      setUploadError("Could not upload this file. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="notice_id" value={noticeId} />
      <input type="hidden" name="student_ids" value={JSON.stringify(selectedStudents)} />
      <input type="hidden" name="attachment_paths" value={JSON.stringify(attachments)} />

      <label className="block text-sm text-ink">
        Type
        <select name="notice_type_id" className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm">
          {noticeTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm text-ink">
        Title
        <input name="title" required className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm" />
      </label>

      <label className="block text-sm text-ink">
        Message
        <textarea
          name="body"
          required
          rows={6}
          className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Audience</legend>
        <select
          name="target_scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as TargetScope)}
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
        >
          <option value="school">Entire school</option>
          <option value="grade">A grade</option>
          <option value="homeroom">A homeroom</option>
          <option value="student">Specific students</option>
        </select>

        {scope === "grade" ? (
          <select name="target_grade_level_id" required className="w-full rounded-md border border-line px-3 py-2 text-sm">
            <option value="">Choose grade</option>
            {gradeLevels.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : null}

        {scope === "homeroom" ? (
          <select name="target_homeroom_id" required className="w-full rounded-md border border-line px-3 py-2 text-sm">
            <option value="">Choose homeroom</option>
            {homerooms.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        ) : null}

        {scope === "student" ? (
          <div className="max-h-48 overflow-auto rounded-md border border-line p-2">
            {students.map((s) => (
              <label key={s.id} className="flex items-center gap-2 py-1 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={selectedStudents.includes(s.id)}
                  onChange={(e) =>
                    setSelectedStudents((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)))
                  }
                />
                {s.name}
              </label>
            ))}
          </div>
        ) : null}
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="requires_confirmation" />
        Require guardians to confirm they read this
      </label>

      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">Attachments (PDF, up to 20MB each)</p>
        <label className="inline-block cursor-pointer rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-canvas">
          {uploading ? "Uploading…" : "Add PDF"}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
        {uploadError ? <p className="text-sm text-danger">{uploadError}</p> : null}
        {attachments.length > 0 ? (
          <ul className="text-sm text-muted">
            {attachments.map((a) => (
              <li key={a.path}>{a.fileName}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {state.error ? <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending || uploading}
        className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Publishing…" : "Publish notice"}
      </button>
    </form>
  );
}
