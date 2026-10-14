"use client";

import { FormEvent, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; reference: string }
  | { kind: "error"; message: string };

const inputClass = "mt-2 h-11 w-full rounded-xl border border-yt-border bg-yt-bg px-3 text-yt-text outline-none transition focus:border-[#ff2d78]";
const areaClass = "mt-2 w-full rounded-xl border border-yt-border bg-yt-bg p-3 text-yt-text outline-none transition focus:border-[#ff2d78]";

export function DmcaNoticeForm() {
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const startedAt = useRef(Date.now());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "submitting") return;
    setState({ kind: "submitting" });

    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch("/api/public/dmca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, startedAt: startedAt.current }),
      });
      const result = await response.json() as { ok?: boolean; reference?: string; error?: string };
      if (!response.ok || !result.ok || !result.reference) throw new Error(result.error || "Your notice could not be submitted.");
      form.reset();
      setState({ kind: "success", reference: result.reference });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Your notice could not be submitted." });
    }
  }

  if (state.kind === "success") {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-100" role="status">
        <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5" /> Notice received</div>
        <p className="mt-2 text-sm leading-6">Keep this private reference for follow-up: <strong>{state.reference}</strong>. We will review the notice and may request additional information using the claimant email supplied in the form.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-yt-border bg-yt-bg/60 p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-yt-text">Full legal name<input name="claimantName" required minLength={2} maxLength={120} autoComplete="name" className={inputClass} /></label>
        <label className="text-sm font-medium text-yt-text">Organisation (optional)<input name="organization" maxLength={160} autoComplete="organization" className={inputClass} /></label>
        <label className="text-sm font-medium text-yt-text">Email address<input name="claimantEmail" required type="email" maxLength={254} autoComplete="email" className={inputClass} /></label>
        <label className="text-sm font-medium text-yt-text">Telephone<input name="telephone" required type="tel" maxLength={40} autoComplete="tel" className={inputClass} /></label>
      </div>

      <label className="block text-sm font-medium text-yt-text">Mailing address<textarea name="mailingAddress" required minLength={10} maxLength={600} rows={3} autoComplete="street-address" className={areaClass} /></label>
      <label className="block text-sm font-medium text-yt-text">Copyright owner or rights holder<input name="rightsHolder" required minLength={2} maxLength={200} className={inputClass} /></label>
      <label className="block text-sm font-medium text-yt-text">Identify the copyrighted work<textarea name="copyrightedWork" required minLength={20} maxLength={3000} rows={4} className={areaClass} placeholder="Describe the original work and your rights in it." /></label>
      <label className="block text-sm font-medium text-yt-text">Exact Actrezz URL(s)<textarea name="materialUrls" required minLength={12} maxLength={5000} rows={4} className={areaClass} placeholder="One https://actrezz.online/... URL per line" /></label>
      <label className="block text-sm font-medium text-yt-text">Additional details (optional)<textarea name="additionalDetails" maxLength={3000} rows={4} className={areaClass} placeholder="Source links, registration details, authority documentation, or requested action." /></label>

      <div className="space-y-3 text-sm text-yt-text2">
        <label className="flex cursor-pointer items-start gap-3"><input name="goodFaith" value="yes" required type="checkbox" className="mt-1 h-4 w-4 accent-[#ff2d78]" /><span>I have a good-faith belief that the disputed use is not authorised by the rights holder, its agent, or the law.</span></label>
        <label className="flex cursor-pointer items-start gap-3"><input name="authorityConfirmed" value="yes" required type="checkbox" className="mt-1 h-4 w-4 accent-[#ff2d78]" /><span>I am the rights holder or am authorised to act on the rights holder&apos;s behalf.</span></label>
        <label className="flex cursor-pointer items-start gap-3"><input name="accuracyConfirmed" value="yes" required type="checkbox" className="mt-1 h-4 w-4 accent-[#ff2d78]" /><span>I state, under penalty of perjury, that this notice is accurate.</span></label>
      </div>

      <label className="block text-sm font-medium text-yt-text">Electronic signature<input name="signature" required minLength={2} maxLength={120} className={inputClass} placeholder="Type your full legal name" /></label>
      <label className="sr-only" aria-hidden="true">Leave this field empty<input name="website" tabIndex={-1} autoComplete="off" /></label>

      {state.kind === "error" && <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">{state.message}</p>}
      <p className="text-xs leading-5 text-yt-text2">The information submitted here is used only to evaluate, document and respond to rights-related requests. Do not submit passwords, government identification documents or unrelated sensitive material.</p>
      <button disabled={state.kind === "submitting"} className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#ff2d78] px-5 text-sm font-semibold text-white transition hover:bg-[#ff4b8d] disabled:cursor-wait disabled:opacity-60">
        {state.kind === "submitting" && <Loader2 className="h-4 w-4 animate-spin" />} Submit copyright notice
      </button>
    </form>
  );
}
