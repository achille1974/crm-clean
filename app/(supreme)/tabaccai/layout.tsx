export default function SupremeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ border: "4px solid black", padding: 20 }}>
      <header style={{ marginBottom: 20 }}>
        <strong>SUPREME CRM</strong>
      </header>

      {children}
    </div>
  );
}
