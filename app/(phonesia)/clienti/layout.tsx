export default function PhonesiaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ border: "4px dashed #0a7", padding: 20 }}>
      <header style={{ marginBottom: 20 }}>
        <strong>PHONESIA CRM</strong>
      </header>

      {children}
    </div>
  );
}
