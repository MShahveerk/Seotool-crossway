"use client";

export default function EmailInboundConfigFields({ config, setConfig, contentType = "post" }) {
  return (
    <div className="md:col-span-2 rounded-lg border border-sky-200 bg-sky-50/50 p-4 space-y-3">
      <div>
        <p className="font-semibold text-gray-900">Email inbound (IMAP)</p>
        <p className="mt-0.5 text-xs text-gray-600">
          Poll an inbox using the same credentials as your mail provider (e.g. Gmail app password). Unread messages
          with an image or video attachment become {contentType === "blog" ? "blog drafts" : "post approvals"}.
          {contentType === "blog" ? ' Use subject prefix `[BLOG]`.' : " Any unread email with media works."}
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(config.emailInboundEnabled)}
          onChange={(e) => setConfig((c) => ({ ...c, emailInboundEnabled: e.target.checked }))}
        />
        Enable automatic email polling (every 10 minutes)
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase text-gray-500">IMAP host</span>
          <input
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            value={config.imapHost || ""}
            onChange={(e) => setConfig((c) => ({ ...c, imapHost: e.target.value }))}
            placeholder="imap.gmail.com"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-gray-500">IMAP port</span>
          <input
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            type="number"
            value={config.imapPort ?? 993}
            onChange={(e) => setConfig((c) => ({ ...c, imapPort: Number(e.target.value) || 993 }))}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-gray-500">IMAP username</span>
          <input
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            value={config.imapUser || ""}
            onChange={(e) => setConfig((c) => ({ ...c, imapUser: e.target.value }))}
            placeholder="you@company.com"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-gray-500">IMAP password</span>
          <input
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            type="password"
            value={config.imapPassword || ""}
            onChange={(e) => setConfig((c) => ({ ...c, imapPassword: e.target.value }))}
            placeholder="App password"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs font-semibold uppercase text-gray-500">Folder</span>
          <input
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            value={config.imapFolder || "INBOX"}
            onChange={(e) => setConfig((c) => ({ ...c, imapFolder: e.target.value }))}
          />
        </label>
      </div>

      {config.lastEmailPullAt ? (
        <p className="text-xs text-gray-500">Last email pull: {new Date(config.lastEmailPullAt).toLocaleString()}</p>
      ) : null}
    </div>
  );
}
