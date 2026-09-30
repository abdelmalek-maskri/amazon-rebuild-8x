import { ApiError, getHealth, type Health } from "@/lib/api";

export default async function Home() {
  let health: Health | null = null;
  let problem = "";
  try {
    health = await getHealth();
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    problem = `${err.code}: ${err.message}`;
  }

  return (
    <main className="mx-auto max-w-xl p-8 font-sans">
      <h1 className="text-2xl font-semibold">Store</h1>
      {health ? (
        <p className="mt-4">
          API <strong>{health.status}</strong>, database <strong>{health.db}</strong>
        </p>
      ) : (
        <p className="mt-4 text-red-700">API unreachable ({problem})</p>
      )}
    </main>
  );
}
