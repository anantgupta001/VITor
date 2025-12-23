// scripts/transformFaculty.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 👇 correct absolute paths
const RAW_PATH = path.join(__dirname, "../data/rawFaculty.json");
const OUTPUT_PATH = path.join(__dirname, "../data/faculties.json");

console.log("📥 Reading raw faculty data...");
console.log("RAW PATH:", RAW_PATH);

if (!fs.existsSync(RAW_PATH)) {
  throw new Error("❌ rawFaculty.json not found at expected location");
}

const rawData = JSON.parse(fs.readFileSync(RAW_PATH, "utf8"));

const faculties = rawData.data.map((item) => {
  const a = item.attributes;

  return {
    id: item.id,
    name: a.Name,
    employeeId: a.Employee_Id,
    designation: a.Designation,
    department: a.Department,
    subDepartment: a.sub_department,
    email: a.EMAIL,
    phone: a.Contact_No,
    office: a.Office_Address,
    photo: a.Photo?.data?.attributes?.url || null,
    researchArea: a.Research_area_of_specialization,
    googleScholar: a.Research_google_schloar,
    scopus: a.Research_Scopus_Id,
    vidwan: a.Research_vidwan,
    linkedin: a.LinkedIn,
    patents: a.Patents || [],
    projects: a.Projects || [],
    awards: a.Awards_and_Recognitions || [],
  };
});

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(faculties, null, 2));

console.log("✅ faculties.json generated");
console.log("Total faculties:", faculties.length);
