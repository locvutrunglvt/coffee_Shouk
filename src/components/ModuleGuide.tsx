"use client";

import { useMemo, useRef, useState } from "react";
import {
  Bot,
  BookOpenCheck,
  Lightbulb,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { useT } from "@/components/I18nProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  answerTaOiQuestion,
  buildWelcomeGuideMessage,
  fetchTaOiLiveContext,
  getTaOiQuickQuestions,
  type GuideKey,
  type TaOiLiveContext,
} from "@/lib/ai/knowledgeEngine";

interface ModuleGuideProps {
  guideKey: GuideKey;
}

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
}

const PROXY_STORAGE_KEY = "taoi_ai_proxy";
let nextMsgSeq = 0;
function nextMessageId(prefix: string): string {
  nextMsgSeq += 1;
  return `${prefix}-${nextMsgSeq}`;
}

export function ModuleGuide({ guideKey }: ModuleGuideProps) {
  const { t, locale } = useT();
  const guide = t.guides[guideKey];

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "guide">("chat");
  const [liveCtx, setLiveCtx] = useState<TaOiLiveContext | null>(null);
  const [loadingCtx, setLoadingCtx] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);

  const [showProxyPanel, setShowProxyPanel] = useState(false);
  const [proxyUrl, setProxyUrl] = useState<string>(() =>
    typeof window !== "undefined"
      ? (window.localStorage.getItem(PROXY_STORAGE_KEY) || "").trim()
      : ""
  );
  const [proxyDraft, setProxyDraft] = useState<string>(() =>
    typeof window !== "undefined"
      ? (window.localStorage.getItem(PROXY_STORAGE_KEY) || "").trim()
      : ""
  );

  const listRef = useRef<HTMLDivElement | null>(null);

  const quickQuestions = useMemo(() => getTaOiQuickQuestions(t), [t]);
  const welcomeText = useMemo(
    () => buildWelcomeGuideMessage(liveCtx, locale, guideKey, t),
    [liveCtx, locale, guideKey, t]
  );

  async function refreshLiveContext(): Promise<TaOiLiveContext> {
    setLoadingCtx(true);
    try {
      const ctx = await fetchTaOiLiveContext(locale);
      setLiveCtx(ctx);
      return ctx;
    } finally {
      setLoadingCtx(false);
    }
  }

  function openPopup() {
    setOpen(true);
    if (!liveCtx && !loadingCtx) {
      void refreshLiveContext();
    }
  }

  function scrollToBottom() {
    window.setTimeout(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    }, 30);
  }

  async function askQuestion(rawQuestion: string) {
    const q = rawQuestion.trim();
    if (!q || sending) return;

    setActiveTab("chat");
    setInputText("");
    const userId = nextMessageId("u");
    const botId = nextMessageId("b");

    setMessages((prev) => [...prev, { id: userId, role: "user", text: q }]);
    scrollToBottom();

    const activeCtx = liveCtx ?? (await refreshLiveContext());
    const activeProxy = proxyUrl.trim();

    if (!activeProxy) {
      const localReply = answerTaOiQuestion(q, activeCtx, locale, guideKey, t);
      setMessages((prev) => [
        ...prev,
        { id: botId, role: "bot", text: localReply },
      ]);
      scrollToBottom();
      return;
    }

    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: botId, role: "bot", text: t.ai.proxyPendingMsg },
    ]);
    scrollToBottom();

    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 15000);
      const res = await fetch(activeProxy, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          question: q,
          locale,
          guideKey,
          context: activeCtx,
        }),
      });
      window.clearTimeout(timer);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { answer?: string; reply?: string };
      const reply =
        (data.answer || data.reply || "").trim() ||
        answerTaOiQuestion(q, activeCtx, locale, guideKey, t);

      setMessages((prev) =>
        prev.map((m) => (m.id === botId ? { ...m, text: reply } : m))
      );
    } catch {
      const fallbackReply =
        `${t.ai.proxyFallbackPrefix}\n\n` +
        answerTaOiQuestion(q, activeCtx, locale, guideKey, t);
      setMessages((prev) =>
        prev.map((m) => (m.id === botId ? { ...m, text: fallbackReply } : m))
      );
    } finally {
      setSending(false);
      scrollToBottom();
    }
  }

  function handleSaveProxy() {
    const clean = proxyDraft.trim();
    if (clean) {
      window.localStorage.setItem(PROXY_STORAGE_KEY, clean);
    } else {
      window.localStorage.removeItem(PROXY_STORAGE_KEY);
    }
    setProxyUrl(clean);
    setShowProxyPanel(false);
    setMessages((prev) => [
      ...prev,
      {
        id: nextMessageId("sys"),
        role: "bot",
        text: clean ? t.ai.proxySavedMsg : t.ai.proxyClearedMsg,
      },
    ]);
    scrollToBottom();
  }

  function handleClearProxy() {
    window.localStorage.removeItem(PROXY_STORAGE_KEY);
    setProxyUrl("");
    setProxyDraft("");
    setShowProxyPanel(false);
    setMessages((prev) => [
      ...prev,
      { id: nextMessageId("sys"), role: "bot", text: t.ai.proxyClearedMsg },
    ]);
    scrollToBottom();
  }

  return (
    <>
      {/* Shrunk single tactile AI + Guide floating icon button */}
      <button
        type="button"
        onClick={openPopup}
        title={t.ai.fabTooltip}
        aria-label={t.ai.fabTooltip}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 w-12 h-12 rounded-2xl btn-3d-green flex items-center justify-center cursor-pointer"
      >
        <Bot className="w-6 h-6 text-white" />
        <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-amber-400 text-[#14532D] text-[10px] font-black border border-white shadow-xs leading-none">
          {t.ai.badgeLabel}
        </span>
      </button>

      {/* AI + Step-by-Step Guide Popup */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full sm:max-w-xl h-[86vh] sm:h-[82vh] sm:max-h-[680px] flex flex-col rounded-t-3xl sm:rounded-3xl border-2 border-[#86EFAC] bg-[#F4FDF7] shadow-2xl overflow-hidden">
            {/* Popup Header */}
            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-gradient-to-r from-[#15803D] to-[#22C55E] text-white shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-amber-200" />
                </div>
                <div className="min-w-0">
                  <p className="font-extrabold text-sm sm:text-base truncate">
                    {t.ai.modalTitle}
                  </p>
                  <p className="text-[11px] text-emerald-100 truncate">
                    {proxyUrl ? t.ai.modeProxy : t.ai.modeLocal}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void refreshLiveContext()}
                  disabled={loadingCtx}
                  title={t.ai.refreshDataBtn}
                  className="p-2 rounded-xl bg-white/15 hover:bg-white/25 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${loadingCtx ? "animate-spin" : ""}`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setShowProxyPanel((v) => !v)}
                  title={t.ai.proxyBtn}
                  className="p-2 rounded-xl bg-white/15 hover:bg-white/25 transition-colors cursor-pointer"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t.common.close}
                  className="p-2 rounded-xl bg-white/15 hover:bg-white/25 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sub-bar: Mode Tabs + LA/EN/VN Switcher */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#E6F8ED] border-b border-[#BCE8C8] flex-wrap shrink-0">
              <div className="inline-flex rounded-xl bg-white/80 border border-[#BCE8C8] p-0.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActiveTab("chat")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    activeTab === "chat"
                      ? "bg-[#16A34A] text-white shadow-xs"
                      : "text-[#14532D] hover:bg-[#EAFBF0]"
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>{t.ai.tabChat}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("guide")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    activeTab === "guide"
                      ? "bg-[#16A34A] text-white shadow-xs"
                      : "text-[#14532D] hover:bg-[#EAFBF0]"
                  }`}
                >
                  <BookOpenCheck className="w-3.5 h-3.5" />
                  <span>{t.ai.tabGuide}</span>
                </button>
              </div>

              <LanguageSwitcher compact />
            </div>

            {/* Optional Admin Proxy Panel */}
            {showProxyPanel && (
              <div className="px-4 py-3 bg-[#FFFBEB] border-b border-[#FDE68A] space-y-2 shrink-0">
                <p className="text-xs font-bold text-[#78350F]">
                  {t.ai.proxyTitle}
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={proxyDraft}
                    onChange={(e) => setProxyDraft(e.target.value)}
                    placeholder={t.ai.proxyPlaceholder}
                    className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-[#FCD34D] bg-white focus:outline-none focus:border-[#16A34A]"
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={handleClearProxy}
                      className="px-3 py-1.5 rounded-xl border border-[#D1D5DB] bg-white text-xs font-bold text-gray-700 cursor-pointer"
                    >
                      {t.ai.clearProxy}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveProxy}
                      className="px-3 py-1.5 rounded-xl bg-[#16A34A] text-white text-xs font-bold cursor-pointer"
                    >
                      {t.ai.saveProxy}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Main Body */}
            {activeTab === "guide" ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="rounded-2xl border border-[#BCE8C8] bg-white p-4 space-y-3 shadow-xs">
                  <div className="flex items-center gap-2 text-[#14532D] font-extrabold text-base">
                    <BookOpenCheck className="w-5 h-5 text-[#16A34A] shrink-0" />
                    <h3>{guide.title}</h3>
                  </div>
                  <ol className="space-y-2.5">
                    {guide.steps.map((step, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-3 text-sm text-[#143321]"
                      >
                        <span className="w-6 h-6 rounded-full bg-gradient-to-br from-[#22C55E] to-[#16A34A] text-white text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                          {idx + 1}
                        </span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>

                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#FEFCE8] border border-[#FDE047] text-xs sm:text-sm text-[#713F12]">
                    <Lightbulb className="w-4 h-4 text-[#CA8A04] shrink-0 mt-0.5" />
                    <span>
                      <strong>{t.guides.tipLabel}:</strong> {guide.tip}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void askQuestion(t.ai.quickPromptGuide)}
                  className="w-full py-2.5 px-4 rounded-2xl btn-3d-green text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{t.ai.askAiThisScreen}</span>
                </button>
              </div>
            ) : (
              <>
                {/* Quick Question Chips */}
                <div className="px-3 py-2 bg-white/75 border-b border-[#DDF3E4] flex gap-1.5 flex-wrap shrink-0">
                  {quickQuestions.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      disabled={sending}
                      onClick={() => void askQuestion(chip.q)}
                      className="px-2.5 py-1 rounded-full bg-[#EAFBF0] hover:bg-[#D1FAE5] border border-[#A7E3BE] text-[11px] font-bold text-[#14532D] transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                {/* Chat Messages */}
                <div
                  ref={listRef}
                  className="flex-1 overflow-y-auto p-3.5 space-y-3"
                >
                  <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-white border border-[#BCE8C8] px-3.5 py-2.5 text-sm text-[#143321] whitespace-pre-line leading-relaxed shadow-xs">
                    {welcomeText}
                  </div>

                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${
                        m.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-line leading-relaxed shadow-xs ${
                          m.role === "user"
                            ? "rounded-tr-sm bg-[#16A34A] text-white font-medium"
                            : "rounded-tl-sm bg-white border border-[#BCE8C8] text-[#143321]"
                        }`}
                      >
                        {m.text}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Question Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void askQuestion(inputText);
                  }}
                  className="p-3 bg-white border-t border-[#CDE9D5] flex items-center gap-2 shrink-0"
                >
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={t.ai.inputPlaceholder}
                    className="flex-1 px-3.5 py-2 text-sm rounded-xl border-2 border-[#BCE8C8] bg-[#F8FEFA] focus:outline-none focus:border-[#16A34A]"
                  />
                  <button
                    type="submit"
                    disabled={sending || !inputText.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl btn-3d-green text-sm font-bold cursor-pointer disabled:opacity-55"
                  >
                    <Send className="w-4 h-4" />
                    <span className="hidden sm:inline">{t.ai.sendBtn}</span>
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
