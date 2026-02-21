import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold mb-4">GroupCoPilot</h1>
        <p className="text-muted-foreground text-lg mb-8">
          AI Collaboration Governor for Student Group Projects
        </p>
        <Link
          href="/login"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground"
        >
          Get Started
        </Link>
      </div>
    </main>
  );
}
