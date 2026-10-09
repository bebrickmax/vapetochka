"use client";

import { useRef } from "react";
import { CloseIcon, SearchIcon } from "./icons";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(event) => {
        event.preventDefault();
        inputRef.current?.blur(); // прячем клавиатуру на телефоне
      }}
    >
      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Бренд, вкус, крепость…"
        aria-label="Поиск по каталогу"
        className="h-12 w-full rounded-2xl border border-line bg-surface-2/90 pl-12 pr-12 text-base text-ink outline-none transition placeholder:text-muted/80 focus:border-neon-violet/60 focus:shadow-[0_0_0_4px] focus:shadow-neon-violet/15"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          aria-label="Очистить поиск"
          className="animate-fade-in absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-xl text-muted transition active:scale-90 active:bg-white/10"
        >
          <CloseIcon width={18} height={18} />
        </button>
      )}
    </form>
  );
}
