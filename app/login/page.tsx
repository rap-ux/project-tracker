import { Suspense } from "react";
import LoginForm    from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4 py-8" style={{ backgroundColor: "#101010" }}>
      <Suspense fallback={
        <div className="w-full max-w-sm mx-auto bg-white rounded-2xl shadow-2xl p-7 text-center text-sm text-gray-400">
          Loading…
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
