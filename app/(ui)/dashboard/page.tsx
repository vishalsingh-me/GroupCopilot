import { getCurrentUser } from "@/server/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-2">Welcome, {user.displayName}</h1>
      <p className="text-muted-foreground">
        Dashboard under construction — Person A is building the UI here.
      </p>
      <div className="mt-4 rounded border p-4 bg-muted text-sm font-mono">
        <p>User: {user.email}</p>
        <p>ID: {user.id}</p>
      </div>
    </main>
  );
}
