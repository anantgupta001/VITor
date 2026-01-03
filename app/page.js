import { Suspense } from "react";
import HomeClient from "./HomeClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-10">Loading...</div>}>
      <HomeClient />
    </Suspense>
  );
}
