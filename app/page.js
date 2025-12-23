"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LoginButton from "@/components/LoginButton";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function HomePage() {
  const [faculties, setFaculties] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  /* ================= FETCH FACULTIES (FIRESTORE) ================= */
  useEffect(() => {
    const ref = collection(db, "faculties");

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setFaculties(list);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const filteredFaculties = faculties.filter((f) =>
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
          marginBottom: 24,
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
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: "100%",
          padding: "12px 16px",
          fontSize: 16,
          borderRadius: 10,
          border: "1px solid #d1d5db",
          marginBottom: 24,
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
          gap: 20,
        }}
      >
        {filteredFaculties.map((f) => (
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
                transition: "transform 0.2s",
              }}
            >
              {/* IMAGE */}
              <div
                style={{
                  height: 220,
                  width: "100%",
                  overflow: "hidden",
                  background: "#f3f4f6",
                }}
              >
                <img
                  src={f.photo}
                  alt={f.name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
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

                {/* ===== STATS PREVIEW (NEW) ===== */}
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 12,
                    color: "#333",
                  }}
                >
                  <Stat label="Attendance" value={f.avgAttendance} />
                  <Stat label="Correction" value={f.avgCorrection} />
                  <Stat label="Teaching" value={f.avgTeaching} />
                  <Stat
                    label="Approachability"
                    value={f.avgApproachability}
                  />
                </div>

                {/* OVERALL + COUNT */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: "1px solid #eee",
                    fontSize: 13,
                  }}
                >
                  <div>
                    ⭐{" "}
                    {f.avgRating
                      ? f.avgRating.toFixed(1)
                      : "—"}
                  </div>
                  <div style={{ color: "#666" }}>
                    👥 {f.reviewCount || 0}
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ================= SMALL STAT ROW ================= */
function Stat({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: 2,
      }}
    >
      <span style={{ color: "#666" }}>{label}</span>
      <span>{value ? value.toFixed(1) : "—"}</span>
    </div>
  );
}
