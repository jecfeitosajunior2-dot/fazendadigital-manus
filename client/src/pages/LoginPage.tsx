import { useState } from "react";
import { useLocation } from "wouter";
import { users } from "@/lib/data";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("pngomes1@gmail.com");
  const [password, setPassword] = useState("123456");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    setTimeout(() => {
      const user = users.find(u => u.email === email && u.password === password);
      if (user) {
        localStorage.setItem("user", JSON.stringify(user));
        setLocation("/admin/overview");
      } else {
        setError("Invalid email or password.");
      }
      setLoading(false);
    }, 300);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(135deg, #2E1B0E 0%, #3C1B00 40%, #1B5E20 100%)" }}
    >
      <div className="w-full max-w-[380px] bg-white rounded-lg shadow-xl p-8">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="material-icons text-[32px]" style={{ color: "#8BC34A" }}>pets</span>
          <span className="text-[22px] font-medium text-gray-800">iRancho</span>
        </div>

        {/* Title */}
        <h1 className="text-[18px] font-medium text-gray-800 text-center mb-6">Sign in</h1>

        {error && (
          <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded text-[12px] text-red-600 flex items-center gap-1.5">
            <span className="material-icons text-[14px]">error_outline</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div className="mb-4">
            <label className="block text-[12px] text-gray-600 mb-1.5 font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(""); }}
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-[13px] text-gray-800 focus:outline-none focus:border-[#8BC34A] transition-colors"
              placeholder="your@email.com"
            />
          </div>

          {/* Password */}
          <div className="mb-4">
            <label className="block text-[12px] text-gray-600 mb-1.5 font-medium">Password</label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-[13px] text-gray-800 focus:outline-none focus:border-[#8BC34A] transition-colors pr-10"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <span className="material-icons text-[18px]">{showPwd ? "visibility_off" : "visibility"}</span>
              </button>
            </div>
          </div>

          {/* Forgot password */}
          <div className="text-right mb-5">
            <a href="#" className="text-[11px] text-gray-500 hover:text-[#8BC34A]">Forgot password?</a>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded text-white font-medium text-[14px] uppercase tracking-wide transition-all disabled:opacity-70"
            style={{ backgroundColor: "#8BC34A" }}
            onMouseOver={e => !loading && (e.currentTarget.style.backgroundColor = "#7CB342")}
            onMouseOut={e => !loading && (e.currentTarget.style.backgroundColor = "#8BC34A")}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="material-icons text-[16px] animate-spin">refresh</span>
                Signing in...
              </span>
            ) : (
              "SIGN IN"
            )}
          </button>
        </form>

        {/* Register link */}
        <p className="text-center mt-5 text-[12px] text-gray-500">
          Don't have an account?{" "}
          <a href="#" className="font-medium" style={{ color: "#8BC34A" }}>Register</a>
        </p>

        {/* Footer */}
        <p className="text-center mt-6 text-[10px] text-gray-400">© 2026 iRancho</p>
      </div>
    </div>
  );
}
