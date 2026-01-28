"use client";

import { useState } from "react";

export default function TestUpload() {
  const [result, setResult] = useState<string>("");

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = e.currentTarget;
    const fileInput = form.file as HTMLInputElement;

    if (!fileInput.files || fileInput.files.length === 0) {
      alert("Seleziona un file");
      return;
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);

    const res = await fetch("/api/phonesia/upload-cassa", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setResult(JSON.stringify(data, null, 2));
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Test Upload Cassa</h1>

      <form onSubmit={handleUpload}>
        <input type="file" name="file" accept=".xlsx" />
        <br /><br />
        <button type="submit">Carica file</button>
      </form>

      {result && (
        <pre style={{ marginTop: 20, background: "#eee", padding: 20 }}>
          {result}
        </pre>
      )}
    </div>
  );
}
