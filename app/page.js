import { Suspense } from "react";
import CampusSelector from "@/components/CampusSelector";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-10">Loading...</div>}>
      <CampusSelector />
    </Suspense>
  );
}
