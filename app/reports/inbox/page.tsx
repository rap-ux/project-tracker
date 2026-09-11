import { redirect } from "next/navigation";
// Inbox folded into the Uploads tab (drafts are listed first there).
export default function InboxRedirect() {
  redirect("/reports/uploads?filter=drafts");
}
