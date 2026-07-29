import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="mb-2 text-4xl font-bold text-slate-800">
          SitePulse
        </h1>

        <p className="mb-8 text-slate-500">
          Capture today&apos;s work.
        </p>

        <div className="space-y-4">
          <Link
            href="/attendance"
            className="block w-full rounded-xl bg-blue-600 py-4 text-center font-semibold text-white hover:bg-blue-700"
          >
            Start Today
          </Link>

          <button className="w-full rounded-xl border border-slate-300 py-4">
            View Previous Days
          </button>
        </div>
      </div>
    </main>
  );
}
