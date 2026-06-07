"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Send, Bot, User, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import GlassCard from "@/components/ui/GlassCard";
import RichTextEditor, { getPlainText } from "@/components/ui/RichTextEditor";
import RichTextContent from "@/components/ui/RichTextContent";
import { contentToHtml } from "@/lib/markdown";
import { chatAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { getChatConfig } from "@/lib/chatConfig";

interface Message {
  role: "user" | "assistant";
  content: string;
  rich?: boolean;
}

export default function ChatPage() {
  const { user } = useAuth();
  const chatConfig = useMemo(() => getChatConfig(user?.role), [user?.role]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputHtml, setInputHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([
      { role: "assistant", content: chatConfig.welcome, rich: true },
    ]);
    setInputHtml("");
  }, [chatConfig.welcome]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (plainText?: string) => {
    const msg = plainText || getPlainText(inputHtml);
    if (!msg.trim()) return;

    const userContent = plainText
      ? contentToHtml(plainText)
      : inputHtml || contentToHtml(msg);

    setMessages((prev) => [...prev, { role: "user", content: userContent, rich: true }]);
    setInputHtml("");
    setLoading(true);

    try {
      const { data } = await chatAPI.send(msg);
      const reply = (data.reply || data.response || "").trim();
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: reply || "I received your message but got an empty response. Please try again.",
        rich: true,
      }]);
    } catch {
      toast.error("Chat service unavailable");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I'm unable to connect to the AI service. Please ensure the backend is running.",
          rich: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="page-container chat-shell">
      <div className="shrink-0 min-w-0">
        <h1 className="page-title">{chatConfig.title}</h1>
        <p className="page-subtitle">{chatConfig.subtitle}</p>
      </div>

      <GlassCard className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
        <div className="flex-1 overflow-y-auto space-y-4 p-2">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                ${msg.role === "assistant" ? "bg-aqua text-inverse" : "bg-teal-dark text-inverse"}`}>
                {msg.role === "assistant" ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>
              <div className={`chat-bubble rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm
                ${msg.role === "assistant"
                  ? "bg-cream text-heading border border-aqua/10"
                  : "bg-aqua text-inverse"}`}>
                {msg.rich ? (
                  <RichTextContent
                    content={msg.content}
                    variant={msg.role === "user" ? "on-dark" : "on-light"}
                  />
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
              </div>
            </motion.div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-aqua flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-inverse animate-pulse" />
              </div>
              <div className="bg-cream rounded-2xl px-4 py-3 text-sm text-heading border border-aqua/10">
                Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-aqua/10 pt-4 mt-4">
          <div className="flex flex-wrap gap-2 mb-3">
            {chatConfig.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                disabled={loading}
                className="text-xs px-3 py-1.5 bg-aqua/10 text-teal-dark rounded-full hover:bg-aqua/20 transition-colors font-medium disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex flex-col xs:flex-row gap-2 items-stretch xs:items-end min-w-0">
            <div className="flex-1 min-w-0">
              <RichTextEditor
                value={inputHtml}
                onChange={setInputHtml}
                placeholder={chatConfig.placeholder}
                minHeight="72px"
                disabled={loading}
              />
            </div>
            <button onClick={() => send()} disabled={loading} className="btn-primary px-4 h-[42px] w-full xs:w-auto shrink-0">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
