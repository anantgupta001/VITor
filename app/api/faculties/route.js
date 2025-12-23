import { NextResponse } from "next/server";
import faculties from "@/data/faculties.json";

export async function GET() {
  return NextResponse.json(faculties);
}
