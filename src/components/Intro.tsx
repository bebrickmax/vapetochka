import { LOGO_VIEWBOX, MARK_PATH, WORDMARK_PATH } from "@/config/logo";

/**
 * Заставка при входе: знак-«точка» всплывает, рядом выезжает надпись,
 * затем логотип увеличивается и растворяется — открывается сайт.
 * Чистый CSS (стили — .intro в globals.css), сайт под ней грузится параллельно.
 * Показывается один раз за визит: скрипт INTRO_SCRIPT ставит класс no-intro.
 */
export function Intro() {
  return (
    <div className="intro" aria-hidden>
      <svg className="intro-logo" viewBox={LOGO_VIEWBOX} fill="#ffffff">
        <path className="intro-mark" fillRule="evenodd" d={MARK_PATH} />
        <path className="intro-word" fillRule="evenodd" d={WORDMARK_PATH} />
      </svg>
    </div>
  );
}

/** Выполняется до отрисовки: повторно за визит заставку не показываем. */
export const INTRO_SCRIPT = `try{var s=window.sessionStorage;if(s.getItem("vt:intro"))document.documentElement.classList.add("no-intro");else s.setItem("vt:intro","1")}catch(e){}`;
