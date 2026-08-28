import { PawPrint } from "lucide-react";

function getOAuthUrl() {
  const kimiAuthUrl = import.meta.env.VITE_KIMI_AUTH_URL;
  const appID = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${kimiAuthUrl}/api/oauth/authorize`);
  url.searchParams.set("client_id", appID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "profile");
  url.searchParams.set("state", state);

  return url.toString();
}

export default function Login() {
  return (
    <div className="min-h-dvh bg-[#F5F0E1] text-[#264653] flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-[#FFFDF6] rounded-[2rem] p-8 shadow-sm shadow-[#264653]/5 text-center">
        <div className="w-16 h-16 rounded-full bg-[#F4A261]/15 flex items-center justify-center mx-auto mb-4">
          <PawPrint size={30} className="text-[#F4A261]" />
        </div>
        <h1 className="text-2xl font-bold">小狗的小日子</h1>
        <p className="text-sm text-[#264653]/55 mt-2 leading-relaxed">
          记录它的每一餐、每一次遛弯、每一天的可爱。<br />
          登录后数据保存在云端，换手机也不丢。
        </p>
        <button
          className="mt-6 w-full bg-[#F4A261] text-white font-bold rounded-2xl py-3.5 active:scale-[0.98] transition"
          onClick={() => {
            window.location.href = getOAuthUrl();
          }}
        >
          使用 Kimi 账号登录
        </button>
      </div>
    </div>
  );
}
