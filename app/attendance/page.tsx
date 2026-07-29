import Link from "next/link";

const operatives = [
  "Operative 1",
  "Operative 2",
  "Operative 3",
  "Operative 4",
  "Operative 5",
  "Operative 6",
  "Operative 7",
  "Operative 8",
  "Operative 9",
  "Operative 10",
  "Operative 11",
  "Operative 12",
];

export default function AttendancePage() {
  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-xl">
        <Link
          href="/"
          className="mb-6 inline-block font-medium text-blue-600"
        >
          ← Back
        </Link>

        <div className="rounded-2xl bg-white p-6 shadow">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            HVB
          </p>

          <h1 className="mt-1 text-3xl font-bold text-slate-800">
            Who is here today?
          </h1>

          <p className="mt-2 text-slate-500">
            Tap anyone who is absent.
          </p>

          <div className="mt-6 divide-y divide-slate-200">
            {operatives.map((operative) => (
              <label
                key={operative}
                className="flex cursor-pointer items-center justify-between py-4"
              >
                <span className="font-medium text-slate-800">
                  {operative}
                </span>

                <input
                  type="checkbox"
                  defaultChecked
                  className="h-6 w-6 accent-blue-600"
                />
              </label>
            ))}
          </div>

          <button className="mt-6 w-full rounded-xl bg-blue-600 py-4 font-semibold text-white hover:bg-blue-700">
            Save Attendance
          </button>
        </div>
      </div>
    </main>
  );
}
