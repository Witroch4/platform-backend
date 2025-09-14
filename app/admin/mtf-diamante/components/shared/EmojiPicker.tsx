"use client";

import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search, Smile, Camera, Heart, Flag, Clock } from "lucide-react";

// Local storage key for recently used emojis
const RECENT_EMOJIS_KEY = "emoji-picker-recent-emojis";
const MAX_RECENT_EMOJIS = 16;

// Utility functions for managing recently used emojis
const getRecentEmojis = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const addToRecentEmojis = (emoji: string): void => {
  if (typeof window === "undefined") return;
  try {
    const recent = getRecentEmojis();
    const filtered = recent.filter((e) => e !== emoji);
    const updated = [emoji, ...filtered].slice(0, MAX_RECENT_EMOJIS);
    localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(updated));
  } catch {
    // Silently fail if localStorage is not available
  }
};

// Categorias de emojis organizadas como no WhatsApp
const EMOJI_CATEGORIES = {
  recent: {
    icon: Clock,
    name: "Recently Used",
    emojis: [], // Will be populated dynamically
  },
  smileys: {
    icon: Smile,
    name: "Smileys & People",
    emojis: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😆",
      "😅",
      "🤣",
      "😂",
      "🙂",
      "🙃",
      "😉",
      "😊",
      "😇",
      "🥰",
      "😍",
      "🤩",
      "😘",
      "😗",
      "☺️",
      "😚",
      "😙",
      "🥲",
      "😋",
      "😛",
      "😜",
      "🤪",
      "😝",
      "🤑",
      "🤗",
      "🤭",
      "🤫",
      "🤔",
      "🤐",
      "🤨",
      "😐",
      "😑",
      "😶",
      "😏",
      "😒",
      "🙄",
      "😬",
      "🤥",
      "😔",
      "😪",
      "🤤",
      "😴",
      "😷",
      "🤒",
      "🤕",
      "🤢",
      "🤮",
      "🤧",
      "🥵",
      "🥶",
      "🥴",
      "😵",
      "🤯",
      "🤠",
      "🥳",
      "🥸",
      "😎",
      "🤓",
      "🧐",
      "😕",
      "😟",
      "🙁",
      "☹️",
      "😮",
      "😯",
      "😲",
      "😳",
      "🥺",
      "😦",
      "😧",
      "😨",
      "😰",
      "😥",
      "😢",
      "😭",
      "😱",
      "😖",
      "😣",
      "😞",
      "😓",
      "😩",
      "😫",
      "🥱",
      "😤",
      "😡",
      "😠",
      "🤬",
      "😈",
      "👿",
      "💀",
      "☠️",
      "💩",
      "🤡",
      "👹",
      "👺",
      "👻",
      "👽",
      "👾",
      "🤖",
      "😺",
      "😸",
      "😹",
      "😻",
      "😼",
      "😽",
      "🙀",
      "😿",
      "😾",
    ],
  },
  gestures: {
    icon: Heart,
    name: "Gestures & Body",
    emojis: [
      "👋",
      "🤚",
      "🖐️",
      "✋",
      "🖖",
      "👌",
      "🤌",
      "🤏",
      "✌️",
      "🤞",
      "🤟",
      "🤘",
      "🤙",
      "👈",
      "👉",
      "👆",
      "🖕",
      "👇",
      "☝️",
      "👍",
      "👎",
      "👊",
      "✊",
      "🤛",
      "🤜",
      "👏",
      "🙌",
      "👐",
      "🤲",
      "🤝",
      "🙏",
      "✍️",
      "💅",
      "🤳",
      "💪",
      "🦾",
      "🦿",
      "🦵",
      "🦶",
      "👂",
      "🦻",
      "👃",
      "🧠",
      "🫀",
      "🫁",
      "🦷",
      "🦴",
      "👀",
      "👁️",
      "👅",
      "👄",
      "💋",
      "🩸",
    ],
  },
  objects: {
    icon: Camera,
    name: "Objects",
    emojis: [
      "💌",
      "💎",
      "🔪",
      "🏺",
      "🗺️",
      "🧭",
      "🧱",
      "💈",
      "🦽",
      "🦼",
      "🛴",
      "🚲",
      "🛵",
      "🏍️",
      "🚗",
      "🚕",
      "🚙",
      "🚐",
      "🛻",
      "🚚",
      "🚛",
      "🚜",
      "🏎️",
      "🚓",
      "🚑",
      "🚒",
      "🚐",
      "🛺",
      "🚨",
      "🚔",
      "🚍",
      "🚘",
      "🚖",
      "🚡",
      "🚠",
      "🚟",
      "🚃",
      "🚋",
      "🚞",
      "🚝",
      "🚄",
      "🚅",
      "🚈",
      "🚂",
      "🚆",
      "🚇",
      "🚊",
      "🚉",
      "✈️",
      "🛫",
      "🛬",
      "🛩️",
      "💺",
      "🛰️",
      "🚀",
      "🛸",
      "🚁",
      "🛶",
      "⛵",
      "🚤",
    ],
  },
  symbols: {
    icon: Flag,
    name: "Symbols",
    emojis: [
      "❤️",
      "🧡",
      "💛",
      "💚",
      "💙",
      "💜",
      "🖤",
      "🤍",
      "🤎",
      "💔",
      "❣️",
      "💕",
      "💞",
      "💓",
      "💗",
      "💖",
      "💘",
      "💝",
      "💟",
      "☮️",
      "✝️",
      "☪️",
      "🕉️",
      "☸️",
      "✡️",
      "🔯",
      "🕎",
      "☯️",
      "☦️",
      "🛐",
      "⛎",
      "♈",
      "♉",
      "♊",
      "♋",
      "♌",
      "♍",
      "♎",
      "♏",
      "♐",
      "♑",
      "♒",
      "♓",
      "🆔",
      "⚛️",
      "🉑",
      "☢️",
      "☣️",
      "📴",
      "📳",
      "🈶",
      "🈚",
      "🈸",
      "🈺",
      "🈷️",
      "✴️",
      "🆚",
      "💮",
      "🉐",
      "㊙️",
      "㊗️",
      "🈴",
      "🈵",
      "🈹",
      "🈲",
      "🅰️",
      "🅱️",
      "🆎",
      "🆑",
      "🅾️",
    ],
  },
};

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

export function EmojiPicker({
  onEmojiSelect,
  onClose,
  isOpen,
}: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState("recent");
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredEmojis, setFilteredEmojis] = useState<string[]>([]);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Load recent emojis on mount
  useEffect(() => {
    const recent = getRecentEmojis();
    setRecentEmojis(recent);
    // If no recent emojis, default to smileys category
    if (recent.length === 0) {
      setActiveCategory("smileys");
    }
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const allEmojis = Object.values(EMOJI_CATEGORIES).flatMap(
        (cat) => cat.emojis
      );
      setFilteredEmojis(
        allEmojis.filter(
          (emoji) =>
            emoji.includes(searchTerm) ||
            getEmojiName(emoji).toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    } else {
      setFilteredEmojis([]);
    }
  }, [searchTerm]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const getEmojiName = (emoji: string) => {
    // Mapeamento básico de emojis para nomes (pode ser expandido)
    const emojiNames: Record<string, string> = {
      "😀": "grinning face",
      "😃": "grinning face with big eyes",
      "😄": "grinning face with smiling eyes",
      "❤️": "red heart",
      "💙": "blue heart",
      "💚": "green heart",
      "👍": "thumbs up",
      "👎": "thumbs down",
      "🔥": "fire",
      "💯": "hundred points",
    };
    return emojiNames[emoji] || emoji;
  };

  const handleEmojiSelect = (emoji: string) => {
    // Add to recent emojis if it's not the special TEXT_RESPONSE
    if (emoji !== "TEXT_RESPONSE") {
      addToRecentEmojis(emoji);
      setRecentEmojis(getRecentEmojis());
    }
    onEmojiSelect(emoji);
    onClose();
  };

  if (!isOpen) return null;

  // Get current emojis based on active category
  const getCurrentEmojis = () => {
    if (searchTerm) {
      return filteredEmojis;
    }

    if (activeCategory === "recent") {
      return recentEmojis;
    }

    return (
      EMOJI_CATEGORIES[activeCategory as keyof typeof EMOJI_CATEGORIES]
        ?.emojis || []
    );
  };

  const currentEmojis = getCurrentEmojis();

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
      <div
        ref={pickerRef}
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-96 h-96 flex flex-col border border-gray-200 dark:border-gray-700"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            {/* Botão Responder com Texto */}
            <button
              onClick={() => {
                onEmojiSelect("TEXT_RESPONSE");
                onClose();
              }}
              className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
            >
              Responder com Texto
            </button>

            {/* Botão Transferir para Atendente (Handoff) */}
            <button
              onClick={() => {
                onEmojiSelect("HANDOFF_ACTION");
                onClose();
              }}
              className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            >
              🚨 Transferir para Atendente
            </button>

            <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-2" />

            {/* Categorias de Emoji */}
            {Object.entries(EMOJI_CATEGORIES).map(([key, category]) => {
              const IconComponent = category.icon;
              return (
                <button
                  key={key}
                  onClick={() => {
                    setActiveCategory(key);
                    setSearchTerm("");
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    activeCategory === key
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <IconComponent size={16} />
                </button>
              );
            })}
          </div>
          <button
            onClick={onClose}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white p-1"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500"
              size={16}
            />
            <Input
              type="text"
              placeholder="Pesquisar emoji"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>
        </div>

        {/* Emoji Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-8 gap-2">
            {currentEmojis.map((emoji, index) => (
              <button
                key={`${emoji}-${index}`}
                onClick={() => handleEmojiSelect(emoji)}
                className="w-10 h-10 flex items-center justify-center text-2xl hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title={getEmojiName(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Footer com emojis recentes/populares */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-2">
          <div className="flex justify-center space-x-2">
            {["❤️", "😂", "😍", "👍", "🔥", "💯", "😊", "🎉"].map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleEmojiSelect(emoji)}
                className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
