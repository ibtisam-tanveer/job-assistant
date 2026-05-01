export default function HomePage() {
  return (
    <main style={{ padding: "2rem", maxWidth: "42rem" }}>
      <h1>Job Assistant</h1>
      <p>
        Next.js UI shell. Point <code>NEXT_PUBLIC_API_URL</code> at the FastAPI
        service (default <code>http://localhost:8000</code>).
      </p>
      <p>
        Apply flow will live at{" "}
        <code>/jobs/[jobId]/apply</code> once the API is implemented.
      </p>
    </main>
  );
}
