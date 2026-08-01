import { redirect } from "next/navigation";

// WebUI は standalone デザイン HTML を100%適用する
export default function RootPage() {
  redirect("/standalone.html");
}
