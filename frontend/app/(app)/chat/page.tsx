"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { ChatSession } from "@/types";
import { Button } from "@/components/ui/button";
import { Send, Bot, User, Anchor, Plus, Trash2, MessageSquare, TrendingDown, BarChart2, Ship, AlertTriangle, Clock, GitCompare } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatDistanceToNow } from "date-fns";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED = [
  { icon: TrendingDown, text: "Which vessel has the lowest VHI score?" },
  { icon: AlertTriangle, text: "What are the most frequent deficiencies?" },
  { icon: GitCompare, text: "Compare MV Atlantic Star and MV Baltic Arrow" },
  { icon: BarChart2, text: "Which category has the worst performance?" },
  { icon: Clock, text: "Are there any pending inspections?" },
  { icon: Ship, text: "Show fleet health summary" },
];

function StreamingCursor() {
  return (
    <span className="inline-block w-1.5 h-3.5 bg-blue-400 rounded-sm align-middle ml-0.5 animate-pulse" />
  );
}

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.get<ChatSession[]>("/api/chat/sessions")
      .then(setSessions)
      .finally(() => setSessionsLoading(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    const data = await api.get<{ messages: Message[] }>(`/api/chat/sessions/${sessionId}`);
    setMessages(data.messages);
  };

  const newChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
    textareaRef.current?.focus();
  };

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await api.delete(`/api/chat/sessions/${sessionId}`);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) newChat();
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    let assistantContent = "";
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      const sessionId = await api.stream(
        "/api/chat",
        { messages: newMessages, session_id: activeSessionId },
        (chunk) => {
          assistantContent += chunk;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: assistantContent };
            return updated;
          });
        }
      );

      if (sessionId && !activeSessionId) {
        setActiveSessionId(sessionId);
        const updated = await api.get<ChatSession[]>("/api/chat/sessions");
        setSessions(updated);
      } else if (activeSessionId) {
        setSessions(prev => prev.map(s =>
          s.id === activeSessionId ? { ...s, message_count: s.message_count + 2 } : s
        ));
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "Sorry, I encountered an error. Please try again." };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isStreaming = loading && messages.length > 0 && messages[messages.length - 1].role === "assistant";

  return (
    <div className="flex h-screen">
      {/* Sessions sidebar */}
      <div className="w-60 border-r border-slate-200 bg-slate-50/60 flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-slate-200">
          <button
            onClick={newChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {sessionsLoading ? (
            <div className="space-y-1.5 p-1">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 bg-slate-200/60 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-5 h-5 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No previous chats</p>
            </div>
          ) : (
            sessions.map(s => (
              <div
                key={s.id}
                onClick={() => loadSession(s.id)}
                className={`group flex items-start gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-xs transition-colors ${
                  activeSessionId === s.id
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <MessageSquare className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${activeSessionId === s.id ? "text-blue-500" : "text-slate-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium leading-snug">{s.title}</p>
                  <p className="text-slate-400 mt-0.5 text-[10px]">
                    {formatDistanceToNow(new Date(s.updated_at), { addSuffix: true })}
                  </p>
                </div>
                <button
                  onClick={(e) => deleteSession(s.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all flex-shrink-0 mt-0.5"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex flex-col flex-1 min-w-0 bg-white">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h1 className="text-base font-semibold text-slate-900">AI Assistant</h1>
          <p className="text-xs text-slate-400 mt-0.5">Ask questions about your fleet&apos;s inspection data</p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-lg mx-auto">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 ring-1 ring-blue-100">
                <Anchor className="w-7 h-7 text-blue-500" />
              </div>
              <h3 className="text-base font-semibold text-slate-800 mb-1">MarinePulse AI</h3>
              <p className="text-slate-400 text-sm max-w-xs mb-6 leading-relaxed">
                Ask me anything about VHI scores, deficiencies, inspection trends, or vessel performance.
              </p>
              <div className="grid grid-cols-2 gap-2 w-full max-w-md">
                {SUGGESTED.map(({ icon: Icon, text }) => (
                  <button
                    key={text}
                    onClick={() => sendMessage(text)}
                    className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-blue-200 text-left transition-colors group"
                  >
                    <div className="w-6 h-6 bg-blue-50 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-blue-100 transition-colors">
                      <Icon className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                    <span className="text-xs text-slate-600 leading-snug font-medium">{text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => {
              const isLastAssistant = i === messages.length - 1 && msg.role === "assistant";
              const showCursor = isStreaming && isLastAssistant && msg.content === "";
              return (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-tr-sm"
                        : "bg-slate-50 border border-slate-200 text-slate-700 rounded-tl-sm"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none prose-slate prose-table:text-xs prose-th:font-semibold prose-td:py-1">
                        {msg.content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        ) : (
                          showCursor ? <StreamingCursor /> : null
                        )}
                        {isStreaming && isLastAssistant && msg.content && <StreamingCursor />}
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="flex-shrink-0 px-6 pb-6 pt-3 border-t border-slate-100">
          <div className="flex items-end gap-0 border border-slate-300 rounded-xl bg-white shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/15 transition-all">
            <textarea
              ref={textareaRef}
              placeholder="Ask about vessel health, deficiencies, inspection trends…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              disabled={loading}
              className="flex-1 resize-none text-sm bg-transparent outline-none px-4 py-3 text-slate-800 placeholder:text-slate-400 disabled:opacity-50"
            />
            <div className="flex-shrink-0 p-2">
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg flex items-center justify-center transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2 text-center">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
}
