import { ShieldCheck } from 'lucide-react';

export function PrivacyNotice({ className = '' }: { className?: string }) {
  return (
    <aside
      aria-label="Privacy and storage"
      className={`rounded-xl border border-surface-200 bg-surface-50 p-3 ${className}`}
    >
      <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-surface-700">
        <ShieldCheck size={15} aria-hidden="true" className="shrink-0 text-brand-600" />
        Privacy &amp; storage
      </div>
      <p className="text-xs leading-relaxed text-surface-600">
        Your rooms and photos are saved in this browser. Photos used for
        server-based AI analysis are sent to our server for processing. Your
        room is not automatically published or added to a central project
        gallery.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-surface-600">
        Clearing browser data can remove your projects. Export a project file
        to keep a backup.
      </p>
    </aside>
  );
}
