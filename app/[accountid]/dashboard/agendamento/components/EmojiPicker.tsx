// components/agendamento/EmojiPicker.tsx
"use client";

import type React from "react";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

// Lista expandida com dezenas de emojis populares
const emojis = [
  "😀", "😁", "😂", "🤣", "😃", "😄", "😅", "😆", "😉", "😊",
  "😋", "😎", "😍", "😘", "🥰", "😗", "😙", "😚", "🙂", "🤗",
  "🤩", "🤔", "🤨", "😐", "😑", "😶", "🙄", "😏", "😣", "😥",
  "😮", "🤐", "😯", "😪", "😫", "🥱", "😴", "😌", "😛", "😜",
  "😝", "🤤", "😒", "😓", "😔", "😕", "🙃", "🤑", "😲", "☹️",
  "🙁", "😖", "😞", "😟", "😤", "😢", "😭", "😦", "😧", "😨",
  "😩", "🤯", "😬", "😰", "😱", "🥵", "🥶", "😳", "🤪", "😵",
  "😡", "😠", "🤬", "😷", "🤒", "🤕", "🤢", "🤮", "🥴", "😇",
  "🥳", "🥺", "🤠", "😈", "👿", "💀", "☠️", "👻", "👽", "🤖",
  "💩", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾",
  "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "👊", "👏", "🙌",
  "👐", "🙏", "💪", "👀", "👁️", "👅", "👄", "💋", "🧠", "🦷",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
  "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "🎉",
  "✨", "🔥", "🌟", "⭐", "💫", "🌈", "⚡", "☀️", "🌙", "🌍",
];

const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect }) => {
  return (
    <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto p-2 border rounded">
      {emojis.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onSelect(emoji)}
          className="text-2xl focus:outline-none hover:bg-gray-200 p-1 rounded"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};

export default EmojiPicker;
