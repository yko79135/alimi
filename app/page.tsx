import Link from "next/link";

const FEATURES = [
  {
    title: "Students & guardians",
    body: "A clean roster with archiving, CSV import, and guardian links that stay tenant-safe by design.",
  },
  {
    title: "Communication",
    body: "Target notices by school, grade, homeroom, or student, with read receipts, confirmations, and replies.",
  },
  {
    title: "Attendance",
    body: "Fast daily entry with an exception-based ledger — no wasted rows for a normal present day.",
  },
  {
    title: "Behavior",
    body: "Configurable conduct and praise records, in your school's own terminology.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight text-ink">Alimi</span>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/login" className="text-muted hover:text-ink">
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-brand px-4 py-2 font-medium text-white transition-colors hover:bg-brand-strong"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            One place for your school and its families.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
            Alimi brings students, guardians, notices, attendance, and behavior
            together for small and independent schools — set up in minutes,
            without an IT department.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-full bg-brand px-6 py-3 font-medium text-white shadow-sm transition-colors hover:bg-brand-strong"
            >
              Create your school
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-line px-6 py-3 font-medium text-ink transition-colors hover:bg-canvas"
            >
              Log in
            </Link>
          </div>
        </section>

        <section className="border-t border-line bg-surface">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-lg border border-line p-5">
                <h2 className="font-medium text-ink">{feature.title}</h2>
                <p className="mt-2 text-sm text-muted">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-sm text-muted">
        Alimi — every school keeps its own students, families, and communication separate and secure.
      </footer>
    </div>
  );
}
