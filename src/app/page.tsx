import { redirect } from "next/navigation";

/** The app's entry point is the connect flow (spec's first-visit state). */
export default function Home() {
  redirect("/connect");
}
