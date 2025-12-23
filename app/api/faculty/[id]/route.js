import { NextResponse } from "next/server";
import faculties from "@/data/faculties.json";

export async function GET(req, { params }) {
  const { id } = await params; 

  const faculty = faculties.find(
    f => String(f.id) === String(id)
  );

  if (!faculty) {
    return NextResponse.json(
      { error: "Faculty not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    faculty,
    reviews: []
  });
}
