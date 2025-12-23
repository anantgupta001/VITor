"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LoginButton from "@/components/LoginButton";

export default function HomePage() {
  const [faculties, setFaculties] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/faculties")
      .then(res => res.json())
      .then(data => {
        setFaculties(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const filteredFaculties = faculties.filter(f =>
    `${f.name} ${f.department}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  if (loading) {
    return <div style={{ padding: 40 }}>Loading faculties...</div>;
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24
        }}
      >
        <h1 style={{ fontSize: 32, fontWeight: 700 }}>VITor</h1>
        <LoginButton />
      </div>

      {/* SEARCH BOX */}
      <input
        type="text"
        placeholder="Search by faculty name or department..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{
          width: "100%",
          padding: "12px 16px",
          fontSize: 16,
          borderRadius: 10,
          border: "1px solid #d1d5db",
          marginBottom: 24
        }}
      />

      <p style={{ marginBottom: 16, color: "#555" }}>
        Showing {filteredFaculties.length} of {faculties.length} faculties
      </p>

      {/* GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 20
        }}
      >
        {filteredFaculties.map(f => (
          <Link
            key={f.id}
            href={`/faculty/${f.id}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                overflow: "hidden",
                background: "#fff",
                boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
                transition: "transform 0.2s"
              }}
            >
              {/* IMAGE */}
              <div
                style={{
                  height: 220,
                  width: "100%",
                  overflow: "hidden",
                  background: "#f3f4f6"
                }}
              >
                <img
                  src={f.photo}
                  alt={f.name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block"
                  }}
                />
              </div>

              {/* TEXT */}
              <div style={{ padding: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>
                  {f.name}
                </h2>

                <p style={{ fontSize: 13, color: "#444", marginTop: 6 }}>
                  {f.designation}
                </p>

                <p style={{ fontSize: 12, color: "#777", marginTop: 6 }}>
                  {f.department}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
