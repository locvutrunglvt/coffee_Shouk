"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Lock, Mail, User, AlertCircle, CheckCircle2 } from "lucide-react";

interface LoginFormProps {
  isConfigured: boolean;
}

export function LoginForm({ isConfigured }: LoginFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (!isConfigured) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-950 space-y-3">
        <div className="flex items-center gap-2 font-bold text-amber-900">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>Chưa kết nối Supabase</span>
        </div>
        <p className="text-xs leading-relaxed text-amber-900">
          App đã sẵn sàng nhưng cần điền 2 biến môi trường của dự án Supabase để kích hoạt đăng nhập và lưu dữ liệu:
        </p>
        <ol className="list-decimal list-inside text-xs space-y-1.5 text-amber-900">
          <li>
            Tạo project miễn phí trên <strong>supabase.com</strong> và chạy file{" "}
            <code className="bg-amber-100 px-1.5 py-0.5 rounded">supabase/schema.sql</code> trong SQL Editor.
          </li>
          <li>
            Tạo file <code className="bg-amber-100 px-1.5 py-0.5 rounded">.env.local</code> (khi chạy máy tính) hoặc thêm Environment Variables trên <strong>Vercel</strong>:
          </li>
        </ol>
        <pre className="bg-[#231810] text-[#FAF7F2] p-3 rounded-xl text-[11px] overflow-x-auto">
{`NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`}
        </pre>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const supabase = createClient();

      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) {
          setError("Sai email hoặc mật khẩu, vui lòng kiểm tra lại.");
          return;
        }
        router.push("/");
        router.refresh();
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim() || email.split("@")[0],
            },
          },
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }
        if (data.session) {
          router.push("/");
          router.refresh();
        } else {
          setMessage(
            "Đăng ký thành công! Nếu Supabase bật xác nhận email, vui lòng kiểm tra hộp thư hoặc tắt Confirm Email trong Supabase Auth."
          );
          setMode("login");
        }
      }
    } catch {
      setError("Không thể kết nối đến hệ thống xác thực.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 bg-[#F3ECE2] p-1 rounded-xl text-sm font-medium">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError("");
          }}
          className={`py-2 rounded-lg transition-colors cursor-pointer ${
            mode === "login"
              ? "bg-white text-[#4A2C18] shadow-sm font-semibold"
              : "text-[#7B6554]"
          }`}
        >
          Đăng nhập
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setError("");
          }}
          className={`py-2 rounded-lg transition-colors cursor-pointer ${
            mode === "signup"
              ? "bg-white text-[#4A2C18] shadow-sm font-semibold"
              : "text-[#7B6554]"
          }`}
        >
          Tạo tài khoản
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {message && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {mode === "signup" && (
          <div>
            <label className="block text-xs font-medium text-[#4A3828] mb-1">
              Họ và tên
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[#8C7563] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="VD: Nguyễn Văn A"
                className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-[#E7DDD0] bg-white focus:outline-none focus:ring-2 focus:ring-[#C97B36]"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-[#4A3828] mb-1">
            Email đăng nhập
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#8C7563] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ten@quancaphe.com"
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-[#E7DDD0] bg-white focus:outline-none focus:ring-2 focus:ring-[#C97B36]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4A3828] mb-1">
            Mật khẩu
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#8C7563] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-[#E7DDD0] bg-white focus:outline-none focus:ring-2 focus:ring-[#C97B36]"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-xl bg-[#4A2C18] hover:bg-[#3A2212] text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-60"
        >
          {loading
            ? "Đang xử lý..."
            : mode === "login"
            ? "Đăng nhập vào hệ thống"
            : "Đăng ký tài khoản"}
        </button>
      </form>

      {mode === "signup" && (
        <p className="text-[11px] text-[#7B6554] text-center leading-relaxed">
          Tài khoản đăng ký đầu tiên trên hệ thống sẽ tự động được cấp quyền{" "}
          <strong>Chủ quán (Admin)</strong>. Các tài khoản sau sẽ mặc định là{" "}
          <strong>Phục vụ</strong> cho đến khi Chủ quán phân quyền lại.
        </p>
      )}
    </div>
  );
}
